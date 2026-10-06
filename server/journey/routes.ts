// The kid's journey API (behind a live pass). Ported from Build With Me's startSession,
// getSession and guideTurn callables: the project now lives in the family folder, and the age
// group always comes from family.json (never from the browser).
// Implements prd.md > The Kid's Journey, States and Boundaries (coming back).

import express, { Router, type Request, type Response } from 'express';
import { requireKid, setPassStep, type KidSession } from '../passes.js';
import { guideTurn, TurnError } from './guideTurn.js';
import { LimitError } from './claude.js';
import { createProject, currentProject, exclusive, leaveCurrent, saveProject, thread, type Project } from './project.js';
import { firstStage, stageDocKind } from './stages.js';
import type { GuideReply, Profile, Stage, ThemeId } from './types.js';

const THEMES: ThemeId[] = ['unicorns', 'princesses', 'robots', 'cars', 'space', 'arcade', 'music', 'sports', 'nature', 'office'];
// prd.md > The Kid's Journey: the parent's profile setting sets the guide (Kid 0, Teen 2).
const LEVEL: Record<'kid' | 'teen', Profile['experience']> = { kid: 0, teen: 2 };
const STEP_NAMES: Record<Stage, string> = { start: 'Start', idea: 'Idea', design: 'Design', tech: 'Tech plan', build: 'Build', ship: 'Ship' };

const sessionOf = (req: Request) => (req as any).kidSession as KidSession;

/** What the screen needs to pick up where the kid left off (getSession). */
export function snapshot(p: Project) {
  const { stage, profile } = p;
  const planningBuild = stage === 'build' && profile.experience >= 3 && p.docs.checklist?.status !== 'approved';
  const rows = thread(p, stage === 'build' && !planningBuild ? 'build-wait' : stage).slice(-4).reverse();
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
  return {
    projectId: p.id, profile, stage, reply, lastExchange, doc,
    docs: Object.values(p.docs).filter((d) => !!d).map((d) => ({ kind: d!.kind, markdown: d!.markdown, status: d!.status })),
    shipped: !!p.shipped,
    checklist: p.docs.checklist?.status === 'approved' ? p.docs.checklist.markdown : null,
    app: null as null | { version: number; html: string }, stepsBuilt: 0, pendingChanges: p.pendingChanges ?? [],
  };
}

function fail(res: Response, err: unknown) {
  if (err instanceof LimitError) { res.status(429).json({ error: 'limit', resetsAt: err.resetsAt ?? null }); return; }
  if (err instanceof TurnError) { res.status(err.status).json({ error: err.message }); return; }
  console.error('[journey]', err);
  res.status(500).json({ error: 'hiccup' });
}

export function journeyRoutes(): Router {
  const r = Router();
  r.use(express.json({ limit: '64kb' }));
  r.use(requireKid);

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

  // One conversation turn (text empty = the guide opens the current stage).
  r.post('/turn', async (req, res) => {
    const s = sessionOf(req);
    const p = currentProject(s.kid.id);
    if (!p) { res.status(409).json({ error: 'no-project' }); return; }
    const out = await exclusive(p.id, async () => {
      try {
        const result = await guideTurn(p, typeof req.body?.text === 'string' ? req.body.text : undefined);
        saveProject(p);
        setPassStep(s.pass.id, STEP_NAMES[result.stage]);
        res.json(result);
      } catch (err) {
        saveProject(p); // keeps flags and usage from a turn that failed part-way
        fail(res, err);
      }
    });
    if (out === 'busy') res.status(409).json({ error: 'busy' });
  });

  // "New app": the unfinished project stays in the folder; the next start begins fresh.
  r.post('/new', (req, res) => {
    leaveCurrent(sessionOf(req).kid.id);
    res.json({ ok: true });
  });

  return r;
}
