// The parent's window keeps Build With Me running (learner decision after the pre-install
// review): the PIN page and the Parent area each hold a small "I'm open" stream from the
// laptop's own browser. When none is open, the app stops by itself, so it never sits running
// in the background for days. It waits about a minute first (a reload or a hiccup isn't a
// close), counts only time the laptop is awake (timers don't run during sleep), and never stops
// in the middle of a build, a chat turn or a report.
import type { Request, Response } from 'express';
import { EventEmitter } from 'node:events';
import { endAllParentSessions } from './auth.js';

const TICK_MS = 10_000;
const GRACE_TICKS = 6; // ~1 minute without a parent window
const FIRST_TICKS = 18; // ~3 minutes for the first window to open after a start

let open = 0;
let seen = false;
let quiet = 0;
let homeOpen = 0; // streams from an unlocked Parent area (not the PIN page)
let lockTimer: NodeJS.Timeout | undefined;
let LOCK_AFTER_MS = 15_000; // a reload isn't a close

/** Safety review 2: the Parent area locks ~15 seconds after its last window closes, even while a
 *  build or report runs and even if a PIN page is still open in another tab (it used to wait for
 *  every parent window and for the work to finish). */
function homeClosed(): void {
  clearTimeout(lockTimer);
  lockTimer = setTimeout(() => { if (homeOpen === 0) endAllParentSessions(); }, LOCK_AFTER_MS);
  lockTimer.unref?.();
}

/** What the kids' screens show (learner request): null while a parent window is open, else the
 *  seconds left, or "waiting" while a build, turn or report finishes first. */
export type Closing = null | { seconds: number } | { waiting: true };
export const presenceEvents = new EventEmitter();
let lastClosing: Closing = null;
export const closingStatus = (): Closing => lastClosing;
function announce(next: Closing): void {
  if (JSON.stringify(next) === JSON.stringify(lastClosing)) return;
  lastClosing = next;
  presenceEvents.emit('closing', next);
}

/** GET /api/presence (laptop only): an event stream that stays open while the window is. */
export function presenceStream(req: Request, res: Response): void {
  const home = req.query.screen === 'home';
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.flushHeaders?.();
  res.write(': open\n\n');
  open++; seen = true; quiet = 0;
  if (home) { homeOpen++; clearTimeout(lockTimer); }
  announce(null);
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  res.on('close', () => {
    clearInterval(ping);
    open = Math.max(0, open - 1);
    if (home) { homeOpen = Math.max(0, homeOpen - 1); if (homeOpen === 0) homeClosed(); }
    // Kids hear almost at once (not when the PIN page just turned into the Parent area).
    if (open === 0) setTimeout(() => { if (open === 0) announce({ seconds: GRACE_TICKS * TICK_MS / 1000 }); }, 2_000).unref?.();
  });
}

/** One tick of the clock: true when it's time to stop. Exported for the checks. */
export function presenceTick(busy: boolean): boolean {
  if (open > 0) { quiet = 0; announce(null); return false; }
  if (busy) { if (seen) announce({ waiting: true }); return false; } // finish the build, turn or report first
  quiet++;
  // The window is gone: the Parent area locks at once (security review), even before the app stops.
  if (quiet === 1) endAllParentSessions();
  if (seen) announce({ seconds: Math.max(0, (GRACE_TICKS - quiet) * TICK_MS / 1000) });
  return quiet >= (seen ? GRACE_TICKS : FIRST_TICKS);
}

/** Starts the clock (server/main.ts, only when started by the launcher). */
export function stopWhenWindowCloses(busy: () => boolean, stop: () => void): void {
  const timer = setInterval(() => {
    if (!presenceTick(busy())) return;
    clearInterval(timer);
    console.log('No parent window open: stopping (start again with the desktop shortcut).');
    stop();
  }, TICK_MS);
  timer.unref();
}

/** For the checks. */
export function lockDelayForTests(ms: number): void { LOCK_AFTER_MS = ms; }
export const presenceState = () => ({ open, seen, quiet, homeOpen });
export function resetPresenceForTests(): void { open = 0; seen = false; quiet = 0; homeOpen = 0; clearTimeout(lockTimer); lastClosing = null; }
