// Who's asking. The parent side answers only on this laptop (loopback) and only with a
// parent cookie, which the PIN unlocks. Kids get in with pass cookies (slice 4).

import type { Request, Response, NextFunction } from 'express';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { hostname, networkInterfaces } from 'node:os';
import { readFamily, updateFamily } from './store.js';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const PARENT_COOKIE = 'bwm_parent';
// Security review: the Parent area also locks after 15 idle minutes on its own screen
// (ParentHome) and when its window closes (presence.ts); this is the outer limit.
const IDLE_MS = 2 * 60 * 60 * 1000;
const MAX_SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_TRIES = 5;
/** Each lockout lasts longer: 1, 5, 15, 60, then 240 minutes (security review: a flat minute let a
 *  4-digit PIN fall in about a day). */
const LOCK_STEPS_MIN = [1, 5, 15, 60, 240];

// The ports this server answers on (set by startServer), for exact origin checks.
let ports = { http: 4747, https: 4748 };
export function setServerPorts(http: number, https: number): void { ports = { http, https }; }
const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLoopback(req: Request): boolean {
  const a = req.socket.remoteAddress ?? '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

/** This computer itself, also when its browser uses the home-network address (192.168…). */
export function isThisComputer(req: Request): boolean {
  if (isLoopback(req)) return true;
  const a = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
  return ownAddresses().includes(a);
}
function ownAddresses(): string[] {
  return Object.values(networkInterfaces()).flat().filter((n) => !!n && n.family === 'IPv4').map((n) => n!.address);
}

// ---- the names this computer answers to (security audit H1) ----
// Who's asking is decided from the connection, never from headers. But a web page can point its
// own domain at 127.0.0.1 ("DNS rebinding") and then reach this server from the parent's browser
// as if it were the laptop. Its requests still carry its own name, so only this computer's own
// names are answered: localhost, its home addresses and its machine name.
let known: { at: number; names: Set<string> } | null = null;
function knownHosts(): Set<string> {
  if (known && Date.now() - known.at < 10_000) return known.names;
  const machine = hostname().toLowerCase();
  const safe = machine.replace(/[^a-z0-9-]/g, '-'); // as on the server certificate (certs.ts)
  const names = new Set(['localhost', '127.0.0.1', '[::1]', machine, `${machine}.local`, safe, `${safe}.local`, ...ownAddresses()]);
  known = { at: Date.now(), names };
  return names;
}
const hostPart = (h: string) => h.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');

/** A name and port this server answers to. Security review: the port counts (a page from another
 *  program on this laptop, say a dev server on :3000, is not this app), and a connection from the
 *  laptop itself only uses the loopback names. */
function nameAllowed(req: Request, name: string, port: number): boolean {
  if (port !== ports.http && port !== ports.https) return false;
  return isLoopback(req) ? LOOPBACK_NAMES.has(name) : knownHosts().has(name);
}

/** The request was addressed to this computer by one of its own names, on its own ports. */
export function hostAllowed(req: Request): boolean {
  const host = (req.headers.host ?? '').trim().toLowerCase();
  const m = host.match(/:(\d+)$/);
  const secure = (req.socket as any).encrypted === true;
  return nameAllowed(req, hostPart(host), m ? Number(m[1]) : secure ? 443 : 80);
}

/** A request that changes something came from one of this app's own pages (or from no page):
 *  the whole origin must match (scheme, name and port), and the browser must not call it
 *  cross-site. */
export function originAllowed(req: Request): boolean {
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true; // not sent by a web page's script (curl, the launcher)
  try {
    const u = new URL(origin);
    const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
    if ((u.protocol === 'http:' && port !== ports.http) || (u.protocol === 'https:' && port !== ports.https)) return false;
    return nameAllowed(req, hostPart(u.host), port);
  } catch { return false; } // "null" too
}

/** A request from this app's own page (for streams a page could otherwise open from any site). */
export function sameOriginPage(req: Request): boolean {
  const site = req.headers['sec-fetch-site'];
  return site === undefined || site === 'same-origin';
}

export function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function validPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}

export async function hashPin(pin: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pin, salt, 32);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

