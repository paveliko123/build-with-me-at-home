// Slice 6 verification: build, one change, ship, My apps, serving and delete, on the parent's
// Claude Code (real Opus builds: a few minutes and some plan usage).
// It talks to a running server (BWM_TEST_URL) whose family folder is BWM_DATA, and starts from a
// project at the end of the Tech plan (approved Idea, Design and Tech plans written in directly,
// as slice 5 leaves them). Two phases, so the shipped app can be opened in a browser in between:
//   npx tsx scripts/verify-6.ts ship     → build → change → ship, CSP, 403 for another kid
//   npx tsx scripts/verify-6.ts delete   → the parent deletes it: folder and shelf entry gone
// State between phases: tmp/verify-6.state.json. Results: tmp/verify-6.json.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';

const BASE = process.env.BWM_TEST_URL ?? 'http://127.0.0.1:4787';
const FAMILY = process.env.BWM_DATA!;
const phase = process.argv[2] ?? 'ship';
const STATE = 'tmp/verify-6.state.json';
const checks: { name: string; pass: boolean; detail: string }[] = [];
const add = (name: string, pass: boolean, detail: string) => { checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

function client() {
  const jar = new Map<string, string>();
  const call = (path: string, body?: unknown, method?: string) => new Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const r = http.request(BASE + path, {
      method: method ?? (data ? 'POST' : 'GET'),
      headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) },
    }, (res) => {
      for (const c of res.headers['set-cookie'] ?? []) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
      let t = ''; res.on('data', (d) => (t += d)); res.on('end', () => { let j: any = t; try { j = JSON.parse(t); } catch {} resolve({ status: res.statusCode ?? 0, body: j, headers: res.headers }); });
    });
    r.setTimeout(25 * 60_000);
    r.on('error', reject); if (data) r.write(data); r.end();
  });
  return { call, jar };
}

const PLAN = {
  scope: `# Idea plan: Biscuit Feeder\n\n## What it is\nA helper that reminds me to feed my dog Biscuit, and shows a happy dog when I fed him.\n\n## What makes it special\nBiscuit looks happy (and wags) after each meal.\n\n## How it works\n- Two big buttons: Breakfast and Dinner.\n- Tap one when Biscuit ate: it turns green with a tick, and Biscuit wags.\n- Next day, both start fresh.\n\n## What we're leaving out for now\nReminders on other devices, more pets.`,
  prd: `# Design plan: Biscuit Feeder\n\n## Look and feel\nBright and happy: orange and sky blue, a big cartoon dog in the middle, rounded buttons.\n\n## Screens\nOne screen: the title "Biscuit Feeder", the dog, two buttons (Breakfast, Dinner).\n\n## Behaviors\n- Tapping a meal marks it done (green, a tick) and the dog wags and smiles.\n- Tapping again un-marks it.\n- It remembers today's meals on this device; on a new day both reset.\n- Empty state: "Biscuit is hungry!" until breakfast.\n\n## How we'll know it works\nTap Breakfast: it turns green and Biscuit wags. Reload: still green.`,
  spec: `# Tech plan: Biscuit Feeder\n\nOne self-contained HTML page with inline CSS and JavaScript. The dog is drawn with inline SVG. Today's meals are kept in localStorage under the date, so a new day starts fresh.`,
};

