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
