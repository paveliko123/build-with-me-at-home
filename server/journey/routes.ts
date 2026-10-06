// The kid's journey API (behind a live pass). Ported from Build With Me's startSession,
// getSession, guideTurn, generateApp, changeTurn and publishApp callables: the project lives in
// the family folder, and the age group always comes from family.json (never from the browser).
// Every operation works on a copy of the project and merges its changes when done, so a build
// (minutes) and the kid's chat or change list can run side by side.
// Implements prd.md > The Kid's Journey, My Apps, States and Boundaries (coming back).

import express, { Router, type Request, type Response } from 'express';
import QRCode from 'qrcode';
import { requireKid, setPassStep, type KidSession } from '../passes.js';
import { homeAddresses } from '../certs.js';
import { guideTurn, TurnError } from './guideTurn.js';
import { LimitError } from './claude.js';
import { buildApp, latestVersion, type BuildMode } from './build.js';
import { changeTurn } from './changes.js';
import { shelf, shipApp, type ShelfApp } from './apps.js';
import { commitProject, createProject, currentProject, exclusive, exclusiveBuild, leaveCurrent, thread, type Project } from './project.js';
import { firstStage, stageDocKind } from './stages.js';
import type { GuideReply, Profile, Stage, ThemeId } from './types.js';

const THEMES: ThemeId[] = ['unicorns', 'princesses', 'robots', 'cars', 'space', 'arcade', 'music', 'sports', 'nature', 'office'];
// prd.md > The Kid's Journey: the parent's profile setting sets the guide (Kid 0, Teen 2).
const LEVEL: Record<'kid' | 'teen', Profile['experience']> = { kid: 0, teen: 2 };
const STEP_NAMES: Record<Stage, string> = { start: 'Start', idea: 'Idea', design: 'Design', tech: 'Tech plan', build: 'Build', ship: 'Ship' };

const sessionOf = (req: Request) => (req as any).kidSession as KidSession;
const copy = (p: Project): Project => structuredClone(p);

/** Links for a shelf app: on this device, and on the home network (for the QR code). */
export async function appLinks(kidId: string, app: ShelfApp, httpsPort: number) {
  const path = `/apps/${kidId}/${app.slug}/`;
  const ip = homeAddresses()[0];
  const homeUrl = ip ? `https://${ip}:${httpsPort}${path}` : null;
  return { ...app, path, homeUrl, qr: homeUrl ? await QRCode.toDataURL(homeUrl, { margin: 1, width: 240 }) : null };
}

/** What the screen needs to pick up where the kid left off (getSession). */
export function snapshot(p: Project) {
  const { stage, profile } = p;
  const rows = thread(p, stage === 'build' ? 'build-wait' : stage).slice(-4).reverse();
  const lastModel = rows.find((r) => r.role === 'model');
  const reply: GuideReply | null = lastModel ? JSON.parse(lastModel.text) : null;
  const lastUser = rows.find((r) => r.role === 'user' && !r.text.startsWith('[app]'));
  const answeredAfterReply = lastUser && rows.indexOf(lastUser) < (lastModel ? rows.indexOf(lastModel) : Infinity);
  const previous = rows.filter((r) => r.role === 'model')[1];
  const lastExchange = lastUser && answeredAfterReply === false && previous
    ? { question: (JSON.parse(previous.text) as GuideReply).question, answer: lastUser.text }
    : null;
  const kind = stageDocKind(stage);
  const doc = kind && p.docs[kind] ? { kind, markdown: p.docs[kind]!.markdown, status: p.docs[kind]!.status } : null;
  // The Tech plan's one-line "Here's how I'll build it!", shown when the build starts.
  const techLast = thread(p, 'tech').filter((r) => r.role === 'model').at(-1);
  const techSummary = techLast ? (JSON.parse(techLast.text) as GuideReply).techSummary : undefined;
  const latest = latestVersion(p);
  return {
    projectId: p.id, profile, stage, reply, lastExchange, doc, techSummary,
    docs: Object.values(p.docs).filter((d) => !!d).map((d) => ({ kind: d!.kind, markdown: d!.markdown, status: d!.status })),
    shipped: !!p.shipped,
    checklist: null,
    app: latest ? { version: latest.n, html: latest.html } : null, stepsBuilt: 0, pendingChanges: p.pendingChanges ?? [],
  };
}

function fail(res: Response, err: unknown) {
  if (err instanceof LimitError) { res.status(429).json({ error: 'limit', resetsAt: err.resetsAt ?? null }); return; }
  if (err instanceof TurnError) { res.status(err.status).json({ error: err.message }); return; }
  console.error('[journey]', err);
  res.status(500).json({ error: 'hiccup' });
}

