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
const DESIGN_PLAN = `# Biscuit's Feeding Helper: The Design Plan

A helper that reminds me to feed my dog, Biscuit, and shows a happy dog after I do.

## How it works
1. I open the helper and see a cartoon Biscuit and big buttons.
2. When it's time to feed Biscuit, the helper rings a loud bell.
3. I press the big "I fed Biscuit!" button.

## What you see
- One screen with a cartoon dog and big buttons.

## The look
- Style chosen: **Crayon Doodle**.
- Warm yellow background.

## What it does
- **Reminder:** a loud bell sound tells me it's dinner time.

## How we'll know it works
- The loud bell rings when it's time to feed Biscuit.

## What we're leaving out for now
- Exact feeding times: not discussed.
`;
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

    // ---------- batch 2: the teen's plan card and "How I planned it" ----------
    const { summarizePlan } = await import('../web/src/kid/journey/lib/planSummary.js');
    const sum = summarizePlan(DESIGN_PLAN);
    const icons = sum.points.map((p) => p.icon).join('');
    add('the plan card shows the title, the one-line summary and up to 5 key sections with icons', sum.title === "Biscuit's Feeding Helper" && /reminds me to feed/.test(sum.summary) && sum.points.length >= 4 && sum.points.length <= 5 && icons.includes('⭐') && icons.includes('🎨'), `${sum.title} · ${icons} · ${sum.points.map((p) => p.label).join(' / ')}`);
    add('…and leaves out "not discussed" lines', !JSON.stringify(sum).includes('not discussed'), 'none shown');

    const leo = kids.find((k) => k.nickname === 'Leo')!;
    const lid = 'verifyrevleo01';
    const leoProject = {
      ...project, id: lid, kidId: leo.id, profile: { ageGroup: 'teen', experience: 2, theme: 'space', inputMode: 'type' }, stage: 'ship', messages: [], laterIdeas: [],
      docs: { scope: { kind: 'scope', markdown: '# Rocket Dodge\nDodge rocks in space.\n\n## How it works\n- Tap to move', status: 'approved', updatedAt: m(5) }, prd: { kind: 'prd', markdown: DESIGN_PLAN, status: 'approved', updatedAt: m(9) }, spec: { kind: 'spec', markdown: '# Tech plan', status: 'draft', updatedAt: m(12) } },
      shipped: { name: 'Rocket Dodge', slug: 'rocket-dodge', at: now },
    };
    const ldir = join(FAMILY, 'kids', leo.id, 'projects', lid);
    mkdirSync(join(ldir, 'versions'), { recursive: true });
    writeFileSync(join(ldir, 'versions', 'v1.html'), APP);
    writeFileSync(join(ldir, 'project.json'), JSON.stringify(leoProject));
    mkdirSync(join(FAMILY, 'kids', leo.id, 'apps', 'rocket-dodge'), { recursive: true });
    writeFileSync(join(FAMILY, 'kids', leo.id, 'apps', 'rocket-dodge', 'index.html'), APP);
    writeFileSync(join(FAMILY, 'kids', leo.id, 'apps.json'), JSON.stringify({ apps: [{ slug: 'rocket-dodge', name: 'Rocket Dodge', emoji: '🚀', createdAt: now, projectId: lid, version: 1 }] }));
    const passL = (await parent.call('/api/parent/passes', { kidId: leo.id, minutes: 30 })).body;
    const teen = client(base);
    await teen.call('/api/pass/open', { code: passL.code });
    const shelfL = (await teen.call('/api/kid/apps')).body;
    const shelfM = (await kid.call('/api/kid/apps')).body;
    add('My apps offers "How I planned it" for a teen\'s app, never for a kid\'s', shelfL[0]?.hasPlan === true && shelfM[0]?.hasPlan === false, `teen ${shelfL[0]?.hasPlan}, kid ${shelfM[0]?.hasPlan}`);
    r = await teen.call('/api/kid/apps/rocket-dodge/plan');
    const r2 = await kid.call('/api/kid/apps/biscuit-feeder/plan');
    const r3 = await kid.call('/api/kid/apps/rocket-dodge/plan');
    add('"How I planned it" returns only approved plans, only to that teen', r.status === 200 && r.body.docs.map((d: any) => d.kind).join(',') === 'scope,prd' && r2.status === 404 && r3.status === 404, `teen ${r.status} ${r.body.docs?.map((d: any) => d.kind)} · kid's own ${r2.status} · another kid's ${r3.status}`);

    // ---------- batch 3: each app's own icon ----------
    const { extractIcon, oneEmoji } = await import('../server/journey/appIcon.js');
    const ICON = '<svg id="bwm-icon" viewBox="0 0 64 64" style="display:none" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#ffd166"/><circle cx="32" cy="34" r="16" fill="#8d5524"/></svg>';
    const bad = ['<script>x()</script>', '<image href="https://t.example/p.png"/>', '<circle onclick="x()" r="3"/>', '<a href="https://x"><circle r="3"/></a>', '<foreignObject><div>hi</div></foreignObject>'];
    const refused = bad.filter((b) => extractIcon(`<svg id="bwm-icon" viewBox="0 0 64 64"><rect width="64" height="64"/>${b}</svg>`) === null).length;
    const good = extractIcon(`<body>${ICON}</body>`);
    add('the builder\'s drawn icon is taken only when it\'s a plain drawing', !!good && good.startsWith('<svg xmlns=') && !good.includes('display:none') && refused === bad.length, `plain drawing kept · ${refused}/${bad.length} unsafe ones refused`);
    add('an emoji choice must be one emoji', oneEmoji('🐉') === '🐉' && oneEmoji('👩‍🚀') === '👩‍🚀' && oneEmoji('hi') === null && oneEmoji('🐉🐉') === null && oneEmoji('<b>') === null, '🐉 and 👩‍🚀 yes · text, two emojis, markup no');

    // Maya ships a new version that has a drawn icon, picking the drawing.
    const withIcon = APP.replace('<body>', `<body>${ICON}`);
    writeFileSync(join(dir, 'versions', 'v2.html'), withIcon);
    const p2 = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
    p2.versions.push({ n: 2, mode: 'edit', note: 'icon', at: now }); p2.appEmojis = ['🐶', '🦴'];
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p2));
    r = await kid.call('/api/kid/journey');
    add('the resumed project carries the emojis that fit the app', JSON.stringify(r.body.project?.appEmojis) === JSON.stringify(['🐶', '🦴']), JSON.stringify(r.body.project?.appEmojis));
    r = await kid.call('/api/kid/journey/ship', { name: 'Biscuit Time', icon: { kind: 'drawing' } });
    const iconUrl = r.body.iconUrl as string;
    add('shipping with the drawing saves it as the app\'s icon (and the guide\'s emoji as backup)', r.status === 200 && r.body.icon === true && /\/apps\/.+\/biscuit-time\/icon\.svg$/.test(iconUrl ?? '') && r.body.emoji === '🐶', `${r.status} · ${iconUrl} · ${r.body.emoji}`);
    const svgRes = await kid.call(iconUrl);
    const other = await teen.call(iconUrl);
    add('the icon is served as an image, only to this kid (or the laptop and parent)', svgRes.status === 200 && svgRes.text.startsWith('<svg') && other.status === 404, `Maya ${svgRes.status} · Leo's pass ${other.status}`);
    r = await kid.call(`/apps/${maya.id}/biscuit-time/`);
    add('the opened app uses its icon in the browser tab', /<link rel="icon" href="data:image\/svg\+xml;base64,/.test(r.text), 'tab icon set');
    const shelfNow = (await kid.call('/api/kid/apps')).body as any[];
    add('My apps shows the icon', shelfNow.find((a) => a.slug === 'biscuit-time')?.iconUrl === iconUrl, 'iconUrl on the shelf');
    const reportHtml = renderReport({ ...base0, app: { name: 'Biscuit Time', path: '/x/', url: 'http://localhost/x/', emoji: '🐶', icon: `data:image/svg+xml;base64,${Buffer.from(good!).toString('base64')}`, description: 'd' } } as any);
    const forged = renderReport({ ...base0, app: { name: 'X', path: '/x/', url: 'http://localhost/x/', emoji: '🐶', icon: 'javascript:alert(1)', description: 'd' } } as any);
    add('the report shows the app\'s icon (only a real image address)', reportHtml.includes('<img class="e" src="data:image/svg+xml;base64,') && !forged.includes('javascript:') && forged.includes('🐶'), 'drawn icon shown · a forged address falls back to the emoji');

    // ---------- batch 4: "💡 Show me ideas" ----------
    const { pickIdeas, ideaNote, ideaById } = await import('../server/journey/ideas.js');
    const lib = JSON.parse(readFileSync(join(process.cwd(), 'server', 'journey', 'ideaLibrary.json'), 'utf8')).ideas as any[];
    const classics = lib.filter((i) => i.id.startsWith('classic-'));
    add('the idea library has 128 ideas, each with an emoji; the 8 classics fit every theme', lib.length === 128 && lib.every((i) => i.emoji) && classics.length === 8 && classics.every((i) => i.themes.length === 10), `${lib.length} ideas · classics: ${classics.map((i) => i.emoji).join('')}`);
    let themedOk = 0, ageOk = true;
    for (let k = 0; k < 20; k++) {
      const three = pickIdeas('kid', 'space');
      if (three.filter((c: any) => ideaById(c.id)!.themes.includes('space')).length >= 2) themedOk++;
      if (!three.every((c: any) => ideaById(c.id)!.ages.includes('kid'))) ageOk = false;
    }
    const teenOk = Array.from({ length: 20 }, () => pickIdeas('teen', 'office')).flat().every((c: any) => ideaById(c.id)!.ages.includes('teen'));
    add('three ideas at a time: right age group, mostly the theme\'s mood', themedOk === 20 && ageOk && teenOk, `${themedOk}/20 draws had ≥2 space ideas · kid-only ${ageOk} · teen-only ${teenOk}`);
    const seen: string[] = [];
    let repeats = 0;
    for (let k = 0; k < 6; k++) { const got = pickIdeas('kid', 'space', seen); for (const c of got) { if (seen.includes(c.id)) repeats++; seen.push(c.id); } }
    add('"More ideas" doesn\'t repeat ideas already shown', repeats === 0 && seen.length === 18, `${seen.length} ideas over 6 rounds, ${repeats} repeats`);
    const duck = ideaById('nature-lost-ducklings')!;
    const note = ideaNote(duck, 'kid');
    add('a picked idea reaches the guide as a starting point with its "make it yours" questions', note.startsWith('[app]') && note.includes(duck.makeItYours[0]) && note.includes('use only their answers') && !note.includes('For a teen'), duck.makeItYours[0]);
    // A kid at the Idea stage (Leo's teen pass is on a shipped project: start one for Maya).
    await kid.call('/api/kid/journey/new', {});
    await kid.call('/api/kid/journey/start', { theme: 'nature', inputMode: 'type' });
    r = await kid.call('/api/kid/journey/ideas');
    const r4 = await kid.call(`/api/kid/journey/ideas?exclude=${r.body.ideas.map((i: any) => i.id).join(',')}`);
    const overlap = r4.body.ideas.filter((i: any) => r.body.ideas.some((j: any) => j.id === i.id)).length;
    add('the kid screen gets three idea cards (emoji, title, pitch) instantly, and new ones on "More ideas"', r.status === 200 && r.body.ideas.length === 3 && r.body.ideas.every((i: any) => i.emoji && i.title && i.pitch && !i.buildNotes) && overlap === 0, r.body.ideas.map((i: any) => `${i.emoji} ${i.title}`).join(' · '));
    const reportIdea = renderReport({ ...base0, ideaSource: 'The Lost Ducklings' } as any);
    add('the parent report says the kid started from an idea-list idea', reportIdea.includes('started from an idea from the idea list') && reportIdea.includes('The Lost Ducklings'), 'in "Whose ideas?"');
    // Polish round: "Show me ideas" at every step. App ideas only while the Idea stage is still
    // looking for the app; after that (Dot to Dot, then "secret pictures?") ideas for the question.
    const { ideasMode } = await import('../server/journey/guideTurn.js');
    const msg = (role: string, text: string, seq: number) => ({ thread: 'idea', role, text, seq, at: seq });
    const opening = [msg('user', '[app] The person has just arrived at the Idea stage. Begin.', 0), msg('model', '{"say":"Hi","question":"What app?","stageComplete":false}', 1)];
    const modes = [
      ideasMode({ stage: 'idea', messages: opening } as any),
      ideasMode({ stage: 'idea', messages: [...opening, msg('user', 'a unicorn game', 2)] } as any),
      ideasMode({ stage: 'idea', messages: opening, ideaSource: { id: 'classic-dot-to-dot', title: 'Dot to Dot', at: 1 } } as any),
      ideasMode({ stage: 'start', messages: [] } as any),
      ideasMode({ stage: 'design', messages: [] } as any),
    ];
    add('"Show me ideas" shows app ideas only before the app is chosen, then ideas for the question', modes.join(',') === 'library,question,question,question,question', modes.join(', '));
    r = await kid.call('/api/kid/journey');
    add('the kid screen learns which ideas fit when it picks up again', r.body.project?.ideasMode === 'question', `${r.body.project?.stage}: ${r.body.project?.ideasMode}`);

    // ---------- batch 5: the teaching progress view while building ----------
    const prog = await import('../server/journey/buildProgress.js');
    const real = readFileSync(join(process.cwd(), 'scripts', 'fixtures', 'star-catcher.html'), 'utf8'); // a real Opus build (live test)
    const steps = [{ step: 'the night sky', word: 'sky', kind: 'drawing' as const }, { step: 'the basket', word: 'basket', kind: 'tap' as const }, { step: 'the ding', word: 'ding', kind: 'sound' as const }];
    prog.startProgress('replay1', 'full', 30_000, steps);
    const firstBasket = real.toLowerCase().indexOf('basket');
    const fnBasket = real.indexOf('function drawBasket');
    let basketEarly = false, leaked = false;
    for (let i = 0; i < real.length; i += 300) {
      prog.onText('replay1', real.slice(i, i + 300));
      const g = prog.getProgress('replay1')!;
      if (i + 300 > firstBasket && i + 300 < fnBasket - 300 && g.steps[1].done) basketEarly = true;
      if (JSON.stringify(g).includes('<')) leaked = true;
    }
    const replay = prog.getProgress('replay1')!;
    add('streaming the real build gives every milestone, in the order it was written', JSON.stringify(replay.milestones) === JSON.stringify(['look', 'drawing', 'rules', 'memory', 'sound', 'tap', 'move']) && replay.chars === real.length, replay.milestones.join(' → '));
    add('a plan step ticks when its part is written, not when the word first shows up', !basketEarly && replay.steps[0].done && replay.steps[1].done && !replay.steps[2].done, replay.steps.map((s) => `${s.step} ${s.done ? '✓' : '·'}`).join(', '));
    prog.setPhase('replay1', 'done');
    add('…and every step is ticked when the build is done', prog.getProgress('replay1')!.steps.every((s) => s.done), 'all ✓');
    add('the progress never carries the code itself (only names and counts)', !leaked && /^[A-Za-z][A-Za-z0-9]*$/.test(replay.part ?? ''), `last part: ${replay.part}()`);
    prog.startProgress('replay2', 'full', 30_000, []);
    prog.onText('replay2', '<script>function killAll(){} function spawnStar(){} function shootDown(){}');
    add('part names with unkind words are never shown', prog.getProgress('replay2')!.part === 'spawnStar', `shown: ${prog.getProgress('replay2')!.part}()`);
    // Learner: one list. The look step ticks when the styles are finished; every step once the
    // code is being checked.
    prog.startProgress('look1', 'full', 30_000, [{ step: 'the pastel sky', word: 'sky', kind: 'look' }, { step: 'the dots', word: 'dots', kind: 'drawing' }] as any);
    prog.onText('look1', '<!doctype html><style>body{background:pink}');
    const lookBefore = prog.getProgress('look1')!.steps[0].done;
    prog.onText('look1', '</style><script>');
    const afterStyle = prog.getProgress('look1')!.steps.map((s: any) => s.done);
    prog.setPhase('look1', 'checking');
    const atCheck = prog.getProgress('look1')!.steps.every((s: any) => s.done);
    add('the look step ticks when the styles are done, and every step once the code is checked', !lookBefore && afterStyle.join() === 'true,false' && atCheck, `before </style>: ${lookBefore} · after: ${afterStyle.join(', ')} · checking: ${atCheck}`);
    r = await kid.call('/api/kid/journey/progress');
    add('the kid screen asks for progress (nothing while no build runs)', r.status === 200 && r.body.progress === null, JSON.stringify(r.body));
  } finally {
    await server.close();
  }
  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
