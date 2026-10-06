// The local server. Two listeners:
//  - HTTP  :4747 on all interfaces. The laptop itself (loopback) gets everything; other
//    devices only get the tablet-setup page and the certificate files (they have no
//    certificate yet), and are otherwise sent to the secure address.
//  - HTTPS :4748 on all interfaces, with a server certificate from the home authority.

import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'node:http';
import https from 'node:https';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOrCreateAuthority, issueServerCert, homeAddresses, mobileConfig, type Authority } from './certs.js';
import { addChunk, finishUtterance, loadSpeech } from './speech.js';

const here = dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = join(here, '..', 'web', 'public');

export interface ServerOptions { httpPort?: number; httpsPort?: number; preloadSpeech?: boolean }
export interface RunningServer { httpUrl: string; httpsUrls: string[]; close: () => Promise<void>; authority: Authority }

export function isLoopback(req: Request): boolean {
  const a = req.socket.remoteAddress ?? '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

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

  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });

  // ---- tablet setup (home certificate) ----
  app.get('/home-certificate.mobileconfig', (_req, res) => {
    res.attachment('Build With Me home.mobileconfig').type('application/x-apple-aspen-config').send(mobileConfig(authority));
  });
  app.get('/home-certificate.crt', (_req, res) => {
    res.attachment('build-with-me-home.crt').type('application/x-x509-ca-cert').send(Buffer.from(authority.certDer));
  });
  app.get('/setup-tablet', (req, res) => {
    const host = (req.headers.host ?? 'localhost').replace(/:\d+$/, '');
    res.type('html').send(setupTabletPage(host, httpsPort));
  });

  // ---- speech ----
  app.post('/api/speech/:id', express.raw({ type: 'application/octet-stream', limit: '1mb' }), (req, res) => {
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(req.params.id) || !Buffer.isBuffer(req.body)) { res.status(400).json({ error: 'bad request' }); return; }
    res.json(addChunk(req.params.id, req.body));
  });
  app.post('/api/speech/:id/end', async (req, res) => {
    try { res.json(await finishUtterance(req.params.id)); }
    catch (e) { res.status(500).json({ error: 'speech failed', detail: (e as Error).message }); }
  });

  // ---- static (development pages for now; the React build arrives in slice 3) ----
  app.get('/talk-test', (_req, res) => { res.sendFile(join(PUBLIC_DIR, 'talk-test.html')); });
  app.use(express.static(PUBLIC_DIR, { index: false }));

  const httpServer = http.createServer(app);
  const httpsServer = https.createServer({ key: serverCert.keyPem, cert: serverCert.certPem }, app);
  await new Promise<void>((r) => httpServer.listen(httpPort, '0.0.0.0', r));
  await new Promise<void>((r) => httpsServer.listen(httpsPort, '0.0.0.0', r));

  return {
    authority,
    httpUrl: `http://localhost:${httpPort}`,
    httpsUrls: serverCert.addresses.map((ip) => `https://${ip}:${httpsPort}`),
    close: async () => {
      await Promise.all([
        new Promise<void>((r) => httpServer.close(() => r())),
        new Promise<void>((r) => httpsServer.close(() => r())),
      ]);
    },
  };
}

function setupTabletPage(host: string, httpsPort: number): string {
  const ips = homeAddresses();
  const target = `https://${ips.includes(host) ? host : ips[0] ?? host}:${httpsPort}/talk-test`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Set up this tablet</title>
<style>
:root{--bg:#f6f4ef;--card:#fff;--ink:#1f2430;--muted:#5d6475;--line:#e4ded3;--brand:#2f9e6e}
@media (prefers-color-scheme:dark){:root{--bg:#15171c;--card:#1f232b;--ink:#eceef3;--muted:#a3a9b8;--line:#333945;--brand:#4cc08d}}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:560px;margin:0 auto;padding:24px 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin:14px 0}
h1{font-size:24px;margin:0 0 4px} ol{padding-left:22px} li{margin:8px 0} .muted{color:var(--muted)}
a.btn{display:inline-block;background:var(--brand);color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:12px;margin:6px 0}
[hidden]{display:none}
</style></head><body><main>
<h1>📱 Set up this tablet for talking</h1>
<p class="muted">One time per tablet. This lets the tablet use its microphone with Build With Me on your home computer. The certificate only works for home-network addresses.</p>
<div class="card" id="ios"><b>iPad or iPhone</b><ol>
<li><a class="btn" href="/home-certificate.mobileconfig">Download the profile</a> and tap <b>Allow</b>.</li>
<li>Open <b>Settings</b> → <b>Profile Downloaded</b> → <b>Install</b> (enter the tablet passcode).</li>
<li>Settings → <b>General</b> → <b>About</b> → <b>Certificate Trust Settings</b> → turn on <b>Build With Me Home</b>.</li>
<li><a class="btn" href="${target}">Test talking</a></li></ol></div>
<div class="card" id="android"><b>Android tablet or phone</b>
<p class="muted">Android only accepts this kind of certificate from inside Settings. Tapping the downloaded file won't install it.</p><ol>
<li><a class="btn" href="/home-certificate.crt">Download the certificate</a> (it goes to Downloads).</li>
<li>Open <b>Settings</b> and search for <b>"CA certificate"</b>. On most phones it's <b>Security &amp; privacy → More security &amp; privacy → Encryption &amp; credentials → Install a certificate → CA certificate</b>.</li>
<li>Tap <b>Install anyway</b>, unlock if asked, and choose <b>build-with-me-home.crt</b> from Downloads.</li>
<li>Check: <b>Encryption &amp; credentials → Trusted credentials → User</b> now shows <b>Build With Me Home</b>.</li>
<li><b>Fully close Chrome</b> (swipe it away from recent apps), reopen it, then <a class="btn" href="${target}">Test talking</a>. The address bar should show no warning.</li></ol></div>
<p class="muted">Something not working? Make sure this tablet is on the same Wi-Fi as the computer, and that Windows allowed Node.js on <b>private networks</b>.</p>
<script>
const ua=navigator.userAgent, ios=/iPad|iPhone|Macintosh/.test(ua)&&'ontouchend' in document, android=/Android/.test(ua);
if(ios) document.getElementById('android').hidden=true; else if(android) document.getElementById('ios').hidden=true;
</script>
</main></body></html>`;
}
