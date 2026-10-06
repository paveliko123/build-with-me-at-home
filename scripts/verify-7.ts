// Slice 7 verification: parent reports, plan usage, alerts and limit reached. Talks to a running
// test server (BWM_TEST_URL) whose family folder is BWM_DATA and plugin folder BWM_PLUGIN_DATA.
// Projects are written in directly (a finished app with a flag; an unfinished Idea step), so no
// build is needed; the reports themselves are real Opus reviews (a minute or two each).
// Run: npx tsx scripts/verify-7.ts   Results: tmp/verify-7.json

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import { readUsage } from '../server/usage.js';

const BASE = process.env.BWM_TEST_URL ?? 'http://127.0.0.1:4787';
const FAMILY = process.env.BWM_DATA!;
const PLUGIN = process.env.BWM_PLUGIN_DATA!;
const checks: { name: string; pass: boolean; detail: string }[] = [];
const add = (name: string, pass: boolean, detail: string) => { checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    r.on('error', reject); if (data) r.write(data); r.end();
  });
  return { call };
}

const APP = `<!doctype html>
<!-- changed: The first version: Biscuit, two meal buttons and a wag. -->
<html lang="en"><head><meta charset="utf-8"><title>Biscuit Feeder</title><style>body{font-family:system-ui;text-align:center;background:#bde3ff}button{font-size:28px;padding:16px 28px;margin:8px;border-radius:18px;border:0;background:#8a5cd6;color:#fff}</style></head>
<body><h1>Biscuit Feeder</h1><p id="msg">Biscuit is hungry!</p><button id="b">Breakfast</button><button id="d">Dinner</button>
<script>document.getElementById('b').onclick=function(){document.getElementById('msg').textContent='Yum! Breakfast done!'};document.getElementById('d').onclick=function(){document.getElementById('msg').textContent='Yum! Dinner done!'};</script></body></html>`;

const reply = (say: string, question?: string, extra: object = {}) => JSON.stringify({ say, ...(question ? { question } : {}), stageComplete: false, ...extra });

