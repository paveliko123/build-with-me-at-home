// Small fetch helpers for the local server. Cookies (parent, pass) ride along automatically.

export class ApiError extends Error {
  constructor(public status: number, public body: any) { super(body?.error || `HTTP ${status}`); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export type AgeGroup = 'kid' | 'teen';
export interface Kid { id: string; nickname: string; group: AgeGroup; emoji: string }
export interface ParentState { hasPin: boolean; kids: number; unlocked: boolean }
export interface Status {
  claude: { found: boolean; signedIn: boolean; subscription?: boolean };
  usage?: { fiveHourPct?: number; fiveHourResets?: string; weeklyPct?: number; weeklyResets?: string; at: number } | null;
}

export interface ActivePass {
  id: string; kidId: string; kid: { nickname: string; emoji: string; group: AgeGroup } | null;
  minutes: number; createdAt: number; endsAt: number; usedAt: number | null; device: string | null; step: string | null;
  // only while the pass hasn't been opened yet:
  code?: string; typedCode?: string; qrUrl?: string | null; typeAt?: string | null; laptopUrl?: string; qr?: string | null;
}
export interface KidSessionView { state: 'live' | 'over'; kid: { nickname: string; emoji: string; group: AgeGroup }; endsAt: number; now: number }
export type PassPeek = { state: 'ready'; kid: { nickname: string; emoji: string; group: AgeGroup }; endsAt: number } | { state: 'used' | 'over' | 'unknown' | 'mine' };

/** "1:05:09" or "4:07" */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
export const timeOfDay = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
