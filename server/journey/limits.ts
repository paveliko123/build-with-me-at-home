// Spending limits per pass (security audit H2). Every Claude call spends the parent's plan, so
// one pass (a kid, a sibling, or a guest who was handed a QR code) can't run it down: a pace
// limit on requests that call Claude, and caps on new apps and builds for the life of a pass.
// Kept in memory: a restart clears them, and restarting needs the parent's laptop.

import type { KidSession } from '../passes.js';
import { addAlert } from '../report/alerts.js';

export type Spend = 'chat' | 'build' | 'project';

const WINDOW_MS = 60_000;
const PER_MINUTE = 10;   // Claude-backed requests (turns, change list, builds, ship) per minute
const PER_HOUR = 150;    // the same, per hour (a fast kid manages about 2 a minute)
const MAX_PROJECTS = 5;  // new apps started with one pass
const MAX_BUILDS = 30;   // builds, rebuilds and fixes with one pass

interface Use { calls: number[]; projects: number; builds: number }
const uses = new Map<string, Use>();
let clock = () => Date.now();

export class SpendLimit extends Error {
  constructor(public code: 'slow-down' | 'pass-cap', public say: string) { super(code); }
}

/** Counts one request against the pass, or throws SpendLimit when it's over a limit. */
export function spend(s: KidSession, kind: Spend): void {
  const now = clock();
  const u = uses.get(s.pass.id) ?? { calls: [], projects: 0, builds: 0 };
  uses.set(s.pass.id, u);
  u.calls = u.calls.filter((t) => t > now - 60 * WINDOW_MS);
  if (kind === 'project') {
    if (u.projects >= MAX_PROJECTS) throw cap(s, `${MAX_PROJECTS} new apps`, "That's all the new apps one pass can start. Ask your parent for a new pass. Your apps are saved.");
    u.projects++;
    return;
  }
  if (u.calls.filter((t) => t > now - WINDOW_MS).length >= PER_MINUTE || u.calls.length >= PER_HOUR) {
    throw new SpendLimit('slow-down', "Whoa, that's fast! Wait a little, then try again.");
  }
  if (kind === 'build') {
    if (u.builds >= MAX_BUILDS) throw cap(s, `${MAX_BUILDS} builds`, "That's all the building one pass can do. Ask your parent for a new pass. Your app is saved.");
    u.builds++;
  }
  u.calls.push(now);
}

function cap(s: KidSession, what: string, say: string): SpendLimit {
  addAlert({ kind: 'limit', kidId: s.kid.id, kidName: s.kid.nickname, resetsAt: null, text: `${s.kid.nickname}'s pass reached its limit of ${what}, which keeps one pass from using up your plan. Give a new pass if they should keep going.` });
  return new SpendLimit('pass-cap', say);
}

/** Test hooks. */
export function resetLimitsForTests(): void { uses.clear(); clock = () => Date.now(); }
export function setClockForTests(fn: () => number): void { clock = fn; }
