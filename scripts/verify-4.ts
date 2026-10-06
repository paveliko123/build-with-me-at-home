// Slice 4 verification: one-use timed passes. Runs the real server in-process on a test port
// with a temporary family folder. The parent talks to it on the laptop (loopback); "tablets"
// talk to it over HTTPS on the home address, trusting the home certificate like a set-up device.
// Run: npm run verify:4   (after npm run build:web)

import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import https from 'node:https';

const FAMILY = mkdtempSync(join(tmpdir(), 'bwm-verify4-'));
process.env.BWM_DATA = FAMILY;
process.env.BWM_PLUGIN_DATA = join(FAMILY, '.plugin-data');
const PORT = 4777;

const checks: { name: string; pass: boolean; detail: string }[] = [];
const add = (name: string, pass: boolean, detail: string) => { checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A browser-ish client with its own cookie jar. */
function client(base: string, ca?: string, ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)') {
  const jar = new Map<string, string>();
  const lib = base.startsWith('https') ? https : http;
  const call = (path: string, body?: unknown, method?: string) => new Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const r = lib.request(base + path, {
      method: method ?? (data ? 'POST' : 'GET'), ca,
      headers: { 'User-Agent': ua, ...(data ? { 'Content-Type': 'application/json' } : {}), ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) },
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
  /** Collects SSE events until stop(). */
  const events = (path: string) => {
    const got: { event: string; data: any }[] = [];
    let status = 0;
    const r = lib.get(base + path, { ca, headers: { 'User-Agent': ua, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } }, (res) => {
      status = res.statusCode ?? 0; let buf = '';
      res.on('data', (d) => {
        buf += d;
        let i; while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1]; const da = /^data: (.*)$/m.exec(block)?.[1];
          if (ev) got.push({ event: ev, data: da ? JSON.parse(da) : null });
        }
      });
    });
    r.on('error', () => {});
    return { got, status: () => status, stop: () => r.destroy() };
  };
  return { call, events, jar };
}

