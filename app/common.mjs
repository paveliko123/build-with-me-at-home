// Shared helpers for the plugin's plain-Node scripts (no dependencies, Node 22+).
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
export const flag = (name) => process.argv.includes(`--${name}`);

/** Plugin private folder: --data, then CLAUDE_PLUGIN_DATA, then a dev folder. */
export function pluginData() {
  const dir = arg('data') || process.env.BWM_PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA || join(tmpdir(), 'build-with-me-dev');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** The family's folder: <home>\Build With Me (kept on uninstall, never synced to a cloud). */
export function familyData() {
  const dir = process.env.BWM_DATA || join(homedir(), 'Build With Me');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const runtimeDir = (data) => join(data, 'runtime');
export const version = () => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
export const port = () => {
  try { return JSON.parse(readFileSync(join(familyData(), 'family.json'), 'utf8')).settings?.port || 4747; } catch { return 4747; }
};

/** Environment without any Claude/Anthropic variables (never ride on a live Claude session). */
export function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(CLAUDE|ANTHROPIC)/i.test(k)) env[k] = v;
  return { ...env, ...extra };
}

export function findClaude() {
  if (process.env.BWM_CLAUDE_PATH && existsSync(process.env.BWM_CLAUDE_PATH)) return process.env.BWM_CLAUDE_PATH;
  const win = process.platform === 'win32';
  const r = spawnSync(win ? 'where' : 'which', ['claude'], { encoding: 'utf8', env: cleanEnv(), windowsHide: true });
  if (r.status === 0) {
    const lines = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const pick = lines.find((l) => l.toLowerCase().endsWith('.exe')) ?? lines[0];
    if (pick) return pick;
  }
  const local = join(homedir(), '.local', 'bin', win ? 'claude.exe' : 'claude');
  return existsSync(local) ? local : null;
}

export async function health(p = port()) {
  return (await healthInfo(p)) !== null;
}

/** The running server's health answer ({ ok, build }) or null if nothing answers. */
export async function healthInfo(p = port()) {
  try { const r = await fetch(`http://127.0.0.1:${p}/api/health`, { signal: AbortSignal.timeout(1500) }); return r.ok ? await r.json() : null; }
  catch { return null; }
}

/** Build id of a built app folder (app/dist/build.json), or null. */
export function buildId(distDir) {
  try { return JSON.parse(readFileSync(join(distDir, 'build.json'), 'utf8')).id; } catch { return null; }
}

export function openBrowser(url) {
  if (process.platform === 'win32') spawnSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore' });
  else spawnSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' });
}
