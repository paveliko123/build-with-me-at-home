// Parent API: first-run setup, PIN unlock/lock, kids, status strip, tablet setup info.
// Implements prd.md > Parent Gate and Responsibility, First-Run Setup, Kids.

import express, { Router } from 'express';
import QRCode from 'qrcode';
import { isLoopback, requireParent, checkPin, setPin, startParentSession, endParentSession, isParent, validPin } from './auth.js';
import { readFamily } from './store.js';
import { listKids, addKid, editKid, cleanKidInput } from './kids.js';
import { eraseKid, kidDataSummary } from './kidData.js';
import { findClaude } from './claude/runner.js';
import { readUsage, type UsageReading } from './usage.js';
import { homeAddresses } from './certs.js';
import { activePasses, createPass, extendPass, endPass } from './passes.js';
import { deleteApp, shelf } from './journey/apps.js';
import { listReports, readReport } from './report/reporter.js';
import { renderReport } from './report/template.js';
import { dismissAlert, listAlerts } from './report/alerts.js';

let usageCache: { reading: UsageReading; at: number } | null = null;
let usageInFlight: Promise<UsageReading> | null = null;

export async function currentUsage(maxAgeMs = 60_000): Promise<UsageReading> {
  if (usageCache && Date.now() - usageCache.at < maxAgeMs) return usageCache.reading;
  usageInFlight ??= readUsage().finally(() => (usageInFlight = null));
  const reading = await usageInFlight;
  usageCache = { reading, at: Date.now() };
  return reading;
}