async function pinMatches(pin: string, stored: { salt: string; hash: string }): Promise<boolean> {
  const hash = await scryptAsync(pin, Buffer.from(stored.salt, 'hex'), 32);
  return timingSafeEqual(hash, Buffer.from(stored.hash, 'hex'));
}

// ---- wrong-PIN lockout: growing, and kept in family.json (security review) ----
const NO_LOCK = { failures: 0, lockedUntil: 0, lockouts: 0, wrongSinceUnlock: 0 };

export type UnlockResult = { ok: true; wrongTries: number; lastWrongAt?: number } | { ok: false; reason: 'wrong'; triesLeft: number } | { ok: false; reason: 'locked'; seconds: number } | { ok: false; reason: 'no-pin' };

export async function checkPin(pin: string): Promise<UnlockResult> {
  const now = Date.now();
  const family = readFamily();
  const lock = { ...NO_LOCK, ...(family.pinLock ?? {}) };
  if (now < lock.lockedUntil) return { ok: false, reason: 'locked', seconds: Math.ceil((lock.lockedUntil - now) / 1000) };
  if (!family.pin) return { ok: false, reason: 'no-pin' };
  if (validPin(pin) && (await pinMatches(pin, family.pin))) {
    updateFamily((f) => { f.pinLock = { ...NO_LOCK }; });
    return { ok: true, wrongTries: lock.wrongSinceUnlock, lastWrongAt: lock.lastWrongAt };
  }
  lock.failures++; lock.wrongSinceUnlock++; lock.lastWrongAt = now;
  let result: UnlockResult = { ok: false, reason: 'wrong', triesLeft: MAX_TRIES - lock.failures };
  if (lock.failures >= MAX_TRIES) {
    const minutes = LOCK_STEPS_MIN[Math.min(lock.lockouts, LOCK_STEPS_MIN.length - 1)];
    lock.lockouts++; lock.failures = 0; lock.lockedUntil = now + minutes * 60_000;
    result = { ok: false, reason: 'locked', seconds: minutes * 60 };
  }
  updateFamily((f) => { f.pinLock = lock; });
  return result;
}

export async function setPin(pin: string): Promise<void> {
  const stored = await hashPin(pin);
  updateFamily((f) => { f.pin = stored; });
  parentSessions.clear();
}

// ---- parent sessions ----
const parentSessions = new Map<string, { seen: number; started: number; epoch: number }>();

export function startParentSession(res: Response): void {
  const token = randomBytes(32).toString('base64url');
  parentSessions.set(token, { seen: Date.now(), started: Date.now(), epoch: readFamily().sessionEpoch ?? 0 });
  res.cookie(PARENT_COOKIE, token, { httpOnly: true, sameSite: 'strict', path: '/' });
}

/** Locks every parent session (the Parent area's window closed: presence.ts). */
export function endAllParentSessions(): void { parentSessions.clear(); }

export function endParentSession(req: Request, res: Response): void {
  parentSessions.delete(cookies(req)[PARENT_COOKIE] ?? '');
  res.clearCookie(PARENT_COOKIE, { path: '/' });
}

export function isParent(req: Request): boolean {
  if (!isLoopback(req)) return false;
  const token = cookies(req)[PARENT_COOKIE];
  const s = token ? parentSessions.get(token) : undefined;
  if (s === undefined) return false;
  const now = Date.now();
  // Too long idle, too old, or the PIN was reset with /build-with-me:reset-pin since.
  if (now - s.seen > IDLE_MS || now - s.started > MAX_SESSION_MS || s.epoch !== (readFamily().sessionEpoch ?? 0)) { parentSessions.delete(token!); return false; }
  s.seen = now;
  return true;
}

/** Parent routes: this laptop only, unlocked with the PIN. */
export function requireParent(req: Request, res: Response, next: NextFunction): void {
  if (!isLoopback(req)) { res.status(403).json({ error: 'laptop-only' }); return; }
  if (!isParent(req)) { res.status(401).json({ error: 'locked' }); return; }
  next();
}

/** Test hook: forget sessions and lockout. */
export function resetAuthForTests(): void { parentSessions.clear(); updateFamily((f) => { delete f.pinLock; }); }