export function journeyRoutes(opts: { httpsPort: number }): Router {
  const r = Router();
  r.use(express.json({ limit: '64kb' }));
  r.use(requireKid);

  /** Runs an operation on a copy of the kid's current project and merges what it changed. */
  async function withProject(req: Request, res: Response, lock: 'chat' | 'build' | null, work: (p: Project, s: KidSession) => Promise<unknown>) {
    const s = sessionOf(req);
    const before = currentProject(s.kid.id);
    if (!before) { res.status(409).json({ error: 'no-project' }); return; }
    const p = copy(before);
    const run = async () => {
      try {
        const out = await work(p, s);
        commitProject(before, p);
        setPassStep(s.pass.id, STEP_NAMES[p.stage]);
        res.json(out);
      } catch (err) {
        commitProject(before, p); // keeps flags and usage from an operation that failed part-way
        fail(res, err);
      }
    };
    const out = lock === 'chat' ? await exclusive(before.id, run) : lock === 'build' ? await exclusiveBuild(before.id, run) : await run();
    if (out === 'busy') res.status(409).json({ error: 'busy' });
  }

  // Resume: the kid's unfinished project, or null (→ Welcome).
  r.get('/', (req, res) => {
    const s = sessionOf(req);
    const p = currentProject(s.kid.id);
    if (p) setPassStep(s.pass.id, STEP_NAMES[p.stage]);
    res.json({ project: p ? snapshot(p) : null });
  });

  // Welcome + theme → a new project (or the unfinished one, if there is one).
  r.post('/start', (req, res) => {
    const s = sessionOf(req);
    const existing = currentProject(s.kid.id);
    if (existing) { res.json(snapshot(existing)); return; }
    const theme = req.body?.theme;
    if (!THEMES.includes(theme)) { res.status(400).json({ error: 'Unknown theme.' }); return; }
    const profile: Profile = { ageGroup: s.kid.group, experience: LEVEL[s.kid.group], theme, inputMode: req.body?.inputMode === 'talk' ? 'talk' : 'type' };
    const p = createProject(s.kid.id, profile, firstStage(profile));
    setPassStep(s.pass.id, STEP_NAMES[p.stage]);
    res.json(snapshot(p));
  });

  // One conversation turn (text empty = the guide opens the current stage; in Build, the
  // waiting chat).
  r.post('/turn', (req, res) => withProject(req, res, 'chat', (p) => guideTurn(p, typeof req.body?.text === 'string' ? req.body.text : undefined)));

  // "⌨️ Type instead" / "🎤 Talk instead" (learner request): the guide keeps replies short only
  // while the kid is listening, and the next pass starts in the same mode.
  r.post('/mode', (req, res) => withProject(req, res, null, async (p) => {
    p.profile = { ...p.profile, inputMode: req.body?.inputMode === 'talk' ? 'talk' : 'type' };
    return { ok: true };
  }));

  // Build, rebuild with the change list, or repair after an error in the app.
  r.post('/build', (req, res) => withProject(req, res, 'build', async (p) => {
    const mode: BuildMode = ['full', 'edit', 'repair'].includes(req.body?.mode) ? req.body.mode : 'full';
    if (p.stage !== 'build') throw new TurnError(409, 'Building starts after the Tech plan.');
    try {
      return await buildApp(p, mode, typeof req.body?.error === 'string' ? req.body.error : '');
    } catch (err) {
      // An app whose words weren't suitable is never shown: the last working version stays.
      if (err instanceof TurnError && err.status === 422) return { unsuitable: true };
      throw err;
    }
  }));

  // The change list (text, the ✕ next to an item, or a late answer to the waiting chat).
  r.post('/changes', (req, res) => withProject(req, res, 'chat', (p) => changeTurn(p, {
    text: typeof req.body?.text === 'string' ? req.body.text : undefined,
    remove: Number.isInteger(req.body?.remove) ? req.body.remove : undefined,
    chatQuestion: typeof req.body?.chatQuestion === 'string' ? req.body.chatQuestion : undefined,
  })));

  // Ship: the kid names the app; it goes on their shelf (final).
  r.post('/ship', (req, res) => withProject(req, res, 'chat', async (p, s) => {
    const out = shipApp(p, String(req.body?.name ?? ''));
    if (!out.ok) throw new TurnError(409, out.error);
    return appLinks(s.kid.id, out.app, opts.httpsPort);
  }));

  // "New app": the unfinished project stays in the folder; the next start begins fresh.
  r.post('/new', (req, res) => {
    leaveCurrent(sessionOf(req).kid.id);
    res.json({ ok: true });
  });

  return r;
}

/** This kid's "My apps" shelf (prd.md > My Apps). */
export function shelfRoutes(opts: { httpsPort: number }): Router {
  const r = Router();
  r.use(requireKid);
  r.get('/', async (req, res) => {
    const s = sessionOf(req);
    res.json(await Promise.all(shelf(s.kid.id).map((a) => appLinks(s.kid.id, a, opts.httpsPort))));
  });
  return r;
}
