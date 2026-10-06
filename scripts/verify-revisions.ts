// Revision round after the family trial (devpost/ui-review.md > Family trial notes): runs the real
// server in-process on a test port with a temporary family folder. No Claude calls: "claude"
// points at a file that can't start, and simulate-limit answers every journey call. Silent.
// Run: npm run verify:revisions   (after npm run build:web)

import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';

const FAMILY = mkdtempSync(join(tmpdir(), 'bwm-verifyrev-'));
const PLUGIN = join(FAMILY, '.plugin-data');
process.env.BWM_DATA = FAMILY;
process.env.BWM_PLUGIN_DATA = PLUGIN;
mkdirSync(PLUGIN, { recursive: true });
writeFileSync(join(PLUGIN, 'simulate-limit'), '');
writeFileSync(join(PLUGIN, 'not-claude.txt'), 'not a program');
process.env.BWM_CLAUDE_PATH = join(PLUGIN, 'not-claude.txt');
const PORT = 4785;

const checks: { name: string; pass: boolean; detail: string }[] = [];
const add = (name: string, pass: boolean, detail: string) => { checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

type Res = { status: number; body: any; text: string };
function client(base: string) {
  const jar = new Map<string, string>();
  const call = (path: string, body?: unknown, method?: string) => new Promise<Res>((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const r = http.request(base + path, {
      method: method ?? (data ? 'POST' : 'GET'),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', ...(data ? { 'Content-Type': 'application/json' } : {}), ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) },
    }, (res) => {
      for (const c of res.headers['set-cookie'] ?? []) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (!v) jar.delete(k); else jar.set(k, v); }
      let t = ''; res.on('data', (d) => (t += d)); res.on('end', () => { let j: any = t; try { j = JSON.parse(t); } catch {} resolve({ status: res.statusCode ?? 0, body: j, text: t }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
  return { call, jar };
}

const APP = '<!doctype html><html><head><title>Biscuit Feeder</title></head><body><h1>Biscuit Feeder</h1><svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg></body></html>';
const reply = (say: string, question?: string, extra: object = {}) => JSON.stringify({ say, ...(question ? { question } : {}), stageComplete: false, ...extra });

async function main() {
  const { startServer } = await import('../server/index.js');
  const server = await startServer({ httpPort: PORT, httpsPort: PORT + 1 });
  const base = `http://localhost:${PORT}`;
  const parent = client(base);
  try {
    await parent.call('/api/parent/setup', { pin: '4321', kids: [{ nickname: 'Maya', group: 'kid', emoji: '🦄' }, { nickname: 'Leo', group: 'teen', emoji: '🚀' }] });
    const kids = (await parent.call('/api/parent/kids')).body as { id: string; nickname: string }[];
    const maya = kids.find((k) => k.nickname === 'Maya')!;
    const now = Date.now(), m = (min: number) => now - 40 * 60_000 + min * 60_000;

    // A project in the Build stage with one version and two ideas from the waiting chat.
    const mid = 'verifyrevmaya1';
    const project = {
      version: 1, id: mid, kidId: maya.id, profile: { ageGroup: 'kid', experience: 0, theme: 'robots', inputMode: 'type' }, stage: 'build',
      docs: { scope: { kind: 'scope', markdown: '# Idea plan: Biscuit Feeder\nA helper that reminds me to feed my dog.', status: 'approved', updatedAt: m(10) } },
      messages: [
        { thread: 'build-wait', role: 'model', text: reply('Your app is on its way!', 'What could make it even better later?'), seq: 0, at: m(22) },
        { thread: 'build-wait', role: 'user', text: 'a night mode with stars', seq: 1, at: m(22.5) },
        { thread: 'build-wait', role: 'model', text: reply("Ooh, I'll keep that idea for you!", undefined, { laterIdea: 'add a night mode with stars' }), seq: 2, at: m(22.6) },
      ],
      flags: [], usage: { calls: 10, costUsd: 0.2, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, byModel: {} },
      timeline: [{ at: m(0), stage: 'start' }, { at: m(21), stage: 'build' }],
      versions: [{ n: 1, mode: 'full', note: 'first build', at: m(24) }],
      laterIdeas: ['add a night mode with stars', 'make the dog bigger'],
      createdAt: m(0), updatedAt: m(24),
    };
    const dir = join(FAMILY, 'kids', maya.id, 'projects', mid);
    mkdirSync(join(dir, 'versions'), { recursive: true });
    writeFileSync(join(dir, 'versions', 'v1.html'), APP);
    writeFileSync(join(dir, 'project.json'), JSON.stringify(project));
    writeFileSync(join(FAMILY, 'kids', maya.id, 'current.json'), JSON.stringify({ projectId: mid }));

    const pass = (await parent.call('/api/parent/passes', { kidId: maya.id, minutes: 30 })).body;
    const kid = client(base);
    await kid.call('/api/pass/open', { code: pass.code });

    // ---------- batch 1: ideas from the waiting chat ----------
    let r = await kid.call('/api/kid/journey/changes/ideas', { ideas: ['add a night mode with stars', 'delete everything'] });
    add('waiting-chat ideas go onto the change list with one tap (only ideas the project really has)', r.status === 200 && JSON.stringify(r.body.changes) === JSON.stringify(['add a night mode with stars']), JSON.stringify(r.body));
    r = await kid.call('/api/kid/journey/changes/ideas', { ideas: ['add a night mode with stars', 'make the dog bigger'] });
    add('…no doubles, and a second idea joins it', JSON.stringify(r.body.changes) === JSON.stringify(['add a night mode with stars', 'make the dog bigger']), JSON.stringify(r.body.changes));

    const { commitProject, readProject } = await import('../server/journey/project.js');
    const before = readProject(maya.id, mid)!;
    const after = { ...structuredClone(before), laterIdeas: [...(before.laterIdeas ?? []), 'a bark sound'] };
    commitProject(before, after as any);
    add('a new idea is kept when the turn is saved (merged into the project)', (readProject(maya.id, mid)!.laterIdeas ?? []).includes('a bark sound'), JSON.stringify(readProject(maya.id, mid)!.laterIdeas));

    const { renderReport } = await import('../server/report/template.js');
    const base0 = { id: 'r1', kidId: maya.id, kidName: 'Maya', group: 'kid', projectId: mid, finished: true, createdAt: now, startedAt: m(0), endedAt: now, activeMinutes: 30, passMinutes: 30, rounds: 1, device: 'iPad', answered: 'typing', app: null, usage: { own: 2, account: null, otherPct: null, others: [], tokens: 1, calibratedFrom: 3 }, flags: [], checks: { personal: { ok: true, text: 'ok' }, output: { ok: true, text: 'ok' }, onTopic: { ok: true, text: 'ok' } }, badge: 'none', title: 'T', summary: 'S', ideasShareKid: 80, ideasNote: 'n', worthAChat: '', starters: [], timeline: [], transcript: [], writer: 'opus' };
    const html = renderReport({ ...base0, laterIdeas: ['add a night mode with stars', '<b>x</b>'] } as any);
    add('the parent report lists the ideas from the wait (escaped)', html.includes('Ideas Maya had while the app was building') && html.includes('&lt;b&gt;x&lt;/b&gt;'), 'shown in "Whose ideas?"');

    // ---------- batch 1: small fixes ----------
    mkdirSync(join(FAMILY, 'kids', maya.id, 'apps', 'biscuit-feeder'), { recursive: true });
    writeFileSync(join(FAMILY, 'kids', maya.id, 'apps', 'biscuit-feeder', 'index.html'), APP);
    writeFileSync(join(FAMILY, 'kids', maya.id, 'apps.json'), JSON.stringify({ apps: [{ slug: 'biscuit-feeder', name: 'Biscuit Feeder', emoji: '🤖', createdAt: now, projectId: mid, version: 1 }] }));
    r = await kid.call(`/apps/${maya.id}/biscuit-feeder/`);
    add('an opened app has a thin bar with its name and "← Back"', r.status === 200 && r.text.includes('← Back') && r.text.includes('<span>Biscuit Feeder</span>'), `status ${r.status}`);
    r = await parent.call('/setup-tablet');
    add('the tablet setup "All set" says what to do if the page still says Not secure', r.text.includes('close the browser completely'), 'in the Check result');
  } finally {
    await server.close();
  }
  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
