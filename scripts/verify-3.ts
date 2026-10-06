// Slice 3 verification: plugin check/launch scripts, single instance, start file, parent gate
// APIs (first run, wrong PIN, lockout, laptop-only), reset-pin. Uses a temporary family folder
// and a test port, so the learner's real data and running app are untouched.
// Run: npm run verify:3   (after npm run build)

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, networkInterfaces } from 'node:os';
import https from 'node:https';

const checks: { name: string; pass: boolean; detail: string }[] = [];
const add = (name: string, pass: boolean, detail: string) => { checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

const FAMILY = mkdtempSync(join(tmpdir(), 'bwm-verify3-'));
const DATA = join(tmpdir(), 'build-with-me-dev'); // has the speech model from E2
const PORT = 4767;
const env = { ...process.env, BWM_DATA: FAMILY, BWM_PLUGIN_DATA: DATA };
const node = (args: string[]) => spawnSync(process.execPath, args, { encoding: 'utf8', env, timeout: 600_000 });
const base = `http://127.0.0.1:${PORT}`;
let cookie = '';
async function call(path: string, body?: unknown, method?: string) {
  const r = await fetch(base + path, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
function stopServer() {
  const lock = join(DATA, 'server.lock');
  if (!existsSync(lock)) return false;
  try { process.kill(JSON.parse(readFileSync(lock, 'utf8')).pid); } catch {}
  rmSync(lock, { force: true });
  return true;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // family.json with a test port so launch/check use it
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(FAMILY, 'family.json'), JSON.stringify({ version: 1, kids: [], settings: { port: PORT } }));

  // 1. setup-check produces a valid report
  const chk = node(['app/setup-check.mjs', '--data', DATA]);
  let report: any = null; try { report = JSON.parse(chk.stdout); } catch {}
  add('setup-check prints a valid JSON report', !!report?.items?.length, report ? report.items.map((i: any) => `${i.id}:${i.ok ? 'ok' : 'NO'}`).join(' ') : chk.stderr.slice(0, 200));

  // 2. install packages into the runtime folder
  const inst = node(['app/setup-check.mjs', '--install-packages', '--data', DATA]);
  const chk2 = JSON.parse(node(['app/setup-check.mjs', '--data', DATA]).stdout);
  const pkg = chk2.items.find((i: any) => i.id === 'packages');
  add('packages install into the plugin data folder', inst.status === 0 && pkg?.ok, pkg?.detail ?? inst.stderr.slice(-200));

  // 3. plugin manifest validates
  const { findClaude } = await import('../server/claude/runner.js');
  const claude = spawnSync(findClaude() ?? 'claude', ['plugin', 'validate', '.'], { encoding: 'utf8' });
  add('claude plugin validate .', claude.status === 0, (claude.stdout + claude.stderr).trim().split('\n').slice(-2).join(' '));

  // 4. launch: starts one server; a second launch doesn't start another
  stopServer();
  const l1 = JSON.parse(node(['app/launch.mjs', '--data', DATA, '--no-open']).stdout);
  const l2 = JSON.parse(node(['app/launch.mjs', '--data', DATA, '--no-open']).stdout);
  add('launch starts the server', l1.ok && l1.started, `${l1.url} started=${l1.started}`);
  add('second launch reuses it (single instance)', l2.ok && !l2.started, `started=${l2.started}`);
  add('stable start file written', existsSync(l1.startFile) && existsSync(join(FAMILY, '.app-location.json')), l1.startFile);

  // 5. first run
  let r = await call('/api/parent/state');
  add('fresh install shows first-run', r.status === 200 && !r.body.hasPin, JSON.stringify(r.body));
  r = await call('/api/parent/setup', { pin: '12', kids: [{ nickname: 'Maya', group: 'kid', emoji: '🦄' }] });
  add('short PIN rejected', r.status === 400, r.body?.error);
  r = await call('/api/parent/setup', { pin: '4321', kids: [{ nickname: 'Maya', group: 'kid', emoji: '🦄' }, { nickname: 'Leo', group: 'teen', emoji: '🚀' }] });
  const fam = JSON.parse(readFileSync(join(FAMILY, 'family.json'), 'utf8'));
  add('first run creates family.json with a hashed PIN and kids', r.status === 200 && fam.pin?.hash && !JSON.stringify(fam).includes('4321') && fam.kids.length === 2, `kids=${fam.kids.map((k: any) => k.nickname + '/' + k.group).join(',')}`);
  r = await call('/api/parent/setup', { pin: '9999', kids: [{ nickname: 'X', group: 'kid' }] });
  add('setup cannot run twice', r.status === 409, String(r.status));
  r = await call('/api/parent/kids');
  add('unlocked right after setup', r.status === 200 && r.body.length === 2, `${r.body.length} kids`);

  // 6. lock / wrong PIN / lockout
  await call('/api/parent/lock', {}); cookie = '';
  r = await call('/api/parent/kids');
  add('locked: parent API refuses', r.status === 401, String(r.status));
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) statuses.push((await call('/api/parent/unlock', { pin: '0000' })).status);
  r = await call('/api/parent/unlock', { pin: '4321' });
  add('wrong PIN 401, 5 wrong → 60 s lockout (even the right PIN waits)', statuses.slice(0, 4).every((s) => s === 401) && statuses[4] === 429 && r.status === 429, `${statuses.join(',')} then right PIN → ${r.status} (${r.body?.seconds}s)`);

  // 7. laptop-only: the parent API refuses requests from the home network
  const ip = Object.values(networkInterfaces()).flat().find((n) => n && n.family === 'IPv4' && !n.internal)?.address;
  if (ip) {
    const viaLan = await new Promise<number>((res) => https.get(`https://${ip}:${PORT + 1}/api/parent/state`, { rejectUnauthorized: false }, (x) => { x.resume(); res(x.statusCode ?? 0); }).on('error', () => res(-1)));
    add('parent API refuses other devices (home network)', viaLan === 403, `https://${ip}:${PORT + 1}/api/parent/state → ${viaLan}`);
  }

  // 8. reset-pin clears the hash, keeps kids
  const rp = node(['app/reset-pin.mjs']);
  const fam2 = JSON.parse(readFileSync(join(FAMILY, 'family.json'), 'utf8'));
  r = await call('/api/parent/state');
  add('reset-pin clears the PIN, keeps kids; app asks for a new PIN', !fam2.pin && fam2.kids.length === 2 && r.body.hasPin === false && r.body.kids === 2, rp.stdout.trim());
  r = await call('/api/parent/setup', { pin: '2468', kids: [] });
  add('new PIN only (no kids needed)', r.status === 200, String(r.status));

  // 9. the start file restarts a stopped server
  stopServer(); await sleep(800);
  const start = spawnSync(process.platform === 'win32' ? 'cmd' : 'sh', process.platform === 'win32' ? ['/c', l1.startFile] : [l1.startFile], { encoding: 'utf8', env: { ...env, BWM_NO_OPEN: '1' }, timeout: 120_000 });
  const up = await fetch(`${base}/api/health`).then((x) => x.ok, () => false);
  add('start file brings the app back after it stopped', up, (start.stdout || '').trim().split('\n').find((x) => x.includes('"url"'))?.trim() ?? String(start.status));

  stopServer();
  rmSync(FAMILY, { recursive: true, force: true });
  const passed = checks.filter((c) => c.pass).length;
  console.log(`\n${passed}/${checks.length} passed`);
  process.exitCode = passed === checks.length ? 0 : 1;
}

main().catch((e) => { console.error(e); stopServer(); process.exitCode = 1; });