async function main() {
  const started = Date.now();
  mkdirSync('tmp', { recursive: true });
  const parent = client();
  await parent.call('/api/parent/setup', { pin: '4321', kids: [{ nickname: 'Maya', group: 'kid', emoji: '🦄' }, { nickname: 'Leo', group: 'teen', emoji: '🚀' }] });
  await parent.call('/api/parent/unlock', { pin: '4321' });
  const kids = (await parent.call('/api/parent/kids')).body as { id: string; nickname: string }[];
  const maya = kids.find((k) => k.nickname === 'Maya')!, leo = kids.find((k) => k.nickname === 'Leo')!;
  // The rate for "this app's own share", as E3 left it on the learner's plan (calibration.ts).
  writeFileSync(join(FAMILY, 'usage-calibration.json'), JSON.stringify([
    { at: started, pct: 3, cost: 0.90, source: 'e3' }, { at: started, pct: 2, cost: 1.18, source: 'e3' }, { at: started, pct: 2, cost: 1.54, source: 'e3' },
  ]));
  const u0 = await readUsage();
  add('plan usage is readable for the "before" reading', u0.ok, `5-hour ${u0.fiveHourPct}% · weekly ${u0.weeklyPct}%`);

  // ---------- Maya: a finished app with one flag ----------
  const t = Date.now() - 50 * 60_000, m = (min: number) => t + min * 60_000;
  const mid = 'verify7maya01';
  const mayaProject = {
    version: 1, id: mid, kidId: maya.id, profile: { ageGroup: 'kid', experience: 0, theme: 'robots', inputMode: 'type' }, stage: 'build',
    docs: { scope: { kind: 'scope', markdown: '# Idea plan: Biscuit Feeder\nA helper that reminds me to feed my dog Biscuit.', status: 'approved', updatedAt: m(10) } },
    messages: [
      { thread: 'start', role: 'user', text: "[app] The person has just arrived at the Start (document: learner profile) stage. Begin.", seq: 0, at: m(0) },
      { thread: 'start', role: 'model', text: reply("Beep boop! I'm an AI helper, not a person.", 'What do you love doing?'), seq: 1, at: m(0.5) },
      { thread: 'start', role: 'user', text: 'playing with my dog Biscuit', seq: 2, at: m(2) },
      { thread: 'idea', role: 'model', text: reply('What could your app do for Biscuit?'), seq: 3, at: m(5) },
      { thread: 'idea', role: 'user', text: '(A message that was left out because it was not suitable.)', seq: 4, at: m(7) },
      { thread: 'idea', role: 'model', text: reply("Hmm, let's make something else instead! 🙂", 'What could your app do for Biscuit?'), seq: 5, at: m(7.5) },
      { thread: 'idea', role: 'user', text: 'remind me to feed him breakfast and dinner', seq: 6, at: m(9) },
      { thread: 'idea', role: 'model', text: reply('A feeding helper for Biscuit, with a happy wag after each meal!', 'Sound good?'), seq: 7, at: m(9.5) },
      { thread: 'idea', role: 'user', text: 'yes!', seq: 8, at: m(10) },
      { thread: 'tech', role: 'model', text: reply('Plan done!', undefined, { techSummary: "I'll make one page with Biscuit and two big meal buttons!" }), seq: 9, at: m(20) },
      { thread: 'changes', role: 'user', text: '[app] Current change list:\n(empty)\n\nThe person said: "make the buttons purple"', seq: 10, at: m(30) },
      { thread: 'changes', role: 'model', text: JSON.stringify({ say: 'Added to your list: purple buttons.', changes: ['Make the buttons purple'], ready: false }), seq: 11, at: m(30.2) },
    ],
    flags: [{ at: m(7), stage: 'idea', direction: 'input', verdict: 'unsuitable', category: 'violence', text: 'make the cat explode with blood' }],
    usage: { calls: 30, costUsd: 0.6, inputTokens: 20000, outputTokens: 8000, cacheReadTokens: 120000, cacheWriteTokens: 30000, byModel: { sonnet: 14, haiku: 14, opus: 2 } },
    timeline: [{ at: m(0), stage: 'start' }, { at: m(3), stage: 'idea' }, { at: m(12), stage: 'design' }, { at: m(18), stage: 'tech' }, { at: m(21), stage: 'build' }],
    versions: [{ n: 1, mode: 'full', note: 'first build', at: m(24) }, { n: 2, mode: 'edit', note: '1. Make the buttons purple', at: m(33) }],
    usageStart: { at: u0.at, fiveHourPct: u0.fiveHourPct, weeklyPct: u0.weeklyPct },
    createdAt: m(0), updatedAt: m(33),
  };
  const mdir = join(FAMILY, 'kids', maya.id, 'projects', mid);
  mkdirSync(join(mdir, 'versions'), { recursive: true });
  writeFileSync(join(mdir, 'versions', 'v1.html'), APP);
  writeFileSync(join(mdir, 'versions', 'v2.html'), APP);
  writeFileSync(join(mdir, 'project.json'), JSON.stringify(mayaProject));
  writeFileSync(join(FAMILY, 'kids', maya.id, 'current.json'), JSON.stringify({ projectId: mid }));

  const passFor = async (kidId: string) => {
    const p = (await parent.call('/api/parent/passes', { kidId, minutes: 90, replace: true })).body;
    const device = client(); await device.call('/api/pass/open', { code: p.code });
    return { device, pass: p };
  };
  const { device: tab } = await passFor(maya.id);
  let r = await tab.call('/api/kid/journey/ship', { name: 'Biscuit Feeder' });
  add('ship works', r.status === 200 && r.body.slug === 'biscuit-feeder', `${r.status} ${r.body.slug ?? JSON.stringify(r.body)}`);

  const waitReports = async (n: number, maxMs = 8 * 60_000) => {
    const until = Date.now() + maxMs;
    while (Date.now() < until) { const list = (await parent.call('/api/parent/reports')).body; if (Array.isArray(list) && list.length >= n) return list; await sleep(4000); }
    return (await parent.call('/api/parent/reports')).body;
  };
  let reports = await waitReports(1);
  const rep = reports[0];
  add('shipping makes a report (Latest / All reports)', !!rep && rep.kidName === 'Maya' && rep.finished && rep.what === 'Biscuit Feeder', rep ? `${rep.title} · ${Math.round((Date.now() - started) / 1000)} s so far` : 'none');
  const files = existsSync(join(FAMILY, 'Reports')) ? readdirSync(join(FAMILY, 'Reports')) : [];
  const html = files[0] ? readFileSync(join(FAMILY, 'Reports', files[0]), 'utf8') : '';
  add('a report file is written to the Reports folder (and nothing else is in it)', files.length === 1 && /^\d{4}-\d\d-\d\d \d{4} Maya - Biscuit Feeder\.html$/.test(files[0] ?? ''), files.join(', ') || 'none');
  const sections = ['In one paragraph', 'The app', 'Safety', 'Whose ideas?', 'How it went', 'Talk about it together', 'Full conversation'];
  const missing = sections.filter((h) => !html.includes(h));
  add('the HTML has every mockup section', !missing.length && html.includes('rounds of changes') && html.includes('how Maya answered'), missing.length ? `missing: ${missing.join(', ')}` : sections.join(' · '));
  add('it opens standalone (no scripts, no outside files)', !/<script|<link|src="http|@import/i.test(html) && html.includes('<style>'), `${Math.round(html.length / 1024)} KB, only the app link points at the running app`);
  // Maya's project had a "before" reading: her report shows the app's own share (from its own
  // calls) and the whole account's change, and never a dollar amount.
  const own = html.match(/<b>≈((?:&lt;)?[\d.]+%)<\/b><span>of your 5-hour limit: this app's own use/)?.[1];
  const account = html.match(/<b>\+?((?:&lt;)?[\d.]+%) · \+?((?:&lt;)?[\d.]+%)<\/b><span>your whole account while it was made/);
  add("the app's own share and the account's change are shown", !!own && !!account, `≈${own?.replace('&lt;', '<')} own · account +${account?.[1].replace('&lt;', '<')} (5-hour) +${account?.[2].replace('&lt;', '<')} (weekly)`);
  add('no dollar amounts in the report', !html.includes('$'), html.includes('$') ? html.slice(Math.max(0, html.indexOf('$') - 60), html.indexOf('$') + 20) : 'none');
  add('the flagged session → "1 flag · handled" badge', rep?.badge === 'handled' && rep.flags === 1 && html.includes('1 flag · handled'), `badge ${rep?.badge}, flags ${rep?.flags}`);
  const alerts = (await parent.call('/api/parent/alerts')).body;
  const flagAlert = alerts.find((a: any) => a.kind === 'flag' && a.reportId === rep?.id);
  add('…and an alert under Needs your attention', !!flagAlert, flagAlert?.text ?? JSON.stringify(alerts));
  const inApp = await parent.call(`/api/parent/reports/${rep?.id}/html`);
  add('the same report opens in the Parent area', inApp.status === 200 && String(inApp.body).includes('Whose ideas?'), String(inApp.status));
  const kidTry = await tab.call(`/api/parent/reports/${rep?.id}/html`);
  add('a kid cannot open reports', kidTry.status === 401 || kidTry.status === 403, String(kidTry.status));
  writeFileSync('tmp/verify-7-report.html', html);

  // ---------- Leo: an unfinished session, ended by the parent ----------
  const lp = await passFor(leo.id);
  const lid = 'verify7leo001';
  const now = Date.now();
  const leoProject = {
    ...mayaProject, id: lid, kidId: leo.id, profile: { ageGroup: 'teen', experience: 2, theme: 'space', inputMode: 'talk' }, stage: 'idea', docs: {},
    messages: [
      { thread: 'start', role: 'model', text: reply("I'm an AI helper, not a person.", 'What do you want to build?'), seq: 0, at: now + 1 },
      { thread: 'start', role: 'user', text: 'a soccer stats tracker for my team', seq: 1, at: now + 2 },
      { thread: 'idea', role: 'model', text: reply('Nice! A stats tracker for your soccer games.', 'Which stats matter most to you?'), seq: 2, at: now + 3 },
    ],
    flags: [], versions: [], timeline: [{ at: now - 120_000, stage: 'start' }, { at: now + 2, stage: 'idea' }], createdAt: now - 120_000, updatedAt: now,
    usage: { calls: 6, costUsd: 0.08, inputTokens: 4000, outputTokens: 900, cacheReadTokens: 20000, cacheWriteTokens: 9000, byModel: { sonnet: 3, haiku: 3 } }, usageStart: undefined,
  };
  const ldir = join(FAMILY, 'kids', leo.id, 'projects', lid);
  mkdirSync(ldir, { recursive: true });
  writeFileSync(join(ldir, 'project.json'), JSON.stringify(leoProject));
  writeFileSync(join(FAMILY, 'kids', leo.id, 'current.json'), JSON.stringify({ projectId: lid }));
  await lp.device.call('/api/kid/journey'); // the kid is on the page (the device is recorded)
  await parent.call(`/api/parent/passes/${lp.pass.id}/end`, {});
  reports = await waitReports(2);
  const unfinished = reports.find((x: any) => x.kidName === 'Leo');
  add('an ended, unshipped pass → a "(not finished)" report', !!unfinished && !unfinished.finished && unfinished.what === '(not finished)', unfinished ? `${unfinished.title}` : 'none');
  const leoHtml = unfinished ? String((await parent.call(`/api/parent/reports/${unfinished.id}/html`)).body) : '';
  add("…saying where it stopped; with no start reading it still shows the app's own share", leoHtml.includes('stopped at <b>Idea</b>') && leoHtml.includes("this app's own use") && leoHtml.includes('began before Build With Me measured it') && !leoHtml.includes('$'), leoHtml.match(/stopped at <b>[^<]+<\/b>/)?.[0] ?? 'no');

  // ---------- usage shapes the server doesn't make here (rendered directly) ----------
  const { renderReport } = await import('../server/report/template.js');
  const base = JSON.parse(readFileSync(join(FAMILY, 'report-data', `${rep?.id}.json`), 'utf8'));
  const legacy = renderReport({ ...base, usage: { kind: 'tokens', tokens: 367942, costUsd: 1.53, reason: 'The plan usage reading at the start was not available.' } });
  add('a report from before this change shows the own share, without dollars', legacy.includes("this app's own use") && !legacy.includes('$'), legacy.match(/<b>≈[^<]+<\/b>/)?.[0] ?? 'no own share');
  const tokensOnly = renderReport({ ...base, usage: { own: null, account: null, otherPct: null, others: [], tokens: 367942, calibratedFrom: 0, note: "Claude Code's plan usage could not be read." } });
  add('not calibrated and no reading → tokens only, without dollars', tokensOnly.includes('368k tokens') && !tokensOnly.includes('$'), tokensOnly.match(/<b>\d+k tokens<\/b><span>[^<]+/)?.[0] ?? 'no');
  const late = renderReport({ ...base, usage: { own: 2.1, account: { fiveHourPct: 5, weeklyPct: 1, from: base.startedAt + 3_600_000, late: true }, otherPct: null, others: [], tokens: 1, calibratedFrom: 3 } });
  const busy = renderReport({ ...base, usage: { own: 2.1, account: { fiveHourPct: 6, weeklyPct: 1, from: base.startedAt, late: false }, otherPct: 4, others: [], tokens: 1, calibratedFrom: 3 } });
  add('a late reading says "since <time>"; extra account use is called out', /your whole account since \d/.test(late) && busy.includes('About 4% of that was other use at the same time: your own Claude use.'), 'late + busy rendered');

  // ---------- simulated limit ----------
  const lp2 = await passFor(leo.id);
  writeFileSync(join(PLUGIN, 'simulate-limit'), 'test');
  try {
    r = await lp2.device.call('/api/kid/journey/turn', { text: 'goals and assists' });
    add('a simulated "rejected" limit → the kid gets "limit"', r.status === 429 && r.body.error === 'limit' && typeof r.body.resetsAt === 'number', `${r.status} ${JSON.stringify(r.body)}`);
    const limitAlert = (await parent.call('/api/parent/alerts')).body.find((a: any) => a.kind === 'limit' && a.kidName === 'Leo');
    add('…and a parent alert with whose session and the reset time', !!limitAlert && /Leo/.test(limitAlert.text) && typeof limitAlert.resetsAt === 'number', limitAlert ? `${limitAlert.text} (resets ${new Date(limitAlert.resetsAt).toLocaleTimeString()})` : 'none');
    const saved = JSON.parse(readFileSync(join(ldir, 'project.json'), 'utf8'));
    add('the work is saved (nothing lost)', saved.messages.length === 3 && saved.stage === 'idea', `${saved.messages.length} messages, at ${saved.stage}`);
  } finally {
    rmSync(join(PLUGIN, 'simulate-limit'), { force: true });
  }
  const dismissed = await parent.call(`/api/parent/alerts/${flagAlert?.id}/dismiss`, {});
  const left = (await parent.call('/api/parent/alerts')).body;
  add('alerts can be dismissed', dismissed.body.ok && !left.some((a: any) => a.id === flagAlert?.id), `${left.length} left`);

  writeFileSync('tmp/verify-7.json', JSON.stringify(checks, null, 2));
  const passed = checks.filter((c) => c.pass).length;
  console.log(`\n${passed}/${checks.length} passed in ${Math.round((Date.now() - started) / 1000)} s (report saved as tmp/verify-7-report.html)`);
  process.exit(passed === checks.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
