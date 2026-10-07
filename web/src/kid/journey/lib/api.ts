// The kid's journey API on the family's computer (server/journey/routes.ts). Replaces Build
// With Me's Firebase callables; the pass cookie rides along with every call.
import { api, ApiError } from '../../../lib/api';
import type { GuideTurnResult, Profile, SessionSnapshot } from '../types';

export async function getJourney() {
  return (await api<{ project: SessionSnapshot | null }>('/api/kid/journey')).project;
}

/** The server sets the age group (from the parent's family settings) and the guide's level. */
export async function startJourney(choice: { theme: Profile['theme']; inputMode: Profile['inputMode'] }) {
  return api<SessionSnapshot>('/api/kid/journey/start', { body: choice });
}

export async function guideTurn(text?: string, ideaId?: string, askIdeas = false) {
  const body = ideaId ? { ideaId } : { ...(text === undefined ? {} : { text }), ...(askIdeas ? { askIdeas } : {}) };
  return api<GuideTurnResult>('/api/kid/journey/turn', { body });
}

/** The teaching progress view while the app builds (server/journey/buildProgress.ts). */
export type Milestone = 'look' | 'drawing' | 'rules' | 'tap' | 'move' | 'sound' | 'memory';
export interface BuildProgressInfo {
  mode: 'full' | 'edit' | 'repair';
  phase: 'waiting' | 'reading' | 'writing' | 'checking' | 'safety' | 'verifying' | 'done' | 'failed';
  chars: number; expected: number; milestones: Milestone[]; part: string | null;
  steps: { step: string; kind: Milestone; done: boolean }[];
}
export async function buildProgress() {
  return (await api<{ progress: BuildProgressInfo | null }>('/api/kid/journey/progress')).progress;
}

/** "💡 Show me ideas": three ideas from the idea library (instant, no Claude call). */
export interface IdeaCard { id: string; emoji: string; title: string; pitch: string }
export async function getIdeas(exclude: string[] = []) {
  return (await api<{ ideas: IdeaCard[] }>(`/api/kid/journey/ideas?exclude=${encodeURIComponent(exclude.join(','))}`)).ideas;
}

/** "⌨️ Type instead" / "🎤 Talk instead": remembered for this project (and the guide's reply length). */
export async function setInputMode(inputMode: Profile['inputMode']) {
  return api('/api/kid/journey/mode', { body: { inputMode } });
}

export async function newApp() {
  return api('/api/kid/journey/new', { body: {} });
}

/** The parent's plan limit (prd.md > Limit Reached): a friendly message, shown as is. Also the
 *  pass's own limits (server/journey/limits.ts): too fast, or all one pass can do. */
export function limitMessage(err: unknown): string | null {
  if (err instanceof ApiError && err.status === 429 && ['slow-down', 'pass-cap'].includes(err.body?.error)) return String(err.body?.say ?? 'Wait a little, then try again.');
  if (!(err instanceof ApiError && err.status === 429 && err.body?.error === 'limit')) return null;
  // The Limit reached screen (Journey.tsx) listens for this.
  window.dispatchEvent(new CustomEvent('bwm-limit', { detail: { resetsAt: err.body?.resetsAt ?? null } }));
  return 'Limit reached — ask your parent about it. Your work is saved.';
}

/** Time's up or no pass (the pass screens take over). */
export function passEnded(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 410 || err.status === 401);
}

export type BuildMode = 'full' | 'edit' | 'repair' | 'step';
export type GenerateAppResult =
  | { needsConfirm?: undefined; unsuitable?: undefined; version: number; html: string; changed?: string; missing?: string[] }
  | { needsConfirm: true; reason: string; unsuitable?: undefined }
  | { unsuitable: true; needsConfirm?: undefined };

/** Build (full), rebuild with the saved change list (edit), or fix an error (repair). */
export async function generateApp(args: { mode: BuildMode; request?: string; error?: string; step?: number; confirmed?: boolean; fromList?: boolean }) {
  return api<GenerateAppResult>('/api/kid/journey/build', { body: { mode: args.mode, error: args.error } });
}

/** Ideas from the waiting chat onto the change list (instant, no Claude call). */
export async function addIdeas(ideas: string[]) {
  return api<{ changes: string[] }>('/api/kid/journey/changes/ideas', { body: { ideas } });
}

export async function changeTurn(args: { text?: string; remove?: number; chatQuestion?: string }) {
  return api<{ changes: string[]; ready: boolean; ship?: boolean; reply: { say: string; question?: string } | null }>('/api/kid/journey/changes', { body: args });
}

export interface ShelfApp { slug: string; name: string; emoji: string; icon?: boolean; iconUrl?: string | null; createdAt: number; projectId: string; version: number; path: string; homeUrl: string | null; qr: string | null; hasPlan?: boolean }
export type IconChoice = { kind: 'drawing' } | { kind: 'emoji'; emoji: string };

/** "📄 How I planned it": a teen's approved plans for one shipped app. */
export async function appPlan(slug: string) {
  return api<{ name: string; emoji: string; theme: string; docs: { kind: 'scope' | 'prd' | 'spec'; markdown: string }[] }>(`/api/kid/apps/${encodeURIComponent(slug)}/plan`);
}

/** Ship: final. Returns the app as it sits on the kid's shelf. */
export async function shipApp(name: string, icon?: IconChoice) {
  return api<ShelfApp>('/api/kid/journey/ship', { body: { name, icon } });
}

/** This kid's "My apps" shelf, newest first. */
export async function myApps() {
  return api<ShelfApp[]>('/api/kid/apps');
}
