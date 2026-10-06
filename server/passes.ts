// Passes (spec.md > Passes, prd.md > Passes). A parent gives one kid access for a chosen time.
// Each pass has a one-use QR code (128 random bits) and a short typed code for laptops and
// Chromebooks; either one uses it up. The device that opens it gets a pass cookie (a different
// random token, stored only as a hash). The server decides "live" or "over" on every request,
// so extending or ending works instantly without touching the cookie.

import { randomBytes, createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Request, Response, NextFunction } from 'express';
import { readJson, updateJson, readFamily, type Kid } from './store.js';
import { cookies, isLoopback, isThisComputer } from './auth.js';

export const PASS_COOKIE = 'bwm_pass';
const FILE = 'passes.json';
const KEEP_MS = 30 * 24 * 60 * 60 * 1000; // ended passes are kept 30 days for the reports
const MAX_MINUTES = 24 * 60;
const TYPED_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L
const MAX_WRONG = 5;
const WRONG_LOCK_MS = 60 * 1000;

export interface Pass {
  id: string;
  kidId: string;
  code: string;          // QR code (base64url, 128 bits)
  typedCode: string;     // 8 characters, shown as XXXX-XXXX
  minutes: number;       // as created (extensions move endsAt)
  createdAt: number;
  endsAt: number;
  usedAt?: number;
  device?: string;
  tokenHash?: string;    // sha256 of the pass cookie
  endedAt?: number;      // ended early by the parent
  step?: string;         // where the kid is (the journey fills this in from slice 5)
}
interface PassFile { passes: Pass[] }

/** Something about passes changed: parent screens reload, the kid's screen updates. */
export const passEvents = new EventEmitter();
passEvents.setMaxListeners(100);

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const readPasses = () => readJson<PassFile>(FILE, { passes: [] }).passes;
function update(change: (passes: Pass[]) => void): Pass[] {
  return updateJson<PassFile>(FILE, { passes: [] }, (f) => {
    change(f.passes);
    const now = Date.now();
    f.passes = f.passes.filter((p) => Math.min(p.endsAt, p.endedAt ?? Infinity) > now - KEEP_MS);
  }).passes;
}

export const isLive = (p: Pass, now = Date.now()) => !p.endedAt && p.endsAt > now;
const kidOf = (p: Pass): Kid | undefined => readFamily().kids.find((k) => k.id === p.kidId);

function typedCode(): string {
  // Every character equally likely: bytes above the last whole multiple of 31 are skipped.
  const out: string[] = [];
  const limit = 256 - (256 % TYPED_ALPHABET.length);
  while (out.length < 8) for (const b of randomBytes(16)) if (b < limit && out.length < 8) out.push(TYPED_ALPHABET[b % TYPED_ALPHABET.length]);
  return out.join('');
}
/** "k7qm 3xpa", "K7QM-3XPA" → "K7QM3XPA" */
export const normalizeTyped = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, '');
export const formatTyped = (s: string) => `${s.slice(0, 4)}-${s.slice(4)}`;

// ---------- parent actions ----------

export type CreateResult = { ok: true; pass: Pass } | { ok: false; error: 'no-kid' | 'bad-minutes' } | { ok: false; error: 'kid-has-pass'; pass: Pass };

export function createPass(kidId: string, minutes: number, replace = false): CreateResult {
  if (!readFamily().kids.some((k) => k.id === kidId)) return { ok: false, error: 'no-kid' };
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_MINUTES) return { ok: false, error: 'bad-minutes' };
  const now = Date.now();
  const existing = readPasses().find((p) => p.kidId === kidId && isLive(p, now));
  if (existing && !replace) return { ok: false, error: 'kid-has-pass', pass: existing };
  const live = new Set(readPasses().filter((p) => isLive(p, now)).map((p) => p.typedCode));
  let typed = typedCode();
  while (live.has(typed)) typed = typedCode();
  const pass: Pass = {
    id: randomBytes(9).toString('base64url'), kidId, code: randomBytes(16).toString('base64url'), typedCode: typed,
    minutes: Math.round(minutes), createdAt: now, endsAt: now + Math.round(minutes * 60_000),
  };
  update((ps) => {
    if (existing) { const old = ps.find((p) => p.id === existing.id); if (old) old.endedAt = now; }
    ps.push(pass);
  });
  if (existing) passEvents.emit('pass', existing.id);
  passEvents.emit('changed');
  return { ok: true, pass };
}

