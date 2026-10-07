// Security audit fixes (devpost/security-audit.md, step 1): runs the real server in-process on a
// test port with a temporary family folder. No Claude calls: "claude" points at a file that
// can't start (also the A7 check), and simulate-limit answers every journey call. Silent.
// Run: npm run verify:security   (after npm run build:web)

import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir, hostname, userInfo } from 'node:os';
import http from 'node:http';
import https from 'node:https';

const FAMILY = mkdtempSync(join(tmpdir(), 'bwm-verifysec-'));
const PLUGIN = join(FAMILY, '.plugin-data');
process.env.BWM_DATA = FAMILY;
process.env.BWM_PLUGIN_DATA = PLUGIN;
mkdirSync(PLUGIN, { recursive: true });
writeFileSync(join(PLUGIN, 'simulate-limit'), '');
const FAKE_CLAUDE = join(PLUGIN, 'not-claude.txt');
writeFileSync(FAKE_CLAUDE, 'not a program');
process.env.BWM_CLAUDE_PATH = FAKE_CLAUDE;
const PORT = 4781;

const checks: { name: string; pass: boolean; detail: string }[] = [];
const add = (name: string, pass: boolean, detail: string) => { checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

type Res = { status: number; body: any; headers: http.IncomingHttpHeaders };
function client(base: string, ca?: string, ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)') {
  const jar = new Map<string, string>();
  const lib = base.startsWith('https') ? https : http;
  const call = (path: string, body?: unknown, opts: { method?: string; headers?: Record<string, string>; raw?: Buffer } = {}) => new Promise<Res>((resolve, reject) => {
    const data = opts.raw ?? (body === undefined ? undefined : JSON.stringify(body));
    const r = lib.request(base + path, {
      method: opts.method ?? (data ? 'POST' : 'GET'), ca,
      headers: { 'User-Agent': ua, ...(data ? { 'Content-Type': opts.raw ? 'application/octet-stream' : 'application/json' } : {}), ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}), ...opts.headers },
    }, (res) => {
      for (const c of res.headers['set-cookie'] ?? []) {
        const [kv] = c.split(';'); const i = kv.indexOf('=');
        const k = kv.slice(0, i), v = kv.slice(i + 1);
        if (!v || /Expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(k); else jar.set(k, v);
      }
      let t = ''; res.on('data', (d) => (t += d)); res.on('end', () => { let j: any = t; try { j = JSON.parse(t); } catch {} resolve({ status: res.statusCode ?? 0, body: j, headers: res.headers }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
  return { call, jar };
}

async function main() {
  const { startServer } = await import('../server/index.js');
  const { homeAddresses } = await import('../server/certs.js');
  const server = await startServer({ httpPort: PORT, httpsPort: PORT + 1 });
  const ip = homeAddresses()[0];
  const ca = server.authority.certPem;
  const parent = client(`http://127.0.0.1:${PORT}`, undefined, 'Mozilla/5.0 (Windows NT 10.0) Chrome/130');
  const remote = () => (ip ? client(`https://${ip}:${PORT + 1}`, ca) : client(`http://127.0.0.1:${PORT}`));
  if (!ip) console.log('(no home address: some checks use the laptop address)');

  try {
    await parent.call('/api/parent/setup', { pin: '4321', kids: [{ nickname: 'Maya', group: 'kid', emoji: '🦄' }, { nickname: 'Leo', group: 'teen', emoji: '🚀' }] });
    const kids = (await parent.call('/api/parent/kids')).body as { id: string; nickname: string }[];
    const maya = kids.find((k) => k.nickname === 'Maya')!, leo = kids.find((k) => k.nickname === 'Leo')!;

    // ---------- H1: DNS rebinding ----------
    const stranger = client(`http://127.0.0.1:${PORT}`);
    let r = await stranger.call('/api/parent/state', undefined, { headers: { Host: `attacker.example:${PORT}` } });
    const r2 = await stranger.call('/api/parent/unlock', { pin: '4321' }, { headers: { Host: `attacker.example:${PORT}` } });
    add('H1: a request addressed to another name gets nothing (421), even from this laptop', r.status === 421 && r2.status === 421 && !stranger.jar.size, `state ${r.status}, unlock ${r2.status}, cookies ${stranger.jar.size}`);
    r = await stranger.call('/api/parent/unlock', { pin: '4321' }, { headers: { Origin: 'http://attacker.example' } });
    add('H1: a change sent from another site is refused (403)', r.status === 403 && !stranger.jar.size, `unlock with a foreign Origin → ${r.status}`);
    const local = client(`http://localhost:${PORT}`);
    r = await local.call('/api/parent/state');
    const r3 = await local.call('/api/parent/unlock', { pin: '4321' }, { headers: { Origin: `http://localhost:${PORT}` } });
    add('H1: localhost and 127.0.0.1 still work, with the app\'s own Origin', r.status === 200 && r3.status === 200, `localhost state ${r.status}, unlock ${r3.status}`);
    const lan = ip ? await client(`https://${ip}:${PORT + 1}`, ca).call('/api/health') : { status: 200 };
    add('H1: the home address still works for tablets', lan.status === 200, ip ? `https://<home>:${PORT + 1}/api/health → ${lan.status}` : 'skipped (no home address)');

    // ---------- M4: the pass cookie ----------
    const pass1 = (await parent.call('/api/parent/passes', { kidId: maya.id, minutes: 30 })).body;
    const tablet = remote();
    r = await tablet.call('/api/pass/open', { code: pass1.code });
    const setCookie = String(r.headers['set-cookie'] ?? '');
    add('M4: a tablet\'s pass cookie is Secure (HTTPS only)', r.status === 200 && (!ip || /;\s*Secure/i.test(setCookie)), ip ? setCookie.replace(/bwm_pass=[^;]+/, 'bwm_pass=…') : 'skipped (no home address)');
    const passL = (await parent.call('/api/parent/passes', { kidId: leo.id, minutes: 30 })).body;
    const laptopKid = client(`http://localhost:${PORT}`);
    r = await laptopKid.call('/api/pass/open', { code: passL.code });
    add('M4: "Open on this laptop" still works over http://localhost', r.status === 200 && !/;\s*Secure/i.test(String(r.headers['set-cookie'] ?? '')) && (await laptopKid.call('/api/kid/journey')).status === 200, `open ${r.status}`);

    // ---------- M1: talking ----------
    const chunk = Buffer.alloc(3200);
    r = await stranger.call('/api/speech/abcdef01', undefined, { raw: chunk });
    const rp = await parent.call('/api/speech/abcdef02', undefined, { raw: chunk });
    const rk = await tablet.call('/api/speech/abcdef03', undefined, { raw: chunk });
    add('M1: talking needs a live pass or the parent (not just "this laptop")', r.status === 401 && rp.status === 200 && rk.status === 200, `no pass ${r.status}, parent ${rp.status}, kid ${rk.status}`);
    const { addChunk } = await import('../server/speech.js');
    const big = Buffer.alloc(16000 * 2 * 59); addChunk('capcheck1', big);
    const after = addChunk('capcheck1', Buffer.alloc(16000 * 2 * 5));
    add('M1: one recording stops at 60 seconds', !!after && after.seconds <= 60, `${after?.seconds.toFixed(1)} s after adding 59 s + 5 s`);
    // Safety review: 2 at a time per device (pass); still at most 20 for the whole house.
    const codes: number[] = [];
    for (let i = 4; i <= 5; i++) codes.push((await tablet.call(`/api/speech/abcdef${String(i).padStart(2, '0')}`, undefined, { raw: chunk })).status);
    const perDevice = codes.at(-1);
    let houseOk = 0;
    for (let i = 0; i < 25; i++) if (addChunk(`house${String(i).padStart(4, '0')}`, Buffer.alloc(320), `pass:h${i}`)) houseOk++;
    add('M1: at most 2 recordings at once per device, 20 for the whole house', perDevice === 429 && houseOk <= 20 && houseOk >= 15, `the tablet's 3rd → ${perDevice}; house-wide accepted ${houseOk} of 25 (with the others still open)`);

    // ---------- H2: what one pass can spend ----------
    r = await tablet.call('/api/kid/journey/start', { theme: 'space', inputMode: 'type' });
    const statuses: string[] = [];
    for (let i = 0; i < 11; i++) { const t = await tablet.call('/api/kid/journey/turn', { text: 'a space game' }); statuses.push(`${t.status}:${t.body?.error}`); }
    add('H2: 10 Claude requests a minute per pass, then "slow down"', statuses.slice(0, 10).every((s) => s === '429:limit') && statuses[10] === '429:slow-down', statuses.slice(-2).join(', '));
    const projects: string[] = [];
    for (let i = 0; i < 5; i++) {
      await tablet.call('/api/kid/journey/new', {});
      const s = await tablet.call('/api/kid/journey/start', { theme: 'space', inputMode: 'type' });
      projects.push(`${s.status}${s.body?.error ? ':' + s.body.error : ''}`);
    }
    const alerts = (await parent.call('/api/parent/alerts')).body as { text: string }[];
    add('H2: 5 new apps per pass, then "ask your parent for a new pass", and the parent is told', projects.slice(0, 4).every((s) => s === '200') && projects[4] === '429:pass-cap' && alerts.some((a) => /limit of 5 new apps/.test(a.text)), `${projects.join(' ')} · alert: ${alerts.length}`);
    const { spend, resetLimitsForTests, setClockForTests } = await import('../server/journey/limits.js');
    resetLimitsForTests();
    let t = Date.now();
    setClockForTests(() => (t += 61_000)); // a build a minute, so only the build cap counts
    const fakeSession: any = { pass: { id: 'unit' }, kid: { id: maya.id, nickname: 'Maya' }, live: true };
    let builds = 0, capped = '';
    for (let i = 0; i < 31; i++) { try { spend(fakeSession, 'build'); builds++; } catch (e: any) { capped = e.code; } }
    resetLimitsForTests();
    add('H2: 30 builds per pass', builds === 30 && capped === 'pass-cap', `${builds} builds, then "${capped}"`);

    // ---------- A7: a claude that can't start never stops the server ----------
    const { oneShot } = await import('../server/claude/runner.js');
    const o = await oneShot({ model: 'haiku', systemPrompt: 'x', prompt: 'x', timeoutMs: 5000 });
    r = await parent.call('/api/parent/state');
    add('A7: a claude that can\'t start fails the call, not the server', !o.ok && r.status === 200, `${(o.error ?? '').slice(0, 60)} · server ${r.status}`);

    // ---------- M2: removing a kid deletes their data ----------
    const leoDir = join(FAMILY, 'kids', leo.id);
    const startedLeo = await laptopKid.call('/api/kid/journey/start', { theme: 'robots', inputMode: 'type' });
    mkdirSync(join(FAMILY, 'report-data', 'index'), { recursive: true });
    mkdirSync(join(FAMILY, 'Reports'), { recursive: true });
    const htmlName = '2026-10-06 1200 Leo - Robot Race.html';
    writeFileSync(join(FAMILY, 'report-data', 'rleo00001.json'), JSON.stringify({ id: 'rleo00001', kidId: leo.id }));
    writeFileSync(join(FAMILY, 'report-data', 'index', 'rleo00001.json'), JSON.stringify({ id: 'rleo00001', kidId: leo.id, file: htmlName }));
    writeFileSync(join(FAMILY, 'Reports', htmlName), '<!doctype html><p>report</p>');
    writeFileSync(join(FAMILY, 'report-data', 'rmaya0001.json'), JSON.stringify({ id: 'rmaya0001', kidId: maya.id }));
    const { addAlert } = await import('../server/report/alerts.js');
    addAlert({ kind: 'flag', kidId: leo.id, kidName: 'Leo', text: 'a flag' });
    r = await parent.call(`/api/parent/kids/${leo.id}/data`);
    add('M2: the parent sees what removing Leo deletes', r.status === 200 && r.body.projects === 1 && r.body.reports === 1 && r.body.apps === 0 && r.body.livePass === true, `${startedLeo.status} · ${JSON.stringify(r.body)}`);
    r = await parent.call(`/api/parent/kids/${leo.id}`, undefined, { method: 'DELETE' });
    add('M2: removing without confirming deletes nothing', r.status === 400 && existsSync(leoDir), `${r.status} ${r.body?.error}`);
    r = await parent.call(`/api/parent/kids/${leo.id}?erase=1`, undefined, { method: 'DELETE' });
    const gone = !existsSync(leoDir) && !existsSync(join(FAMILY, 'report-data', 'rleo00001.json')) && !existsSync(join(FAMILY, 'report-data', 'index', 'rleo00001.json')) && !existsSync(join(FAMILY, 'Reports', htmlName));
    const passesLeft = JSON.parse(readFileSync(join(FAMILY, 'passes.json'), 'utf8')).passes.filter((p: any) => p.kidId === leo.id).length;
    const alertsLeft = JSON.parse(readFileSync(join(FAMILY, 'alerts.json'), 'utf8')).alerts.filter((a: any) => a.kidId === leo.id).length;
    const leoAfter = await laptopKid.call('/api/kid/journey');
    add('M2: confirmed → Leo\'s projects, reports, Reports file, passes and alerts are gone; his device is out', r.status === 200 && gone && passesLeft === 0 && alertsLeft === 0 && leoAfter.status === 401, `files gone ${gone}, passes ${passesLeft}, alerts ${alertsLeft}, Leo's device → ${leoAfter.status}`);
    add('M2: Maya\'s data is untouched', existsSync(join(FAMILY, 'report-data', 'rmaya0001.json')) && existsSync(join(FAMILY, 'kids', maya.id)), 'her report and folder are still there');

    // ---------- B1, B2: app checks ----------
    const { checkApp } = await import('../server/journey/appCheck.js');
    const page = (body: string) => `<!doctype html><html><body>${body}</body></html>`;
    const bad = {
      'script from code': page(`<script>const s=document.createElement('script');s.src='x.js'</script>`),
      'image src in code': page(`<script>const i=new Image();i.src='https://t.example/p.gif'</script>`),
      'CSS url()': page(`<style>body{background:url("https://t.example/bg.png")}</style>`),
      'import from URL': page(`<script type="module">import x from 'https://cdn.example/x.js'</script>`),
    };
    const missed = Object.entries(bad).filter(([, h]) => checkApp(h).length === 0).map(([k]) => k);
    add('B1: apps that reach the internet from code are caught', missed.length === 0, missed.length ? `missed: ${missed.join(', ')}` : Object.keys(bad).join(', '));
    const samples = findSamples();
    const falsePos = samples.filter((f) => checkApp(readFileSync(f, 'utf8')).some((p) => /from code|from the internet|CSS url|imports code/.test(p)));
    add('B1: no false alarms on apps built earlier', falsePos.length === 0, `${samples.length} earlier builds checked${falsePos.length ? `, flagged: ${falsePos.length}` : ''}`);
    const fine = page(`<script>const i=new Image();i.src='data:image/png;base64,AAAA';document.body.style.background='url(data:image/png;base64,AAAA)'</script>`);
    add('B1: pictures made inside the app are fine', checkApp(fine).length === 0, checkApp(fine).join('; ') || 'ok');

    // ---------- A1: the scrub ----------
    const { scrubText } = await import('../server/claude/guard.js');
    const user = userInfo().username, machine = hostname();
    const sample = `mail me at kid＠example.com, folder ${homedir()}\\Desktop, user ${user}, machine ${machine}, and my friend Alex`;
    const out = scrubText(sample);
    const looksLikeAccount = (n: string) => n.length >= 4 && /[^A-Za-z]/.test(n);
    const ok1 = !out.includes('＠example') && !out.includes(homedir()) && (!looksLikeAccount(user) || !out.includes(user)) && (!looksLikeAccount(machine) || !out.includes(machine)) && out.includes('Alex');
    add('A1: emails (also ＠), the home folder and this computer\'s names are hidden; a first name stays', ok1, out.replace(new RegExp(user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '<user>').replace(machine, '<machine>'));

    // ---------- A5: old prompt files ----------
    const { prunePrompts } = await import('../server/claude/runner.js');
    const prompts = join(PLUGIN, 'prompts');
    mkdirSync(prompts, { recursive: true });
    const old = join(prompts, 'old-plan.txt'); writeFileSync(old, 'a kid plan');
    const recent = join(prompts, 'recent-plan.txt'); writeFileSync(recent, 'a kid plan');
    const weekAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); utimesSync(old, weekAgo, weekAgo);
    prunePrompts(prompts);
    add('A5: prompt files unused for a week are deleted', !existsSync(old) && existsSync(recent), `old ${existsSync(old) ? 'kept' : 'deleted'}, recent ${existsSync(recent) ? 'kept' : 'deleted'}`);

    // ---------- C7a: the family folder is never in a cloud folder ----------
    const { inCloudFolder } = await import('../server/paths.js');
    const common = await import('../app/common.mjs' as string);
    const cases: [string, boolean][] = [
      [join(homedir(), 'Build With Me'), false],
      ['C:\\Users\\Alex\\OneDrive - Contoso\\Build With Me', true],
      ['C:\\Users\\Alex\\OneDrive\\Documents\\Build With Me', true],
      ['/Users/alex/Library/Mobile Documents/com~apple~CloudDocs/Build With Me', true],
      ['/Users/alex/Dropbox/Build With Me', true],
    ];
    const wrong = cases.filter(([d, want]) => inCloudFolder(d) !== want || common.inCloudFolder(d) !== want);
    add('C7a: a family folder in OneDrive, iCloud or Dropbox is refused (server and launcher)', wrong.length === 0, wrong.length ? `wrong: ${wrong.map(([d]) => d).join(' | ')}` : `${cases.length} cases`);
  } finally {
    await server.close();
  }
  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

function findSamples(): string[] {
  const out: string[] = [];
  const walk = (d: string) => { let es: any[] = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/^v\d+\.html$/.test(e.name) && p.includes('versions')) out.push(p); } };
  walk(join(process.cwd(), 'tmp'));
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });
