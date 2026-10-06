// Who's asking. The parent side answers only on this laptop (loopback) and only with a
// parent cookie, which the PIN unlocks. Kids get in with pass cookies (slice 4).

import type { Request, Response, NextFunction } from 'express';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { networkInterfaces } from 'node:os';
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
