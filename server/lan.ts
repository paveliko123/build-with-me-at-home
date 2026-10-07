// Other devices on the network (security review). The laptop itself is always answered. Other
// devices only while there's a reason: a pass is live (a kid's tablet), or the parent has "Set up
// a tablet" open on the laptop. On a café or hotel Wi-Fi with no pass, strangers get a "resting"
// page and nothing else (the laptop's name, the setup page and the certificate stay hidden).
import type { Request, Response, NextFunction } from 'express';
import { allPasses, isLive } from './passes.js';
import { isThisComputer } from './auth.js';

const SETUP_MS = 15 * 60_000;
let setupUntil = 0;

/** The parent opened "Set up a tablet" (and keeps it open: the window renews this). */
export function openSetup(): number { setupUntil = Date.now() + SETUP_MS; return setupUntil; }
export const setupOpen = () => Date.now() < setupUntil;

let cache = { at: 0, live: false };
function anyPassLive(): boolean {
  if (Date.now() - cache.at > 2000) cache = { at: Date.now(), live: allPasses().some((p) => isLive(p)) };
  return cache.live;
}

/** May another device reach Build With Me right now? */
export const lanOpen = () => setupOpen() || anyPassLive();

/** The gate (server/index.ts): the laptop always; other devices only while lanOpen(). */
export function lanGate(req: Request, res: Response, next: NextFunction): void {
  if (isThisComputer(req) || lanOpen()) { next(); return; }
  if (req.path.startsWith('/api/')) { res.status(503).json({ error: 'resting' }); return; }
  res.status(503).type('html').send(RESTING_PAGE);
}

export const RESTING_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Build With Me</title><body style="font:18px system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f4ef;color:#1f2430;text-align:center;padding:16px"><div><div style="font-size:48px">😴</div><h1 style="font-size:24px">Build With Me is resting</h1><p>Ask your grown-up for a pass, then try again.</p></div>`;

/** For the checks. */
export function resetLanForTests(): void { setupUntil = 0; cache = { at: 0, live: false }; }
