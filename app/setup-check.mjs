// Checks everything Build With Me needs and prints a JSON report for the setup skill.
//   node setup-check.mjs [--data <plugin data dir>]                 check only
//   node setup-check.mjs --install-packages [--data <dir>]          install/refresh app packages
//   node setup-check.mjs --download-model [--data <dir>]            download the speech model
// It never reads or handles Claude credentials; it only asks the claude program whether it's signed in.

import { existsSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { ROOT, pluginData, familyData, runtimeDir, version, port, cleanEnv, findClaude, health, flag } from './common.mjs';

const DATA = pluginData();
const RUNTIME = runtimeDir(DATA);
const MODEL = 'onnx-community/moonshine-base-ONNX';
const stampFile = join(RUNTIME, '.stamp.json');
const wantStamp = () => ({ version: version(), lock: existsSync(join(ROOT, 'package-lock.json')) ? readFileSync(join(ROOT, 'package-lock.json'), 'utf8').length : 0 });

/** Copies the built app + package files into the runtime folder and installs runtime packages. */
function installPackages() {
  mkdirSync(RUNTIME, { recursive: true });
  for (const f of ['package.json', 'package-lock.json']) cpSync(join(ROOT, f), join(RUNTIME, f));
  rmSync(join(RUNTIME, 'app'), { recursive: true, force: true });
  cpSync(join(ROOT, 'app', 'dist'), join(RUNTIME, 'app', 'dist'), { recursive: true });
  // Windows runs npm.cmd through the shell: one command line (fixed words only), so Node doesn't
  // warn about unescaped arguments in the parent's setup output.
  const args = ['ci', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'];
  const r = process.platform === 'win32'
    ? spawnSync(`npm.cmd ${args.join(' ')}`, { cwd: RUNTIME, stdio: 'inherit', shell: true, env: cleanEnv() })
    : spawnSync('npm', args, { cwd: RUNTIME, stdio: 'inherit', env: cleanEnv() });
  if (r.status !== 0) { console.error('npm ci failed'); process.exit(1); }
  writeFileSync(stampFile, JSON.stringify(wantStamp()));
  console.log('Packages installed.');
}

async function downloadModel() {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = ${JSON.stringify(join(DATA, 'models'))};
    await pipeline('automatic-speech-recognition', ${JSON.stringify(MODEL)}, { dtype: 'fp32', device: 'cpu' });
    console.log('Speech model ready.');`], { cwd: RUNTIME, stdio: 'inherit', env: cleanEnv() });
  process.exit(r.status ?? 1);
}

function portFree(p) {
  return new Promise((resolve) => {
    const s = createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
    s.listen(p, '0.0.0.0');
  });
}

async function check() {
  const items = [];
  const add = (id, ok, detail, fix) => items.push({ id, ok, detail, ...(ok ? {} : { fix }) });

  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 22, `Node.js ${process.versions.node}`, 'Install Node.js 22 or newer (Windows: winget install OpenJS.NodeJS.LTS · Mac: brew install node · or https://nodejs.org).');

  const claude = findClaude();
  if (!claude) add('claude-installed', false, 'The claude command-line tool was not found', 'Install Claude Code with the official installer (Windows PowerShell: irm https://claude.ai/install.ps1 | iex · Mac: curl -fsSL https://claude.ai/install.sh | bash).');
  else {
    add('claude-installed', true, claude);
    // Ask the claude program first (`claude auth status`: no model call; it exits 1 when signed out, so
    // only its answer counts). Only if it can't answer (older Claude Code) read the /usage text instead.
    let signedIn = null;
    try {
      const a = spawnSync(claude, ['auth', 'status'], { encoding: 'utf8', env: cleanEnv({ IS_DEMO: '1' }), cwd: DATA, timeout: 15_000, input: '', windowsHide: true });
      const v = JSON.parse(a.stdout).loggedIn;
      if (typeof v === 'boolean') signedIn = v;
    } catch {}
    if (signedIn === null) {
      const r = spawnSync(claude, ['-p', '/usage', '--safe-mode', '--model', 'haiku', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--no-session-persistence', '--output-format', 'json'],
        { encoding: 'utf8', env: cleanEnv({ IS_DEMO: '1' }), cwd: DATA, timeout: 60_000, input: '' });
      let text = r.stdout || r.stderr || '';
      try { text = JSON.parse(r.stdout).result ?? text; } catch {}
      signedIn = r.status === 0 && !/not logged in|please run \/login/i.test(text);
    }
    add('claude-signed-in', signedIn, signedIn ? 'Signed in' : 'Not signed in', 'The parent opens a terminal, runs `claude`, types /login and finishes sign-in in the browser (Anthropic’s own page), then /exit.');
  }

  const stamp = existsSync(stampFile) ? JSON.parse(readFileSync(stampFile, 'utf8')) : null;
  const want = wantStamp();
  const pkgOk = !!stamp && stamp.version === want.version && stamp.lock === want.lock && existsSync(join(RUNTIME, 'node_modules', 'express'));
  add('packages', pkgOk, pkgOk ? `App packages ready (v${want.version})` : 'App packages missing or out of date', 'Run setup-check.mjs --install-packages (automatic, no approval needed beyond running it).');

  const modelOk = existsSync(join(DATA, 'models', ...MODEL.split('/')));
  add('speech-model', modelOk, modelOk ? 'Speech model downloaded' : 'Speech model not downloaded yet (about 250 MB, once)', 'Run setup-check.mjs --download-model.');

  try { const d = familyData(); accessSync(d, constants.W_OK); add('data-folder', true, d); }
  catch (e) { add('data-folder', false, String(e.message), 'Make sure your home folder is writable (Build With Me keeps its data in <home>/Build With Me).'); }

  const p = port();
  const running = await health(p);
  const free = running || ((await portFree(p)) && (await portFree(p + 1)));
  add('port', free, running ? `Build With Me is already running on ${p}` : free ? `Ports ${p} and ${p + 1} are free` : `Port ${p} or ${p + 1} is used by another program`, `Pick another port: set "settings": {"port": ${p + 10}} in ${join(familyData(), 'family.json')}.`);

  if (process.platform === 'win32') items.push({ id: 'firewall-note', ok: true, detail: 'The first time the app starts, Windows may ask to allow Node.js. Choose Private networks so tablets can connect.' });

  const ok = items.every((i) => i.ok);
  console.log(JSON.stringify({ ok, version: version(), pluginData: DATA, items }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

if (flag('install-packages')) installPackages();
else if (flag('download-model')) await downloadModel();
else await check();