export function extendPass(id: string, minutes: number): Pass | null {
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_MINUTES) return null;
  let found: Pass | null = null;
  update((ps) => {
    const p = ps.find((x) => x.id === id);
    if (!p || !isLive(p)) return;
    p.endsAt += Math.round(minutes * 60_000);
    found = { ...p };
  });
  if (found) { passEvents.emit('pass', id); passEvents.emit('changed'); }
  return found;
}

export function endPass(id: string): boolean {
  let ok = false;
  update((ps) => { const p = ps.find((x) => x.id === id); if (p && isLive(p)) { p.endedAt = Date.now(); ok = true; } });
  if (ok) { passEvents.emit('pass', id); passEvents.emit('changed'); }
  return ok;
}

/** A removed kid's passes: a live one ends first (their device shows "Time's up"), then all of
 *  them are forgotten (kidData.ts). */
export function forgetKidPasses(kidId: string): void {
  for (const p of readPasses()) if (p.kidId === kidId && isLive(p)) endPass(p.id);
  update((ps) => { for (let i = ps.length - 1; i >= 0; i--) if (ps[i].kidId === kidId) ps.splice(i, 1); });
  passEvents.emit('changed');
}

/** Live passes for the parent's Active passes card (unopened ones keep their codes so the
 *  parent can show them again). */
export function activePasses() {
  const now = Date.now();
  return readPasses().filter((p) => isLive(p, now)).map((p) => {
    const kid = kidOf(p);
    return {
      id: p.id, kidId: p.kidId, kid: kid ? { nickname: kid.nickname, emoji: kid.emoji, group: kid.group } : null,
      minutes: p.minutes, createdAt: p.createdAt, endsAt: p.endsAt, usedAt: p.usedAt ?? null, device: p.device ?? null, step: p.step ?? null,
      ...(p.usedAt ? {} : { code: p.code, typedCode: formatTyped(p.typedCode) }),
    };
  });
}

// ---------- opening a pass ----------

/** Friendly device name from the browser, e.g. "iPad", "Windows laptop". */
export function deviceLabel(req: Request): string {
  if (isThisComputer(req)) return 'This laptop';
  const ua = req.headers['user-agent'] ?? '';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/Windows/.test(ua)) return 'Windows laptop';
  if (/Macintosh/.test(ua)) return 'Mac';
  return 'A device';
}

/** Home network or this laptop only. */
export function fromHome(req: Request): boolean {
  const a = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
  return isLoopback(req) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(a) || /^f[cd]|^fe80/i.test(a);
}

function findByCode(raw: string): Pass | undefined {
  const typed = normalizeTyped(raw);
  return readPasses().find((p) => p.code === raw || (typed.length === 8 && p.typedCode === typed));
}

export type Peek = { state: 'ready'; kid: { nickname: string; emoji: string; group: string }; endsAt: number }
  | { state: 'used' | 'over' | 'unknown' | 'mine' };

/** What a QR link would open, without using it up (link previews can't spend a pass). */
export function peekPass(req: Request, code: string): Peek {
  const p = readPasses().find((x) => x.code === code);
  if (!p) return { state: 'unknown' };
  if (!isLive(p)) return { state: 'over' };
  if (p.usedAt) return p.tokenHash && p.tokenHash === sha(cookies(req)[PASS_COOKIE] ?? '') ? { state: 'mine' } : { state: 'used' };
  const kid = kidOf(p);
  return kid ? { state: 'ready', kid: { nickname: kid.nickname, emoji: kid.emoji, group: kid.group }, endsAt: p.endsAt } : { state: 'unknown' };
}

// Wrong codes, per address (in memory, like the PIN lockout).
const wrong = new Map<string, { n: number; until: number }>();

export type OpenResult = { ok: true } | { ok: false; error: 'used' | 'over' | 'unknown' | 'not-home' } | { ok: false; error: 'wait'; seconds: number };

