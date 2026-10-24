// Runs the parent's own, unmodified `claude` CLI in non-interactive mode, sealed off
// from the parent's setup. The app never reads or handles Claude credentials: it only
// starts the program, which uses its own sign-in.
// Docs: https://code.claude.com/docs/en/headless, https://code.claude.com/docs/en/cli-reference

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, utimesSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { pluginDataDir, sandboxDir } from '../paths.js';
import { SEAL_RULE, scrubText, scrubDeep } from './guard.js';

export type Model = 'sonnet' | 'haiku' | 'opus';

export interface RateLimitInfo {
  status: 'allowed' | 'allowed_warning' | 'rejected';
  resetsAt?: number;
  utilization?: number;
  errorCode?: string;
}

export interface TurnResult {
  ok: boolean;
  text: string;
  structured?: unknown;
  costUsd: number;
  usage: Record<string, unknown>;
  durationMs: number;
  error?: string;
  rateLimit?: RateLimitInfo;
  stopReason?: string | null;
}

export interface RunnerEvents {
  onRateLimit?: (info: RateLimitInfo) => void;
  onRetry?: (event: { attempt: number; error: string; retry_delay_ms: number }) => void;
  onInit?: (init: Record<string, unknown>) => void;
}

// ---------- locating claude ----------

let cachedPath: string | null = null;

export function findClaude(): string | null {
  if (cachedPath && existsSync(cachedPath)) return cachedPath;
  const override = process.env.BWM_CLAUDE_PATH;
  if (override && existsSync(override)) return (cachedPath = override);
  const isWin = process.platform === 'win32';
  // Only the PATH, never the current folder (Windows' "where" looks there first). On Windows
  // only the real .exe: npm's .cmd shims can't be started without a shell.
  const which = spawnSync(isWin ? 'where' : 'which', [isWin ? '$PATH:claude' : 'claude'], { encoding: 'utf8', env: cleanEnv(), windowsHide: true });
  if (which.status === 0) {
    const lines = which.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const pick = isWin ? lines.find((l) => l.toLowerCase().endsWith('.exe')) : lines[0];
    if (pick) return (cachedPath = pick);
  }
  const candidates = isWin
    ? [join(homedir(), '.local', 'bin', 'claude.exe')]
    : [join(homedir(), '.local', 'bin', 'claude'), '/usr/local/bin/claude', '/opt/homebrew/bin/claude'];
  for (const c of candidates) if (existsSync(c)) return (cachedPath = c);
  return null;
}

// Remove every Claude/Anthropic variable so a server launched from inside a Claude Code
// session never rides on that session's sign-in proxy. Kids' runs use only the CLI's
// own stored sign-in.
export function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(CLAUDE|ANTHROPIC)/i.test(k)) continue;
    env[k] = v;
  }
  // Belt and braces next to --safe-mode: no CLAUDE.md, no auto memory, no git notes.
  env.CLAUDE_CODE_DISABLE_CLAUDE_MDS = '1';
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1';
  env.CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS = '1';
  env.IS_DEMO = '1'; // demo mode: hides the account email and organization
  return env;
}

// ---------- isolation ----------

const EMPTY_MCP = JSON.stringify({ mcpServers: {} });

// Named by content, so the same stage prompt (every turn of a stage) reuses one file. They hold
// kids' approved plans, so files unused for a week are deleted (security audit A5).
const PROMPT_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
let promptsPruned = false;
/** Deletes prompt files unused for a week (once per server start, on the first Claude call). */
export function prunePrompts(dir = join(pluginDataDir(), 'prompts')): void {
  let files: string[] = [];
  try { files = readdirSync(dir); } catch { return; }
  for (const f of files) {
    try { if (Date.now() - statSync(join(dir, f)).mtimeMs > PROMPT_KEEP_MS) rmSync(join(dir, f), { force: true }); } catch { /* in use */ }
  }
}
function promptFile(systemPrompt: string): string {
  const dir = join(pluginDataDir(), 'prompts');
  mkdirSync(dir, { recursive: true });
  if (!promptsPruned) { promptsPruned = true; prunePrompts(dir); }
  const file = join(dir, `${createHash('sha256').update(systemPrompt).digest('hex').slice(0, 32)}.txt`);
  if (!existsSync(file)) writeFileSync(file, systemPrompt, 'utf8');
  else try { const now = new Date(); utimesSync(file, now, now); } catch { /* fine */ }
  return file;
}