async function main() {
  const { startServer } = await import('../server/index.js');
  const { homeAddresses } = await import('../server/certs.js');
  const server = await startServer({ httpPort: PORT, httpsPort: PORT + 1 });
  const ip = homeAddresses()[0];
  const ca = server.authority.certPem;
  const parent = client(`http://127.0.0.1:${PORT}`, undefined, 'Mozilla/5.0 (Windows NT 10.0) Chrome/130');
  const remote = (ua?: string) => ip ? client(`https://${ip}:${PORT + 1}`, ca, ua) : client(`http://127.0.0.1:${PORT}`, undefined, ua);
  if (!ip) console.log('(no home address: "tablets" use the laptop address)');

  try {
    // setup: PIN + two kids
    let r = await parent.call('/api/parent/setup', { pin: '4321', kids: [{ nickname: 'Maya', group: 'kid', emoji: '🦄' }, { nickname: 'Leo', group: 'teen', emoji: '🚀' }] });
    const kids = (await parent.call('/api/parent/kids')).body as { id: string; nickname: string }[];
    const maya = kids.find((k) => k.nickname === 'Maya')!, leo = kids.find((k) => k.nickname === 'Leo')!;

    // 1. create
    r = await parent.call('/api/parent/passes', { kidId: maya.id, minutes: 15 });
    const p1 = r.body;
    add('create pass: QR link, typed code, laptop link', r.status === 200 && /\/p\/[A-Za-z0-9_-]{22}$/.test(p1.laptopUrl) && /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(p1.typedCode) && (!ip || (p1.qr?.startsWith('data:image/png') && p1.qrUrl.startsWith(`https://${ip}:`))), `${p1.typedCode} · ${p1.qrUrl ?? 'no home address'}`);
    r = await parent.call('/api/parent/passes', { kidId: maya.id, minutes: 30 });
    add('one live pass per kid (asks before replacing)', r.status === 409 && r.body.code === 'kid-has-pass', `${r.status} ${r.body.code}`);
    r = await parent.call('/api/parent/passes', { kidId: maya.id, minutes: 0 });
    add('a duration is required (1 min – 24 h)', r.status === 400, r.body.error);
    const kidRefused = await remote().call('/api/parent/passes');
    add('other devices cannot make passes', kidRefused.status === 403, String(kidRefused.status));

    // 2. open on a tablet
    const tablet = remote();
    r = await tablet.call(`/api/pass/peek/${p1.code}`);
    add('peeking a link shows whose pass it is without using it', r.body.state === 'ready' && r.body.kid.nickname === 'Maya', JSON.stringify(r.body));
    r = await tablet.call('/api/kid/session');
    add('no pass yet → kid API says no-pass', r.status === 401, String(r.status));
    r = await tablet.call('/api/pass/open', { code: p1.code });
    const cookie = tablet.jar.get('bwm_pass');
    add('open → pass cookie set', r.status === 200 && !!cookie, `cookie ${cookie ? 'set' : 'missing'}`);
    r = await tablet.call('/api/kid/session');
    add("the kid lands as Maya, Kid mode", r.status === 200 && r.body.state === 'live' && r.body.kid.nickname === 'Maya' && r.body.kid.group === 'kid', JSON.stringify(r.body.kid));
    const stored = JSON.parse(readFileSync(join(FAMILY, 'passes.json'), 'utf8')).passes[0];
    add('the cookie is stored only as a hash', !JSON.stringify(stored).includes(cookie!) && /^[0-9a-f]{64}$/.test(stored.tokenHash), 'sha256 only');

    // 3. second open
    const phone = remote('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Chrome/130');
    r = await phone.call('/api/pass/open', { code: p1.code });
    const peek2 = await phone.call(`/api/pass/peek/${p1.code}`);
    add('a second device → "already used"', r.status === 410 && r.body.error === 'used' && peek2.body.state === 'used', `${r.status} ${r.body.error}, peek ${peek2.body.state}`);
    r = await phone.call('/api/pass/open', { code: p1.typedCode });
    add('its typed code died with it', r.status === 410 && r.body.error === 'used', `${r.status} ${r.body.error}`);
    r = await tablet.call('/api/pass/open', { code: p1.code });
    add('the same tablet scanning again just goes back in', r.status === 200, String(r.status));

    // 4. parent sees it
    r = await parent.call('/api/parent/passes');
    const row = r.body.find((p: any) => p.id === p1.id);
    add('Active passes shows the device, without the code', row?.device === 'iPad' && !row.code && !row.typedCode, `${row?.device} · code hidden: ${!row?.code}`);

    // 5. extend → SSE to the kid
    const kidStream = tablet.events('/api/events');
    const parentStream = parent.events('/api/events');
    await sleep(400);
    r = await parent.call(`/api/parent/passes/${p1.id}/extend`, { minutes: 30 });
    await sleep(600);
    const ev = kidStream.got.find((e) => e.event === 'pass');
    add('extend → endsAt moved +30 min and the kid screen hears it', r.status === 200 && ev?.data.endsAt === r.body.endsAt && r.body.endsAt - p1.endsAt === 30 * 60_000, ev ? `kid got endsAt ${new Date(ev.data.endsAt).toLocaleTimeString()}` : 'no event');
    add('the parent screen hears it too', parentStream.got.some((e) => e.event === 'passes'), parentStream.got.map((e) => e.event).join(','));
    add('the events stream needs a parent or a pass', (await remote().call('/api/events')).status === 401, '401');

    // 6. typed code on a laptop + two kids at once
    r = await parent.call('/api/parent/passes', { kidId: leo.id, minutes: 60 });
    const p2 = r.body;
    const laptop = remote('Mozilla/5.0 (X11; CrOS x86_64 15000.0.0) Chrome/130');
    r = await laptop.call('/api/pass/open', { code: p2.typedCode.toLowerCase().replace('-', ' ') });
    const leoS = await laptop.call('/api/kid/session');
    const mayaS = await tablet.call('/api/kid/session');
    add('typed code (any case, any separator) opens a pass on a Chromebook', r.status === 200 && leoS.body.kid?.nickname === 'Leo', `typed "${p2.typedCode.toLowerCase().replace('-', ' ')}"`);
    const both = (await parent.call('/api/parent/passes')).body;
    add('two kids with passes at once', mayaS.body.state === 'live' && leoS.body.state === 'live' && both.length === 2, both.map((p: any) => `${p.kid.nickname} on ${p.device}`).join(', '));
    r = await laptop.call(`/p/${p2.code}`);
    add('the pass link page itself loads', r.status === 200 && String(r.body).includes('<div id="root">'), String(r.status));

    // 7. end → kid locked out
    const leoStream = laptop.events('/api/events');
    await sleep(400);
    r = await parent.call(`/api/parent/passes/${p2.id}/end`, {});
    await sleep(600);
    const endEv = leoStream.got.find((e) => e.event === 'pass');
    const talk = await laptop.call('/api/speech/abcdef123/end', {});
    const s7 = await laptop.call('/api/kid/session');
    add('end → kid screen told at once, Time\'s up, kid API refuses (401)', endEv?.data.state === 'over' && s7.body.state === 'over' && talk.status === 401, `event ${endEv?.data.state}, session ${s7.body.state}, speech ${talk.status}`);

    // 8. expired on its own → Time's up
    const file = join(FAMILY, 'passes.json');
    const f = JSON.parse(readFileSync(file, 'utf8'));
    f.passes.find((p: any) => p.id === p1.id).endsAt = Date.now() - 1000;
    writeFileSync(file, JSON.stringify(f));
    await sleep(2600);
    const exp = await tablet.call('/api/kid/session');
    add('an expired pass → Time\'s up, announced live', exp.body.state === 'over' && kidStream.got.some((e) => e.event === 'pass' && e.data.state === 'over'), `session ${exp.body.state}`);
    add('Active passes is empty again', (await parent.call('/api/parent/passes')).body.length === 0, '0 live');

    // 9. "open on this laptop" locks the parent area
    r = await parent.call('/api/parent/passes', { kidId: maya.id, minutes: 20 });
    await parent.call('/api/pass/open', { code: r.body.code });
    const after = await parent.call('/api/parent/passes');
    const mine = await parent.call('/api/kid/session');
    add('open on this laptop: the kid is in, the parent area locks', after.status === 401 && mine.body.kid?.nickname === 'Maya', `parent API ${after.status}, kid ${mine.body.kid?.nickname}`);

    // 10. wrong typed codes → wait
    const guesser = remote();
    const st: number[] = [];
    for (let i = 0; i < 5; i++) st.push((await guesser.call('/api/pass/open', { code: 'ZZZZ-ZZZZ' })).status);
    r = await guesser.call('/api/pass/open', { code: 'ZZZZ-ZZZZ' });
    add('5 wrong codes → 60 s wait', st.slice(0, 4).every((x) => x === 404) && st[4] === 429 && r.status === 429, `${st.join(',')} then ${r.status} (${r.body.seconds}s)`);

    kidStream.stop(); parentStream.stop(); leoStream.stop();
  } finally {
    await server.close();
    rmSync(FAMILY, { recursive: true, force: true });
  }
  const passed = checks.filter((c) => c.pass).length;
  console.log(`\n${passed}/${checks.length} passed`);
  process.exit(passed === checks.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
