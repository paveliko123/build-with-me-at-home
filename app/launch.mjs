// Starts Build With Me in the background (if it isn't running) and opens the browser.
//   node launch.mjs [--data <plugin data dir>] [--no-shortcut] [--no-open]
// Also: refreshes the runtime copy of the app when the plugin has a newer build (and restarts
// an outdated server), writes a stable start file in the family folder (<home>\Build With Me) that survives
// plugin updates (the plugin folder moves on every update), and creates a desktop shortcut
// the first time (learner request: no question asked).

import { existsSync, mkdirSync, writeFileSync, openSync, readFileSync, chmodSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT, pluginData, familyData, runtimeDir, port, cleanEnv, health, healthInfo, buildId, openBrowser, flag, version } from './common.mjs';

const DATA = pluginData();
const RUNTIME = runtimeDir(DATA);
const FAMILY = familyData();
const P = port();
const url = `http://localhost:${P}`;
const win = process.platform === 'win32';

// 1. Is the runtime ready (setup-check --install-packages ran for this version)?
const stampFile = join(RUNTIME, '.stamp.json');
const readStamp = () => (existsSync(stampFile) ? JSON.parse(readFileSync(stampFile, 'utf8')) : null);
const lockSize = () => (existsSync(join(ROOT, 'package-lock.json')) ? readFileSync(join(ROOT, 'package-lock.json'), 'utf8').length : 0);
let stamp = readStamp();
if (!stamp) {
  console.log(JSON.stringify({ ok: false, reason: 'setup-needed', message: 'Run /build-with-me:setup first (packages missing).' }));
  process.exit(1);
}
// After a plugin update with new or changed packages: refresh them here, so a double-click on
// the desktop shortcut keeps working (slice 9: updates need no setup run).
if (stamp.version !== version() || (stamp.lock !== undefined && stamp.lock !== lockSize())) {
  console.error('Updating the app packages (once after an update, about a minute)…');
  // The old server holds its packages open (Windows can't replace them): stop it first.
  if (await health(P)) {
    try { process.kill(JSON.parse(readFileSync(join(DATA, 'server.lock'), 'utf8')).pid); } catch {}
    for (let i = 0; i < 20 && (await health(P)); i++) await new Promise((r) => setTimeout(r, 250));
  }
  const r = spawnSync(process.execPath, [join(ROOT, 'app', 'setup-check.mjs'), '--install-packages', '--data', DATA], { stdio: ['ignore', 'inherit', 'inherit'], env: cleanEnv() });
  stamp = readStamp();
  if (r.status !== 0 || !stamp || stamp.version !== version()) {
    console.log(JSON.stringify({ ok: false, reason: 'setup-needed', message: 'Run /build-with-me:setup (updating the packages failed).' }));
    process.exit(1);
  }
}

// 1b. Refresh the app copy if the plugin has a different build (update or rebuild).
const want = buildId(join(ROOT, 'app', 'dist'));
const have = buildId(join(RUNTIME, 'app', 'dist'));
if (want && want !== have) {
  rmSync(join(RUNTIME, 'app'), { recursive: true, force: true });
  cpSync(join(ROOT, 'app', 'dist'), join(RUNTIME, 'app', 'dist'), { recursive: true });
}
// An outdated server is still running → stop it so the new build starts below.
const live = await healthInfo(P);
if (live && want && live.build !== want) {
  try { process.kill(JSON.parse(readFileSync(join(DATA, 'server.lock'), 'utf8')).pid); } catch {}
  for (let i = 0; i < 20 && (await health(P)); i++) await new Promise((r) => setTimeout(r, 250));
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

// 3. Desktop shortcut with the Build With Me icon, created automatically the first time.
//    A marker remembers it was made, so a parent who later deletes the shortcut isn't
//    overruled; an existing shortcut is refreshed (icon, target) on every launch.
let shortcut = null;
const marker = join(FAMILY, '.shortcut-created');
const iconSrc = join(ROOT, 'app', 'assets', win ? 'icon.ico' : 'icon.png');
const icon = join(FAMILY, win ? '.icon.ico' : '.icon.png');
if (existsSync(iconSrc)) cpSync(iconSrc, icon); // stable copy: the plugin folder moves on updates
function makeWindowsShortcut(lnk) {
  const q = (x) => x.replace(/'/g, "''");
  const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${q(lnk)}');$s.TargetPath='${q(startFile)}';$s.WorkingDirectory='${q(FAMILY)}';$s.WindowStyle=7;$s.Description='Build With Me at Home';` +
    (existsSync(icon) ? `$s.IconLocation='${q(icon)},0';` : '') + '$s.Save()';
  return spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).status === 0;
}
const existing = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null;
if (win && existing && existsSync(existing)) { makeWindowsShortcut(existing); shortcut = existing; }
else if (!flag('no-shortcut') && !process.env.BWM_NO_SHORTCUT && !existing) {
  // The real Desktop can be redirected (OneDrive, including work accounts), so ask Windows.
  const desktop = win
    ? (spawnSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8' }).stdout || '').trim() || join(homedir(), 'Desktop')
    : join(homedir(), 'Desktop');
  if (win) {
    const lnk = join(desktop, 'Build With Me.lnk');
    shortcut = makeWindowsShortcut(lnk) ? lnk : null;
  } else if (existsSync(desktop)) {
    const target = join(desktop, 'Build With Me.command');
    writeFileSync(target, `#!/bin/sh\nexec "${startFile}"\n`); chmodSync(target, 0o755);
    shortcut = target;
  }
  if (shortcut) writeFileSync(marker, shortcut);
}

// 4. Start the server if it isn't running. Detached, so it keeps running after Claude Code closes.
let started = false;
if (!(await health(P))) {
  mkdirSync(DATA, { recursive: true });
  const log = openSync(join(DATA, 'server.log'), 'a');
  const child = spawn(process.execPath, [join(RUNTIME, 'app', 'dist', 'server', 'main.mjs')], {
    cwd: RUNTIME, detached: true, windowsHide: true, stdio: ['ignore', log, log],
    env: cleanEnv({ BWM_PLUGIN_DATA: DATA, BWM_PORT: String(P), BWM_LAUNCHED: '1', NODE_ENV: 'production' }),
  });
  child.unref();
  for (let i = 0; i < 60 && !(await health(P)); i++) await new Promise((r) => setTimeout(r, 500));
  started = true;
}
const running = await health(P);
if (running && !flag('no-open') && !process.env.BWM_NO_OPEN) openBrowser(url);
console.log(JSON.stringify({ ok: running, started, url, family: familyData(), startFile, shortcut, log: join(DATA, 'server.log') }, null, 2));
process.exitCode = running ? 0 : 1;
