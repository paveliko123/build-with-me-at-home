// A kid's project (spec.md > Data Model): kids/<kidId>/projects/<projectId>/project.json in the
// family folder. It replaces Build With Me's Firestore session + messages: the stage, the
// documents, the transcript (personal details already masked), flags, and what each call cost.
// kids/<kidId>/current.json points at the unfinished project the next pass resumes.

import { randomBytes } from 'node:crypto';
import { readJson, writeJson, updateJson } from '../store.js';
import type { CallMeta } from './claude.js';
import type { DocKind, Profile, Stage, StageDoc } from './types.js';

export interface Row { thread: string; role: 'user' | 'model'; text: string; seq: number; at: number }
export interface Flag { at: number; stage: Stage; direction: 'input' | 'output' | 'app'; verdict: string; category: string; text: string }
export interface Usage { calls: number; costUsd: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; byModel: Record<string, number> }

export interface Project {
  version: 1;
  id: string;
  kidId: string;
  profile: Profile;
  stage: Stage;
  docs: Partial<Record<DocKind, StageDoc & { updatedAt: number }>>;
  messages: Row[];
  flags: Flag[];
  usage: Usage;
  timeline: { at: number; stage: Stage }[];
  createdAt: number;
  updatedAt: number;
  shipped?: { name: string; slug: string; at: number };
  pendingChanges?: string[];
  versions?: { n: number; mode: 'full' | 'edit' | 'repair'; note: string; at: number }[];
  device?: string; // where the kid used it last (from the pass)
  usageStart?: { at: number; fiveHourPct?: number; weeklyPct?: number; late?: boolean }; // /usage before the first call (late: taken on a later turn)
  reports?: { id: string; at: number; finished: boolean }[];
}

const projectFile = (kidId: string, id: string) => `kids/${kidId}/projects/${id}/project.json`;
const currentFile = (kidId: string) => `kids/${kidId}/current.json`;
const SAFE_ID = /^[A-Za-z0-9_-]{6,40}$/;

export function newUsage(): Usage {
  return { calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, byModel: {} };
}

export function createProject(kidId: string, profile: Profile, stage: Stage): Project {
  const now = Date.now();
  const p: Project = {
    version: 1, id: randomBytes(9).toString('base64url'), kidId, profile, stage, docs: {}, messages: [], flags: [],
    usage: newUsage(), timeline: [{ at: now, stage }], createdAt: now, updatedAt: now,
  };
  writeJson(projectFile(kidId, p.id), p);
  writeJson(currentFile(kidId), { projectId: p.id });
  return p;
}

export function readProject(kidId: string, id: string): Project | null {
  if (!SAFE_ID.test(kidId) || !SAFE_ID.test(id)) return null;
  return readJson<Project | null>(projectFile(kidId, id), null);
}

/** The kid's unfinished project (what the next pass resumes), if any. */
export function currentProject(kidId: string): Project | null {
  const cur = readJson<{ projectId?: string }>(currentFile(kidId), {});
  const p = cur.projectId ? readProject(kidId, cur.projectId) : null;
  return p && !p.shipped ? p : null;
}

/** "New app": the old project stays in the folder (and in reports); the next pass starts fresh. */
export function leaveCurrent(kidId: string): void {
  writeJson(currentFile(kidId), {});
}

export function saveProject(p: Project): void {
  p.updatedAt = Date.now();
  writeJson(projectFile(p.kidId, p.id), p);
}

export function changeProject(kidId: string, id: string, change: (p: Project) => void): Project {
  return updateJson<Project>(projectFile(kidId, id), null as unknown as Project, (p) => {
    if (!p) throw new Error('project not found');
    change(p);
    p.updatedAt = Date.now();
  });
}

export function addUsage(p: Project, metas: (CallMeta | undefined)[]): void {
  for (const m of metas) {
    if (!m) continue;
    const u = p.usage;
    u.calls++; u.costUsd += m.costUsd; u.inputTokens += m.inputTokens; u.outputTokens += m.outputTokens;
    u.cacheReadTokens += m.cacheReadTokens; u.cacheWriteTokens += m.cacheWriteTokens;
    u.byModel[m.model] = (u.byModel[m.model] ?? 0) + 1;
  }
}

/** Messages of one conversation thread, oldest first. */
export function thread(p: Project, name: string): Row[] {
  return p.messages.filter((m) => m.thread === name).sort((a, b) => a.seq - b.seq);
}

// One turn at a time per project (a double tap must not run two turns).
const busy = new Set<string>();
export const isBusy = (projectId: string) => busy.has(projectId);
export async function exclusive<T>(projectId: string, work: () => Promise<T>): Promise<T | 'busy'> {
  if (busy.has(projectId)) return 'busy';
  busy.add(projectId);
  try { return await work(); } finally { busy.delete(projectId); }
}

// ---------- saving when two things run at once ----------
// A build can run for minutes while the kid keeps chatting or adds changes. Each operation works
// on its own copy and, when it's done, merges only what it changed into the newest file.

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Merges the changes from `before` → `after` into the project as it is on disk now. */
export function commitProject(before: Project, after: Project): Project {
  return changeProject(after.kidId, after.id, (fresh) => {
    // New messages, renumbered after the newest saved one.
    const known = new Set(before.messages.map((m) => `${m.thread}|${m.seq}`));
    let seq = fresh.messages.reduce((n, m) => Math.max(n, m.seq + 1), 0);
    for (const m of after.messages) if (!known.has(`${m.thread}|${m.seq}`)) fresh.messages.push({ ...m, seq: seq++ });
    fresh.flags.push(...after.flags.slice(before.flags.length));
    fresh.timeline.push(...after.timeline.slice(before.timeline.length));
    (fresh.versions ??= []).push(...(after.versions ?? []).slice((before.versions ?? []).length));
    const u = fresh.usage, a = after.usage, b = before.usage;
    u.calls += a.calls - b.calls; u.costUsd += a.costUsd - b.costUsd;
    u.inputTokens += a.inputTokens - b.inputTokens; u.outputTokens += a.outputTokens - b.outputTokens;
    u.cacheReadTokens += a.cacheReadTokens - b.cacheReadTokens; u.cacheWriteTokens += a.cacheWriteTokens - b.cacheWriteTokens;
    for (const [m, n] of Object.entries(a.byModel)) u.byModel[m] = (u.byModel[m] ?? 0) + n - (b.byModel[m] ?? 0);
    for (const k of Object.keys(after.docs) as DocKind[]) if (!same(before.docs[k], after.docs[k])) fresh.docs[k] = after.docs[k];
    if (before.stage !== after.stage) fresh.stage = after.stage;
    if (!same(before.profile, after.profile)) fresh.profile = after.profile;
    if (!same(before.pendingChanges, after.pendingChanges)) fresh.pendingChanges = after.pendingChanges;
    if (!same(before.shipped, after.shipped)) fresh.shipped = after.shipped;
    if (before.device !== after.device) fresh.device = after.device;
  });
}

// One build at a time per project, and one chat turn at a time per project (separately).
const building = new Set<string>();
export async function exclusiveBuild<T>(projectId: string, work: () => Promise<T>): Promise<T | 'busy'> {
  if (building.has(projectId)) return 'busy';
  building.add(projectId);
  try { return await work(); } finally { building.delete(projectId); }
}
export const isBuilding = (projectId: string) => building.has(projectId);
