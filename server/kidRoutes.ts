// Opening a pass, the kid's session, and live updates (SSE) for both sides.
// Implements prd.md > Passes, spec.md > Passes, spec.md > Server Core (SSE).

import { closingStatus, presenceEvents, type Closing } from './presence.js';
import express, { Router, type Request, type Response } from 'express';
import { endParentSession, isLoopback, isParent, cookies, PARENT_COOKIE } from './auth.js';
import { kidSession, kidView, openPass, peekPass, passEvents } from './passes.js';

export function kidRoutes(): Router {
  const r = Router();
  r.use(express.json({ limit: '10kb' }));

  // What a QR link would open (doesn't use it up).
  r.get('/pass/peek/:code', (req, res) => { res.json(peekPass(req, req.params.code)); });

  // Use up a pass on this device: the QR code or the typed code.
  r.post('/pass/open', (req, res) => {
    const out = openPass(req, res, String(req.body?.code ?? '').trim());
    if (!out.ok) {
      const status = out.error === 'wait' ? 429 : out.error === 'unknown' ? 404 : out.error === 'not-home' ? 403 : 410;
      res.status(status).json(out);
      return;
    }
    // A kid using the laptop must not be one tab away from the unlocked parent area.
    if (isLoopback(req) && cookies(req)[PARENT_COOKIE]) endParentSession(req, res);
    res.json({ ok: true });
  });

  // The kid's pass on this device: 401 none, otherwise live or over (Time's up).
  r.get('/kid/session', (req, res) => {
    const s = kidSession(req);
    if (!s) { res.status(401).json({ error: 'no-pass' }); return; }
    res.json(kidView(s));
  });

  // Live updates. Parent: "passes changed". Kid: their pass (extended, ended, over).
  r.get('/events', (req: Request, res: Response) => {
    // ?as=kid: the kid page asks for its pass stream even when the parent cookie is also here
    // (same browser on the laptop; UI review K3: End now didn't reach the kid tab).
    const parent = req.query.as !== 'kid' && isParent(req);
    const kid = parent ? null : kidSession(req);
    if (!parent && !kid) { res.status(401).json({ error: 'no-pass' }); return; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('hello', { now: Date.now() });

    const onChanged = () => send('passes', { now: Date.now() });
    const passId = kid?.pass.id;
    const onPass = (id: string) => {
      if (id !== passId) return;
      const s = kidSession(req);
      if (s) send('pass', kidView(s));
    };
    if (parent) passEvents.on('changed', onChanged); else passEvents.on('pass', onPass);
    // The parent closed their window: kids see when the app will stop (learner request).
    const onClosing = (c: Closing) => send('closing', c);
    if (!parent) { presenceEvents.on('closing', onClosing); send('closing', closingStatus()); }
    const beat = setInterval(() => res.write(': beat\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(beat);
      passEvents.off('changed', onChanged); passEvents.off('pass', onPass);
      presenceEvents.off('closing', onClosing);
    });
  });

  return r;
}