export interface IsolationOptions {
  model: Model;
  systemPrompt: string;
  jsonSchema?: object;
  allowSlashCommands?: boolean; // only for built-in /usage
}

export function isolationArgs(o: IsolationOptions): string[] {
  const args = [
    '-p',
    '--safe-mode', // no CLAUDE.md, hooks, user plugins or MCP, no auto memory; sign-in still works (built-in plugins and bundled skills still load: security audit I1, so no tools below)
    '--model', o.model,
    '--system-prompt-file', promptFile(SEAL_RULE + o.systemPrompt),
    '--tools', '',
    '--strict-mcp-config', '--mcp-config', EMPTY_MCP,
    '--setting-sources', '',
    '--no-session-persistence',
  ];
  if (!o.allowSlashCommands) args.push('--disable-slash-commands');
  if (o.jsonSchema) args.push('--json-schema', JSON.stringify(o.jsonSchema));
  return args;
}

function spawnClaude(args: string[]): ChildProcessWithoutNullStreams {
  const bin = findClaude();
  if (!bin) throw new Error('CLAUDE_NOT_FOUND');
  return spawn(bin, args, { cwd: sandboxDir(), env: cleanEnv(), windowsHide: true });
}

function toTurnResult(msg: any, started: number, rateLimit?: RateLimitInfo): TurnResult {
  const ok = msg.subtype === 'success' && !msg.is_error;
  return {
    ok,
    text: typeof msg.result === 'string' ? scrubText(msg.result) : '',
    structured: scrubDeep(msg.structured_output),
    costUsd: msg.total_cost_usd ?? 0,
    usage: msg.usage ?? {},
    durationMs: Date.now() - started,
    error: ok ? undefined : (msg.terminal_reason || msg.subtype || 'error') + (typeof msg.result === 'string' ? `: ${scrubText(msg.result)}` : ''),
    rateLimit,
    stopReason: msg.stop_reason ?? null,
  };
}

// ---------- long-lived conversation (used only by the E1 isolation test) ----------

export class Conversation {
  private proc: ChildProcessWithoutNullStreams;
  private pending: { resolve: (r: TurnResult) => void; started: number } | null = null;
  private lastRateLimit?: RateLimitInfo;
  private stderr = '';
  private closed = false;
  totalCostUsd = 0;
  init?: Record<string, unknown>;

  constructor(private opts: IsolationOptions & RunnerEvents) {
    const args = [
      ...isolationArgs(opts),
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
    ];
    this.proc = spawnClaude(args);
    this.proc.stderr.on('data', (d) => (this.stderr = (this.stderr + d.toString()).slice(-4000)));
    // A claude that can't start fails the turn, never the whole server (security audit A7).
    this.proc.on('error', (e) => {
      this.closed = true;
      if (this.pending) { this.pending.resolve({ ok: false, text: '', costUsd: 0, usage: {}, durationMs: Date.now() - this.pending.started, error: `claude could not start: ${e.message}` }); this.pending = null; }
    });
    const rl = createInterface({ input: this.proc.stdout });
    rl.on('line', (line) => this.onLine(line));
    this.proc.on('close', (code) => {
      this.closed = true;
      if (this.pending) {
        this.pending.resolve({ ok: false, text: '', costUsd: 0, usage: {}, durationMs: Date.now() - this.pending.started, error: `claude exited (${code}): ${scrubText(this.stderr.slice(-500))}` });
        this.pending = null;
      }
    });
  }

