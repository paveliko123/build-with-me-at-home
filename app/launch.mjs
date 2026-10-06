// Starts Build With Me in the background (if it isn't running) and opens the browser.
//   node launch.mjs [--data <plugin data dir>] [--shortcut] [--no-open]
// Also writes a stable start file in Documents\Build With Me that survives plugin updates
// (the plugin folder moves on every update), and on --shortcut puts it on the desktop.

import { existsSync, mkdirSync, writeFileSync, openSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT, pluginData, familyData, runtimeDir, port, cleanEnv, health, openBrowser, flag, version } from './common.mjs';

const DATA = pluginData();
const RUNTIME = runtimeDir(DATA);
const FAMILY = familyData();
const P = port();
const url = `http://localhost:${P}`;
const win = process.platform === 'win32';

// 1. Is the runtime ready (setup-check --install-packages ran for this version)?
const stampFile = join(RUNTIME, '.stamp.json');
const stamp = existsSync(stampFile) ? JSON.parse(readFileSync(stampFile, 'utf8')) : null;
if (!stamp || stamp.version !== version()) {
  console.log(JSON.stringify({ ok: false, reason: 'setup-needed', message: 'Run /build-with-me:setup first (packages missing or out of date).' }));
  process.exit(1);
}

// 2. Stable start file (pointer to the current plugin location + data folder).
writeFileSync(join(FAMILY, '.app-location.json'), JSON.stringify({ root: ROOT, data: DATA, updated: new Date().toISOString() }, null, 2));
writeFileSync(join(FAMILY, '.launcher.mjs'), `// Written by Build With Me. Starts the app from wherever the plugin currently lives.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const loc = JSON.parse(readFileSync(new URL('./.app-location.json', import.meta.url), 'utf8'));
const r = spawnSync(process.execPath, [loc.root + '/app/launch.mjs', '--data', loc.data], { stdio: 'inherit' });
process.exit(r.status ?? 0);
`);
const startFile = join(FAMILY, win ? 'Start Build With Me.cmd' : 'Start Build With Me.command');
writeFileSync(startFile, win
  ? `@echo off\r\ntitle Build With Me\r\nnode "%~dp0.launcher.mjs"\r\nif errorlevel 1 pause\r\n`
  : `#!/bin/sh\ncd "$(dirname "$0")"\nnode ./.launcher.mjs\n`);
if (!win) chmodSync(startFile, 0o755);

// 3. Desktop shortcut on request.
let shortcut = null;
if (flag('shortcut')) {
  const desktop = join(homedir(), 'Desktop');
  if (win) {
    const lnk = join(desktop, 'Build With Me.lnk');
    const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk.replace(/'/g, "''")}');$s.TargetPath='${startFile.replace(/'/g, "''")}';$s.WorkingDirectory='${FAMILY.replace(/'/g, "''")}';$s.WindowStyle=7;$s.Description='Build With Me at Home';$s.Save()`;
    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
    shortcut = r.status === 0 ? lnk : null;
  } else if (existsSync(desktop)) {
    const target = join(desktop, 'Build With Me.command');
    writeFileSync(target, `#!/bin/sh\nexec "${startFile}"\n`); chmodSync(target, 0o755);
    shortcut = target;
  }
}

// 4. Start the server if it isn't running. Detached, so it keeps running after Claude Code closes.
let started = false;
if (!(await health(P))) {
  mkdirSync(DATA, { recursive: true });
  const log = openSync(join(DATA, 'server.log'), 'a');
  const child = spawn(process.execPath, [join(RUNTIME, 'app', 'dist', 'server', 'main.mjs')], {
    cwd: RUNTIME, detached: true, windowsHide: true, stdio: ['ignore', log, log],
    env: cleanEnv({ BWM_PLUGIN_DATA: DATA, BWM_PORT: String(P), BWM_LAUNCHED: '1' }),
  });
  child.unref();
  for (let i = 0; i < 60 && !(await health(P)); i++) await new Promise((r) => setTimeout(r, 500));
  started = true;
}
const running = await health(P);
if (running && !flag('no-open') && !process.env.BWM_NO_OPEN) openBrowser(url);
console.log(JSON.stringify({ ok: running, started, url, startFile, shortcut, log: join(DATA, 'server.log') }, null, 2));
process.exitCode = running ? 0 : 1;