export function parentRoutes(opts: { httpPort: number; httpsPort: number; caName: string }): Router {
  const r = Router();
  r.use(express.json({ limit: '100kb' }));

  // State of the gate: never needs the PIN, but only answers on the laptop.
  r.get('/state', (req, res) => {
    if (!isLoopback(req)) { res.status(403).json({ error: 'laptop-only' }); return; }
    const f = readFamily();
    res.json({ hasPin: !!f.pin, kids: f.kids.length, unlocked: isParent(req) });
  });

  // First-run step 1 (UI review P1): is Claude Code here and signed in? Same check as the status
  // strip, before a PIN exists (afterwards it's /status, behind the PIN).
  r.get('/claude-check', async (req, res) => {
    if (!isLoopback(req)) { res.status(403).json({ error: 'laptop-only' }); return; }
    if (readFamily().pin) { res.status(409).json({ error: 'already-set-up' }); return; }
    if (!findClaude()) { res.json({ found: false, signedIn: false }); return; }
    const usage = await currentUsage(req.query.fresh ? 0 : 60_000);
    res.json({ found: true, signedIn: !/not logged in|please run \/login/i.test(usage.raw) });
  });

  // First-run: create the PIN and the first kids. Only allowed while no PIN exists.
  r.post('/setup', async (req, res) => {
    if (!isLoopback(req)) { res.status(403).json({ error: 'laptop-only' }); return; }
    if (readFamily().pin) { res.status(409).json({ error: 'already-set-up' }); return; }
    const { pin, kids } = req.body ?? {};
    if (!validPin(pin)) { res.status(400).json({ error: 'The PIN needs 4 to 8 digits.' }); return; }
    const cleaned = Array.isArray(kids) ? kids.map(cleanKidInput) : [];
    const bad = cleaned.find((k) => typeof k === 'string');
    const hasKids = readFamily().kids.length > 0; // after /build-with-me:reset-pin only a new PIN is needed
    if (bad || (!cleaned.length && !hasKids)) { res.status(400).json({ error: bad ?? 'Add at least one kid.' }); return; }
    await setPin(pin);
    for (const k of cleaned) addKid(k as Exclude<typeof k, string>);
    startParentSession(res);
    res.json({ ok: true });
  });

  r.post('/unlock', async (req, res) => {
    if (!isLoopback(req)) { res.status(403).json({ error: 'laptop-only' }); return; }
    const result = await checkPin(String(req.body?.pin ?? ''));
    if (result.ok) { startParentSession(res); res.json({ ok: true }); return; }
    if (result.reason === 'locked') { res.status(429).json(result); return; }
    if (result.reason === 'no-pin') { res.status(409).json(result); return; }
    res.status(401).json(result);
  });

  r.post('/lock', (req, res) => {
    if (!isLoopback(req)) { res.status(403).json({ error: 'laptop-only' }); return; }
    endParentSession(req, res); res.json({ ok: true });
  });

  // ---- everything below needs the unlocked parent ----
  r.use(requireParent);

  // ⏻ Stop Build With Me (README review: the server keeps running after Claude Code closes, and
  // a parent on a public Wi-Fi should be able to stop it without ending a process). The same
  // clean stop as Ctrl+C: the lock file goes, the server closes (server/main.ts).
  r.post('/shutdown', (_req, res) => {
    res.json({ ok: true });
    setTimeout(() => process.emit('SIGTERM'), 300);
  });

  r.post('/pin', async (req, res) => {
    const { current, next } = req.body ?? {};
    const check = await checkPin(String(current ?? ''));
    if (!check.ok) { res.status(check.reason === 'locked' ? 429 : 401).json(check); return; }
    if (!validPin(next)) { res.status(400).json({ error: 'The new PIN needs 4 to 8 digits.' }); return; }
    await setPin(next);
    startParentSession(res);
    res.json({ ok: true });
  });

  r.get('/kids', (_req, res) => { res.json(listKids()); });
  r.post('/kids', (req, res) => {
    const k = cleanKidInput(req.body);
    if (typeof k === 'string') { res.status(400).json({ error: k }); return; }
    res.json(addKid(k));
  });
  r.put('/kids/:id', (req, res) => {
    const k = cleanKidInput(req.body);
    if (typeof k === 'string') { res.status(400).json({ error: k }); return; }
    const kid = editKid(req.params.id, k);
    if (!kid) { res.status(404).json({ error: 'not found' }); return; }
    res.json(kid);
  });
  // Removing a kid deletes all their data (kidData.ts). The screen shows what will go first and
  // sends erase=1 once the parent confirms.
  r.get('/kids/:id/data', (req, res) => {
    const summary = kidDataSummary(req.params.id);
    if (!summary) { res.status(404).json({ error: 'not found' }); return; }
    res.json(summary);
  });
  r.delete('/kids/:id', (req, res) => {
    if (listKids().length <= 1) { res.status(400).json({ error: 'Keep at least one kid.' }); return; }
    if (req.query.erase !== '1') { res.status(400).json({ error: 'Confirm deleting their data first.' }); return; }
    res.json({ ok: eraseKid(req.params.id) });
  });

  // Status strip: Claude Code + plan usage (refreshed at most once a minute).
  r.get('/status', async (req, res) => {
    const bin = findClaude();
    if (!bin) { res.json({ claude: { found: false, signedIn: false } }); return; }
    const usage = await currentUsage(req.query.fresh ? 0 : 60_000);
    const signedIn = !/not logged in|please run \/login/i.test(usage.raw);
    res.json({
      claude: { found: true, signedIn, subscription: /subscription/i.test(usage.raw) },
      usage: usage.ok ? { fiveHourPct: usage.fiveHourPct, fiveHourResets: usage.fiveHourResets, weeklyPct: usage.weeklyPct, weeklyResets: usage.weeklyResets, at: usage.at } : null,
    });
  });

  // Tablet setup: the address + QR code a tablet scans to start the guided wizard.
  r.get('/tablet-setup', async (_req, res) => {
    const ips = homeAddresses();
    const url = ips[0] ? `http://${ips[0]}:${opts.httpPort}/setup-tablet` : null;
    res.json({ url, addresses: ips, httpsPort: opts.httpsPort, certificateName: opts.caName, qr: url ? await QRCode.toDataURL(url, { margin: 1, width: 240 }) : null });
  });

  // ---- reports and alerts (prd.md > The Parent Report, Limit Reached) ----
  r.get('/reports', (_req, res) => { res.json(listReports()); });
  r.get('/reports/:id/html', (req, res) => {
    const report = readReport(String(req.params.id));
    if (!report) { res.status(404).json({ error: 'Report not found.' }); return; }
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'").type('html').send(renderReport(report));
  });
  r.get('/alerts', (_req, res) => { res.json(listAlerts()); });
  r.post('/alerts/:id/dismiss', (req, res) => { res.json({ ok: dismissAlert(String(req.params.id)) }); });

  // ---- each kid's apps (prd.md > My Apps: Kids & their apps → Manage) ----
  r.get('/apps', (_req, res) => {
    res.json(Object.fromEntries(readFamily().kids.map((k) => [k.id, shelf(k.id).map((a) => ({ ...a, path: `/apps/${k.id}/${a.slug}/`, iconUrl: a.icon ? `/apps/${k.id}/${a.slug}/icon.svg` : null }))])));
  });
  r.delete('/kids/:kidId/apps/:slug', (req, res) => {
    if (!deleteApp(String(req.params.kidId), String(req.params.slug))) { res.status(404).json({ error: 'That app is already gone.' }); return; }
    res.json({ ok: true });
  });

  // ---- passes (prd.md > Passes) ----
  // How a pass is opened: QR → https://<home address>/p/<code>; laptops type the code at
  // https://<home address>; "open on this laptop" → http://localhost/p/<code>.
  const withLinks = async <P extends { code?: string }>(p: P) => {
    if (!p.code) return p;
    const ip = homeAddresses()[0];
    const qrUrl = ip ? `https://${ip}:${opts.httpsPort}/p/${p.code}` : null;
    return {
      ...p, qrUrl, typeAt: ip ? `https://${ip}:${opts.httpsPort}` : null,
      laptopUrl: `http://localhost:${opts.httpPort}/p/${p.code}`,
      qr: qrUrl ? await QRCode.toDataURL(qrUrl, { margin: 1, width: 240 }) : null,
    };
  };
  r.get('/passes', async (_req, res) => { res.json(await Promise.all(activePasses().map(withLinks))); });
  r.post('/passes', async (req, res) => {
    const { kidId, minutes, replace } = req.body ?? {};
    const out = createPass(String(kidId ?? ''), Number(minutes), replace === true);
    if (!out.ok) {
      const msg = { 'no-kid': 'Pick a kid first.', 'bad-minutes': 'Pick a time between 1 minute and 24 hours.', 'kid-has-pass': 'This kid already has a pass.' }[out.error];
      res.status(out.error === 'kid-has-pass' ? 409 : 400).json({ error: msg, code: out.error, endsAt: 'pass' in out ? out.pass.endsAt : undefined });
      return;
    }
    const view = activePasses().find((p) => p.id === out.pass.id);
    res.json(await withLinks(view!));
  });
  r.post('/passes/:id/extend', (req, res) => {
    const p = extendPass(req.params.id, Number(req.body?.minutes));
    if (!p) { res.status(404).json({ error: 'That pass has already ended.' }); return; }
    res.json({ ok: true, endsAt: p.endsAt });
  });
  r.post('/passes/:id/end', (req, res) => {
    if (!endPass(req.params.id)) { res.status(404).json({ error: 'That pass has already ended.' }); return; }
    res.json({ ok: true });
  });

  return r;
}
