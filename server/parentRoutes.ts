// Parent API: first-run setup, PIN unlock/lock, kids, status strip, tablet setup info.
// Implements prd.md > Parent Gate and Responsibility, First-Run Setup, Kids.

import express, { Router } from 'express';
import QRCode from 'qrcode';
import { isLoopback, requireParent, checkPin, setPin, startParentSession, endParentSession, isParent, validPin } from './auth.js';
import { readFamily } from './store.js';
import { listKids, addKid, editKid, removeKid, cleanKidInput } from './kids.js';
import { findClaude } from './claude/runner.js';
import { readUsage, type UsageReading } from './usage.js';
import { homeAddresses } from './certs.js';

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

  r.post('/lock', (req, res) => { endParentSession(req, res); res.json({ ok: true }); });

  // ---- everything below needs the unlocked parent ----
  r.use(requireParent);

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
  r.delete('/kids/:id', (req, res) => {
    if (listKids().length <= 1) { res.status(400).json({ error: 'Keep at least one kid.' }); return; }
    res.json({ ok: removeKid(req.params.id) });
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

  return r;
}