async function main() {
  mkdirSync('tmp', { recursive: true });
  const parent = client();
  if (phase === 'ship') {
    const started = Date.now();
    await parent.call('/api/parent/setup', { pin: '4321', kids: [{ nickname: 'Maya', group: 'kid', emoji: '🦄' }, { nickname: 'Leo', group: 'teen', emoji: '🚀' }] });
    await parent.call('/api/parent/unlock', { pin: '4321' });
    const kids = (await parent.call('/api/parent/kids')).body as { id: string; nickname: string }[];
    const maya = kids.find((k) => k.nickname === 'Maya')!, leo = kids.find((k) => k.nickname === 'Leo')!;

    // A project at the end of the Tech plan, as slice 5 leaves it.
    const id = 'verify6proj01';
    const now = Date.now();
    const project = {
      version: 1, id, kidId: maya.id, profile: { ageGroup: 'kid', experience: 0, theme: 'robots', inputMode: 'type' }, stage: 'build',
      docs: Object.fromEntries(Object.entries(PLAN).map(([k, md]) => [k, { kind: k, markdown: md, status: 'approved', updatedAt: now }])),
      messages: [{ thread: 'tech', role: 'model', text: JSON.stringify({ say: 'Your plan is ready!', techSummary: "I'll make one page with Biscuit, two big meal buttons, and a happy wag!", stageComplete: true }), seq: 0, at: now }],
      flags: [], usage: { calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, byModel: {} },
      timeline: [{ at: now, stage: 'build' }], createdAt: now, updatedAt: now,
    };
    const dir = join(FAMILY, 'kids', maya.id, 'projects', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'project.json'), JSON.stringify(project));
    writeFileSync(join(FAMILY, 'kids', maya.id, 'current.json'), JSON.stringify({ projectId: id }));

    const passFor = async (kidId: string) => {
      const p = (await parent.call('/api/parent/passes', { kidId, minutes: 120, replace: true })).body;
      const device = client();
      await device.call('/api/pass/open', { code: p.code });
      return device;
    };
    const tab = await passFor(maya.id);
    let r = await tab.call('/api/kid/journey');
    add('resumes at Build with the Tech plan one-liner', r.body.project?.stage === 'build' && !!r.body.project?.techSummary && !r.body.project?.app, `${r.body.project?.stage}: ${r.body.project?.techSummary}`);

    // Build (and, at the same time, the waiting chat and a change said while it builds).
    let t0 = Date.now();
    const building = tab.call('/api/kid/journey/build', { mode: 'full' });
    await new Promise((res) => setTimeout(res, 3000));
    const chat = await tab.call('/api/kid/journey/turn', {});
    const second = await tab.call('/api/kid/journey/build', { mode: 'full' });
    r = await building;
    const firstMs = Date.now() - t0;
    add('the first build returns a working page (Opus)', r.status === 200 && /^<!doctype html/i.test(r.body.html ?? '') && r.body.version === 1, `${r.status} v${r.body.version}, ${Math.round((r.body.html?.length ?? 0) / 1024)} KB in ${Math.round(firstMs / 1000)} s`);
    add('the waiting chat answers while it builds', chat.status === 200 && !!chat.body.reply?.say, (chat.body.reply?.say ?? JSON.stringify(chat.body)).slice(0, 120));
    add('a second build of the same project waits its turn (409)', second.status === 409, String(second.status));
    const v1 = r.body.html as string;

    // One change: said, then "that's all", then the rebuild.
    r = await tab.call('/api/kid/journey/changes', { text: 'make the Breakfast and Dinner buttons purple' });
    const listed = r.body.changes ?? [];
    r = await tab.call('/api/kid/journey/changes', { text: "that's all, build it" });
    add('the change goes on the list, and "that\'s all" makes it ready', listed.length === 1 && r.body.ready === true, `list: ${JSON.stringify(listed)} → ready ${r.body.ready}`);
    t0 = Date.now();
    r = await tab.call('/api/kid/journey/build', { mode: 'edit' });
    const editMs = Date.now() - t0;
    const v2 = r.body.html as string;
    add('the change is built as version 2 (or what is missing is said honestly)', r.status === 200 && r.body.version === 2 && v2 !== v1 && (Array.isArray(r.body.missing)), `v${r.body.version} in ${Math.round(editMs / 1000)} s; changed: ${r.body.changed ?? '—'}; missing: ${JSON.stringify(r.body.missing)}`);
    add('anything not built is back on the change list', JSON.stringify((await tab.call('/api/kid/journey')).body.project?.pendingChanges ?? []) === JSON.stringify(r.body.missing ?? []), `list now: ${JSON.stringify(r.body.missing ?? [])}`);

    // A repair after an error report keeps a working version.
    r = await tab.call('/api/kid/journey/build', { mode: 'repair', error: 'TypeError: Cannot read properties of null (reading "addEventListener")' });
    add('a repair returns a new working version', r.status === 200 && r.body.version === 3 && /^<!doctype html/i.test(r.body.html ?? ''), `v${r.body.version}: ${r.body.changed ?? ''}`.slice(0, 120));

    // Ship.
    r = await tab.call('/api/kid/journey/ship', { name: 'Biscuit Feeder' });
    const app = r.body;
    const file = join(FAMILY, 'kids', maya.id, 'apps', app.slug ?? 'x', 'index.html');
    add('ship: on the shelf with a link and a home-Wi-Fi QR code', r.status === 200 && app.slug === 'biscuit-feeder' && app.path === `/apps/${maya.id}/biscuit-feeder/` && (!app.homeUrl || app.qr?.startsWith('data:image/png')), `${app.path} · ${app.homeUrl ?? 'no home address'}`);
    add('index.html exists, titled with the chosen name, with the badge', existsSync(file) && /<title>Biscuit Feeder<\/title>/.test(readFileSync(file, 'utf8')) && readFileSync(file, 'utf8').includes('Made with Build With Me'), file.replace(FAMILY, '<family>'));
    const shelfR = await tab.call('/api/kid/apps');
    add("the kid's My apps shelf lists it", shelfR.body.length === 1 && shelfR.body[0].name === 'Biscuit Feeder', shelfR.body.map((a: any) => a.name).join(', '));
    r = await tab.call('/api/kid/journey');
    add('after shipping, the next pass starts a new app', r.body.project === null, JSON.stringify(r.body).slice(0, 60));

    // Serving: CSP, the laptop, the kid's pass, another kid's pass.
    const served = await tab.call(app.path);
    const csp = String(served.headers['content-security-policy'] ?? '');
    add('served with the strict Content-Security-Policy', served.status === 200 && csp.includes("connect-src 'none'") && csp.includes("default-src 'none'") && String(served.body).includes('sandbox="allow-scripts allow-forms"'), csp.slice(0, 90));
    const other = await passFor(leo.id);
    const leoTry = await other.call(app.path);
    add("another kid's pass gets 403", leoTry.status === 403, String(leoTry.status));
    const pm = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
    add('versions, usage and stage are saved in the project', pm.versions?.length === 3 && pm.stage === 'ship' && pm.usage.byModel.opus > 0, `${pm.versions?.length} versions, ${pm.usage.calls} calls ($${pm.usage.costUsd.toFixed(2)} estimate), stage ${pm.stage}`);
    writeFileSync(STATE, JSON.stringify({ kidId: maya.id, slug: app.slug, path: app.path, file }));
    console.log(`\nphase 1: ${checks.filter((c) => c.pass).length}/${checks.length} in ${Math.round((Date.now() - started) / 1000)} s. Open ${BASE}${app.path} in a browser now.`);
  } else if (phase === 'serve') {
    // Serving on its own (re-run after a fix without rebuilding): CSP, the kid's pass, another kid's pass.
    const st = JSON.parse(readFileSync(STATE, 'utf8'));
    await parent.call('/api/parent/unlock', { pin: '4321' });
    const kids = (await parent.call('/api/parent/kids')).body as { id: string; nickname: string }[];
    const leo = kids.find((k) => k.nickname === 'Leo')!;
    const passFor = async (kidId: string) => {
      const p = (await parent.call('/api/parent/passes', { kidId, minutes: 60, replace: true })).body;
      const device = client(); await device.call('/api/pass/open', { code: p.code }); return device;
    };
    const tab = await passFor(st.kidId);
    const served = await tab.call(st.path);
    const csp = String(served.headers['content-security-policy'] ?? '');
    add('served with the strict Content-Security-Policy', served.status === 200 && csp.includes("connect-src 'none'") && csp.includes("default-src 'none'") && String(served.body).includes('sandbox="allow-scripts allow-forms"'), `${served.status} · ${csp.slice(0, 80)}`);
    const noSlash = await tab.call(st.path.replace(/\/$/, ''));
    add('the link also works without the final slash', noSlash.status === 200, String(noSlash.status));
    const other = await passFor(leo.id);
    const leoTry = await other.call(st.path);
    add("another kid's pass gets 403", leoTry.status === 403, String(leoTry.status));
  } else {
    const st = JSON.parse(readFileSync(STATE, 'utf8'));
    await parent.call('/api/parent/unlock', { pin: '4321' });
    const before = (await parent.call('/api/parent/apps')).body[st.kidId]?.length;
    const r = await parent.call(`/api/parent/kids/${st.kidId}/apps/${st.slug}`, undefined, 'DELETE');
    const after = (await parent.call('/api/parent/apps')).body[st.kidId]?.length;
    add('delete removes the folder and the shelf entry', r.status === 200 && before === 1 && after === 0 && !existsSync(st.file), `apps ${before} → ${after}; file gone: ${!existsSync(st.file)}`);
    const gone = await parent.call(st.path);
    add('its link now says not found', gone.status === 404, String(gone.status));
  }
  const prev = existsSync('tmp/verify-6.json') && phase !== 'ship' ? JSON.parse(readFileSync('tmp/verify-6.json', 'utf8')) : [];
  const all = [...prev, ...checks];
  writeFileSync('tmp/verify-6.json', JSON.stringify(all, null, 2));
  console.log(`${checks.filter((c) => c.pass).length}/${checks.length} passed (all so far: ${all.filter((c: any) => c.pass).length}/${all.length})`);
  process.exit(checks.every((c) => c.pass) ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