  private onLine(line: string) {
    let msg: any;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.type === 'system' && msg.subtype === 'init') {
      this.init = msg;
      this.opts.onInit?.(msg);
    } else if (msg.type === 'rate_limit_event') {
      this.lastRateLimit = msg.rate_limit_info;
      this.opts.onRateLimit?.(msg.rate_limit_info);
    } else if (msg.type === 'system' && msg.subtype === 'api_retry') {
      this.opts.onRetry?.(msg);
    } else if (msg.type === 'result' && this.pending) {
      const r = toTurnResult(msg, this.pending.started, this.lastRateLimit);
      this.totalCostUsd = msg.total_cost_usd ?? this.totalCostUsd;
      this.pending.resolve(r);
      this.pending = null;
    }
  }

  send(text: string): Promise<TurnResult> {
    if (this.closed) return Promise.resolve({ ok: false, text: '', costUsd: 0, usage: {}, durationMs: 0, error: 'conversation closed' });
    if (this.pending) throw new Error('a turn is already in progress');
    return new Promise((resolve) => {
      this.pending = { resolve, started: Date.now() };
      const line = JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
      this.proc.stdin.write(line + '\n');
    });
  }

  close() {
    if (this.closed) return;
    this.proc.stdin.end();
    setTimeout(() => { if (!this.closed) this.proc.kill('SIGINT'); }, 3000).unref();
  }
}

// ---------- one-shot job (every app call: guide, checks, builder, reporter, /usage) ----------

export interface OneShotOptions extends IsolationOptions, RunnerEvents {
  prompt: string;
  timeoutMs?: number;
  /** The reply's text as it arrives (Claude Code's partial messages), for a progress view. */
  onDelta?: (text: string) => void;
}

export function oneShot(o: OneShotOptions): Promise<TurnResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawnClaude([...isolationArgs(o), '--output-format', 'stream-json', '--verbose', ...(o.onDelta ? ['--include-partial-messages'] : [])]);
    } catch (e) {
      resolve({ ok: false, text: '', costUsd: 0, usage: {}, durationMs: 0, error: (e as Error).message });
      return;
    }
    let result: TurnResult | null = null;
    let lastRateLimit: RateLimitInfo | undefined;
    let stderr = '';
    let done = false;
    const finish = (r: TurnResult) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    const timer = setTimeout(() => proc.kill('SIGINT'), o.timeoutMs ?? 10 * 60_000);
    proc.stderr.on('data', (d) => (stderr = (stderr + d.toString()).slice(-4000)));
    proc.on('error', (e) => finish({ ok: false, text: '', costUsd: 0, usage: {}, durationMs: Date.now() - started, error: `claude could not start: ${e.message}` }));
    createInterface({ input: proc.stdout }).on('line', (line) => {
      let msg: any;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.type === 'system' && msg.subtype === 'init') o.onInit?.(msg);
      else if (msg.type === 'rate_limit_event') { lastRateLimit = msg.rate_limit_info; o.onRateLimit?.(msg.rate_limit_info); }
      else if (msg.type === 'system' && msg.subtype === 'api_retry') o.onRetry?.(msg);
      else if (msg.type === 'result') result = toTurnResult(msg, started, lastRateLimit);
      else if (msg.type === 'stream_event' && o.onDelta && msg.event?.type === 'content_block_delta' && msg.event.delta?.type === 'text_delta' && typeof msg.event.delta.text === 'string') {
        try { o.onDelta(msg.event.delta.text); } catch { /* a progress view never breaks a build */ }
      }
    });
    proc.on('close', (code) => {
      finish(result ?? { ok: false, text: '', costUsd: 0, usage: {}, durationMs: Date.now() - started, error: `claude exited (${code}): ${scrubText(stderr.slice(-500))}` });
    });
    proc.stdin.end(o.prompt);
  });
}
