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