export function openPass(req: Request, res: Response, raw: string): OpenResult {
  if (!fromHome(req)) return { ok: false, error: 'not-home' };
  const who = req.socket.remoteAddress ?? '?';
  const now = Date.now();
  const w = wrong.get(who);
  if (w && w.until > now) return { ok: false, error: 'wait', seconds: Math.ceil((w.until - now) / 1000) };

  const p = typeof raw === 'string' && raw.length <= 64 ? findByCode(raw) : undefined;
  if (!p) {
    const n = (w?.n ?? 0) + 1;
    if (n >= MAX_WRONG) { wrong.set(who, { n: 0, until: now + WRONG_LOCK_MS }); return { ok: false, error: 'wait', seconds: WRONG_LOCK_MS / 1000 }; }
    wrong.set(who, { n, until: 0 });
    return { ok: false, error: 'unknown' };
  }
  // (The wrong-code count clears only when a pass really opens, not on any matching code.)
  if (!isLive(p, now)) return { ok: false, error: 'over' };
  const mine = p.tokenHash && p.tokenHash === sha(cookies(req)[PASS_COOKIE] ?? '');
  if (p.usedAt && mine) { wrong.delete(who); return { ok: true }; } // the same device scanning again just goes back in
  if (p.usedAt) return { ok: false, error: 'used' };

  const token = randomBytes(32).toString('base64url');
  let won = false;
  update((ps) => {
    const x = ps.find((y) => y.id === p.id);
    if (!x || x.usedAt) return; // someone else was faster
    x.usedAt = now; x.device = deviceLabel(req); x.tokenHash = sha(token); won = true;
  });
  if (!won) return { ok: false, error: 'used' };
  wrong.delete(who);
  // Other devices only reach the kid pages over HTTPS, so their cookie is "Secure" (never sent
  // over plain HTTP, security audit M4). This laptop uses http://localhost, which never leaves
  // the computer. Lasts a day past the end so the kid sees "Time's up".
  res.cookie(PASS_COOKIE, token, { httpOnly: true, secure: (req.socket as any).encrypted === true, sameSite: 'lax', path: '/', maxAge: p.endsAt - now + 24 * 60 * 60 * 1000 });
  passEvents.emit('changed');
  return { ok: true };
}

// ---------- the kid side ----------

export interface KidSession { pass: Pass; kid: Kid; live: boolean }

export function kidSession(req: Request): KidSession | null {
  const token = cookies(req)[PASS_COOKIE];
  if (!token || !fromHome(req)) return null;
  const h = sha(token);
  const pass = readPasses().find((p) => p.tokenHash === h);
  const kid = pass && kidOf(pass);
  if (!pass || !kid) return null;
  return { pass, kid, live: isLive(pass) };
}

/** Kid routes: a live pass. 401 = no pass on this device; 410 = time's up. */
export function requireKid(req: Request, res: Response, next: NextFunction): void {
  const s = kidSession(req);
  if (!s) { res.status(401).json({ error: 'no-pass' }); return; }
  if (!s.live) { res.status(410).json({ error: 'times-up' }); return; }
  (req as any).kidSession = s;
  next();
}

export function kidView(s: KidSession) {
  return {
    state: s.live ? 'live' : 'over',
    kid: { nickname: s.kid.nickname, emoji: s.kid.emoji, group: s.kid.group },
    endsAt: s.pass.endedAt ? Math.min(s.pass.endedAt, s.pass.endsAt) : s.pass.endsAt,
    now: Date.now(),
  };
}

// Passes that run out on their own also need an event (extend/end already send one).
const announced = new Set<string>();
setInterval(() => {
  const now = Date.now();
  for (const p of readPasses()) {
    if (p.endsAt <= now && !p.endedAt && !announced.has(p.id) && p.endsAt > now - 60_000) {
      announced.add(p.id); passEvents.emit('pass', p.id); passEvents.emit('changed');
    }
  }
}, 2000).unref();

/** Test hook. */
export function resetPassesForTests(): void { wrong.clear(); announced.clear(); }

/** A pass by id (for reports). */
export const readPass = (id: string): Pass | undefined => readPasses().find((p) => p.id === id);
/** All passes, newest first (for reports). */
export const allPasses = (): Pass[] => [...readPasses()].sort((a, b) => b.createdAt - a.createdAt);

/** Where the kid is now ("Idea", "Design"…), shown on the parent's Active passes card. */
export function setPassStep(id: string, step: string): void {
  let changed = false;
  update((ps) => { const p = ps.find((x) => x.id === id); if (p && p.step !== step) { p.step = step; changed = true; } });
  if (changed) passEvents.emit('changed');
}
