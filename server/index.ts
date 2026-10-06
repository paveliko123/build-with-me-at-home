// The local server. Two listeners:
//  - HTTP  :4747 on all interfaces. The laptop itself (loopback) gets everything; other
//    devices only get the tablet-setup wizard and the certificate files (they have no
//    certificate yet), and are otherwise sent to the secure address.
//  - HTTPS :4748 on all interfaces, with a server certificate from the home authority.

import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'node:http';
import https from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOrCreateAuthority, issueServerCert, mobileConfig, authorityName, type Authority } from './certs.js';
import { addChunk, finishUtterance, loadSpeech } from './speech.js';
import { isLoopback } from './auth.js';
import { parentRoutes } from './parentRoutes.js';
import { kidRoutes } from './kidRoutes.js';
import { journeyRoutes } from './journey/routes.js';
import { kidSession } from './passes.js';
import { setupTabletPage } from './tabletSetupPage.js';

const here = dirname(fileURLToPath(import.meta.url));
const bundled = here.endsWith(`dist${sep}server`) || here.endsWith('dist/server');
// Built front end: app/dist/web (next to the bundled server, or built from source).
export const WEB_DIR = process.env.BWM_WEB_DIR || (bundled ? join(here, '..', 'web') : join(here, '..', 'app', 'dist', 'web'));
// Development-only static pages (talk-test) when running from source.
const PUBLIC_DIR = join(here, '..', 'web', 'public');
// Build id (app/dist/build.json), so the launcher can tell when a running server is outdated.
export const BUILD_ID: string = (() => { try { return JSON.parse(readFileSync(join(WEB_DIR, '..', 'build.json'), 'utf8')).id; } catch { return 'dev'; } })();
// Files are always sent relative to a root folder: the plugin data path contains ".claude",
// and send() refuses absolute paths with dot-folders (it returned 404 for the app's own page).
const sendFrom = (res: Response, root: string, file: string) => res.sendFile(file, { root });

export interface ServerOptions { httpPort?: number; httpsPort?: number; preloadSpeech?: boolean }
export interface RunningServer { httpUrl: string; httpsUrls: string[]; httpPort: number; httpsPort: number; close: () => Promise<void>; authority: Authority }

// Pages a not-yet-set-up tablet may load over plain HTTP.
const OPEN_ON_HTTP = new Set(['/setup-tablet', '/home-certificate.mobileconfig', '/home-certificate.crt', '/api/health']);

export async function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const httpPort = opts.httpPort ?? Number(process.env.BWM_PORT || 4747);
  const httpsPort = opts.httpsPort ?? httpPort + 1;
  const authority = await loadOrCreateAuthority();
  const serverCert = await issueServerCert(authority);
  if (opts.preloadSpeech) loadSpeech().catch((e) => console.error('[speech] model failed to load:', e?.message ?? e));

  const app = express();
  app.disable('x-powered-by');

  // Plain-HTTP gate for other devices.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const secure = (req.socket as any).encrypted === true;
    if (secure || isLoopback(req) || OPEN_ON_HTTP.has(req.path)) return next();
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    res.redirect(302, `https://${host}:${httpsPort}${req.originalUrl}`);
  });

  // The health check answers any origin, so the tablet wizard (on http) can test https.
  app.get('/api/health', (_req, res) => { res.set('Access-Control-Allow-Origin', '*').json({ ok: true, build: BUILD_ID }); });

  // ---- tablet setup (home certificate) ----
  app.get('/home-certificate.mobileconfig', (_req, res) => {
    res.attachment('Build With Me home.mobileconfig').type('application/x-apple-aspen-config').send(mobileConfig(authority));
  });
  app.get('/home-certificate.crt', (_req, res) => {
    res.attachment('build-with-me-home.crt').type('application/x-x509-ca-cert').send(Buffer.from(authority.certDer));
  });
  app.get('/setup-tablet', (req, res) => {
    const host = (req.headers.host ?? 'localhost').replace(/:\d+$/, '');
    res.type('html').send(setupTabletPage(host, httpsPort, authorityName(authority)));
  });

  // ---- parent ----
  app.use('/api/parent', parentRoutes({ httpPort, httpsPort, caName: authorityName(authority) }));

  // ---- passes, the kid's session, live updates ----
  app.use('/api', kidRoutes());
  app.use('/api/kid/journey', journeyRoutes());

  // ---- speech: a kid with a live pass, or the laptop itself ----
  const mayTalk = (req: Request, res: Response, next: NextFunction) => {
    if (isLoopback(req) || kidSession(req)?.live) return next();
    res.status(401).json({ error: 'no-pass' });
  };
  app.post('/api/speech/:id', mayTalk, express.raw({ type: 'application/octet-stream', limit: '1mb' }), (req, res) => {
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(req.params.id)) || !Buffer.isBuffer(req.body)) { res.status(400).json({ error: 'bad request' }); return; }
    res.json(addChunk(String(req.params.id), req.body));
  });
  app.post('/api/speech/:id/end', mayTalk, async (req, res) => {
    try { res.json(await finishUtterance(String(req.params.id))); }
    catch (e) { res.status(500).json({ error: 'speech failed', detail: (e as Error).message }); }
  });

  // ---- front end ----
  app.get('/talk-test', mayTalk, (_req, res) => { sendFrom(res, existsSync(join(WEB_DIR, 'talk-test.html')) ? WEB_DIR : PUBLIC_DIR, 'talk-test.html'); });
  app.use(express.static(WEB_DIR, { index: false }));
  app.use(express.static(PUBLIC_DIR, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    if (existsSync(join(WEB_DIR, 'index.html'))) sendFrom(res, WEB_DIR, 'index.html');
    else res.status(503).type('text').send('The screens are not built yet. Run: npm run build:web');
  });

  // Never show raw errors (stack traces) to anyone; log them for the parent instead.
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[error] ${req.method} ${req.path}:`, err?.stack ?? err);
    if (res.headersSent) return;
    const status = err?.status ?? err?.statusCode ?? 500;
    if (req.path.startsWith('/api/')) { res.status(status).json({ error: status === 404 ? 'not found' : 'something went wrong' }); return; }
    res.status(status).type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oops</title><body style="font:18px system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f4ef;color:#1f2430;text-align:center"><div><div style="font-size:48px">🙈</div><h1 style="font-size:24px">${status === 404 ? 'That page isn’t here' : 'Oops, something went wrong'}</h1><p><a href="/">Back to Build With Me</a></p></div>`);
  });

  const httpServer = http.createServer(app);
  const httpsServer = https.createServer({ key: serverCert.keyPem, cert: serverCert.certPem }, app);
  await new Promise<void>((r, j) => httpServer.once('error', j).listen(httpPort, '0.0.0.0', r));
  await new Promise<void>((r, j) => httpsServer.once('error', j).listen(httpsPort, '0.0.0.0', r));

  return {
    authority, httpPort, httpsPort,
    httpUrl: `http://localhost:${httpPort}`,
    httpsUrls: serverCert.addresses.map((ip) => `https://${ip}:${httpsPort}`),
    close: async () => {
      httpServer.closeAllConnections?.(); httpsServer.closeAllConnections?.();
      await Promise.all([
        new Promise<void>((r) => httpServer.close(() => r())),
        new Promise<void>((r) => httpsServer.close(() => r())),
      ]);
    },
  };
}
