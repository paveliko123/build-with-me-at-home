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

export async function guideTurn(text?: string) {
  return api<GuideTurnResult>('/api/kid/journey/turn', { body: text === undefined ? {} : { text } });
}

/** "⌨️ Type instead" / "🎤 Talk instead": remembered for this project (and the guide's reply length). */
export async function setInputMode(inputMode: Profile['inputMode']) {
  return api('/api/kid/journey/mode', { body: { inputMode } });
}

export async function newApp() {
  return api('/api/kid/journey/new', { body: {} });
}

/** The parent's plan limit (prd.md > Limit Reached): a friendly message, shown as is. */
export function limitMessage(err: unknown): string | null {
  return err instanceof ApiError && err.status === 429 && err.body?.error === 'limit'
    ? "Your helper needs a rest for now. Ask your parent: they can see when it's ready again."
    : null;
}

/** Time's up or no pass (the pass screens take over). */
export function passEnded(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 410 || err.status === 401);
}
