// Who's asking. The parent side answers only on this laptop (loopback) and only with a
// parent cookie, which the PIN unlocks. Kids get in with pass cookies (slice 4).

import type { Request, Response, NextFunction } from 'express';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { hostname, networkInterfaces } from 'node:os';
import { readFamily, updateFamily } from './store.js';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const PARENT_COOKIE = 'bwm_parent';
const IDLE_MS = 12 * 60 * 60 * 1000;
const MAX_TRIES = 5;
const LOCK_MS = 60 * 1000;

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

/** The request was addressed to this computer by one of its own names. */
export function hostAllowed(req: Request): boolean {
  return knownHosts().has(hostPart(req.headers.host ?? ''));
}

/** A request that changes something came from one of this app's own pages (or from no page). */
export function originAllowed(req: Request): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return true; // not sent by a web page's script (curl, the launcher)
  try { return knownHosts().has(hostPart(new URL(origin).host)); } catch { return false; } // "null" too
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

// ---- wrong-PIN lockout (in memory; a restart clears it, see spec > What Was Simplified) ----
let failures = 0;
let lockedUntil = 0;

export type UnlockResult = { ok: true } | { ok: false; reason: 'wrong'; triesLeft: number } | { ok: false; reason: 'locked'; seconds: number } | { ok: false; reason: 'no-pin' };

export async function checkPin(pin: string): Promise<UnlockResult> {
  const now = Date.now();
  if (now < lockedUntil) return { ok: false, reason: 'locked', seconds: Math.ceil((lockedUntil - now) / 1000) };
  const stored = readFamily().pin;
  if (!stored) return { ok: false, reason: 'no-pin' };
  if (validPin(pin) && (await pinMatches(pin, stored))) { failures = 0; return { ok: true }; }
  failures++;
  if (failures >= MAX_TRIES) { failures = 0; lockedUntil = now + LOCK_MS; return { ok: false, reason: 'locked', seconds: LOCK_MS / 1000 }; }
  return { ok: false, reason: 'wrong', triesLeft: MAX_TRIES - failures };
}

export async function setPin(pin: string): Promise<void> {
  const stored = await hashPin(pin);
  updateFamily((f) => { f.pin = stored; });
  parentSessions.clear();
}

// ---- parent sessions ----
const parentSessions = new Map<string, number>(); // token → last seen

export function startParentSession(res: Response): void {
  const token = randomBytes(32).toString('base64url');
  parentSessions.set(token, Date.now());
  res.cookie(PARENT_COOKIE, token, { httpOnly: true, sameSite: 'strict', path: '/' });
}

export function endParentSession(req: Request, res: Response): void {
  parentSessions.delete(cookies(req)[PARENT_COOKIE] ?? '');
  res.clearCookie(PARENT_COOKIE, { path: '/' });
}

export function isParent(req: Request): boolean {
  if (!isLoopback(req)) return false;
  const token = cookies(req)[PARENT_COOKIE];
  const seen = token ? parentSessions.get(token) : undefined;
  if (seen === undefined) return false;
  if (Date.now() - seen > IDLE_MS) { parentSessions.delete(token!); return false; }
  parentSessions.set(token!, Date.now());
  return true;
}

/** Parent routes: this laptop only, unlocked with the PIN. */
export function requireParent(req: Request, res: Response, next: NextFunction): void {
  if (!isLoopback(req)) { res.status(403).json({ error: 'laptop-only' }); return; }
  if (!isParent(req)) { res.status(401).json({ error: 'locked' }); return; }
  next();
}

/** Test hook: forget sessions and lockout. */
export function resetAuthForTests(): void { parentSessions.clear(); failures = 0; lockedUntil = 0; }
