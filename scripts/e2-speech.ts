// E2 (mechanical part): certificates + local speech-to-text. Writes devpost/e2-results.md.
// The tablet part is a hands-on learner check (setup-tablet + talk-test on a real tablet).
// Run: npm run e2

import 'reflect-metadata';
import * as x509 from '@peculiar/x509';
import https from 'node:https';
import { webcrypto } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../server/index.js';
import { issueServerCert, homeAddresses } from '../server/certs.js';

x509.cryptoProvider.set(webcrypto as unknown as Crypto);
const checks: { name: string; pass: boolean; detail: string }[] = [];
const add = (name: string, pass: boolean, detail: string) => { checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

const PORT = 4757; // test ports, so a running app on 4747 isn't disturbed
const SENTENCE = 'I want to make an app where my cat flies through space and eats the stars.';

function get(url: string, ca?: string, servername?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { ca, servername, rejectUnauthorized: true }, (res) => {
      let body = ''; res.on('data', (d) => (body += d)); res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
  });
}

function makeSpeechWav(): string | null {
  if (process.platform !== 'win32') return null;
  const dir = join(tmpdir(), 'build-with-me-dev'); mkdirSync(dir, { recursive: true });
  const wav = join(dir, 'e2-sample.wav');
  const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
    `$f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono); ` +
    `$s.SetOutputToWaveFile('${wav}', $f); $s.Speak('${SENTENCE}'); $s.Dispose()`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  return r.status === 0 && existsSync(wav) ? wav : null;
}

function wavPcm(file: string): Buffer {
  const buf = readFileSync(file);
  let o = 12;
  while (o < buf.length) {
    const id = buf.toString('ascii', o, o + 4), size = buf.readUInt32LE(o + 4);
    if (id === 'data') return buf.subarray(o + 8, o + 8 + size);
    o += 8 + size;
  }
  throw new Error('no data chunk');
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean);

async function main() {
  const server = await startServer({ httpPort: PORT, httpsPort: PORT + 1 });
  try {
    // 1. Certificates
    const ca = new x509.X509Certificate(server.authority.certPem);
    const nc = ca.extensions.find((e) => e.type === '2.5.29.30');
    add('home authority has name constraints (critical)', !!nc && nc.critical, nc ? `constraints extension present, critical=${nc.critical}` : 'missing');
    const bc = ca.getExtension(x509.BasicConstraintsExtension);
    add('authority can only sign server certificates (pathLen 0)', !!bc?.ca && bc.pathLength === 0, `ca=${bc?.ca} pathLength=${bc?.pathLength}`);

    const ips = homeAddresses();
    add('home network address found', ips.length > 0, ips.join(', ') || 'none (tablets cannot connect)');
    const health = await get(`https://127.0.0.1:${PORT + 1}/api/health`, server.authority.certPem);
    add('HTTPS works when the home authority is trusted', health.status === 200, `GET /api/health → ${health.status}`);
    if (ips[0]) {
      const viaLan = await get(`https://${ips[0]}:${PORT + 1}/api/health`, server.authority.certPem).catch((e) => ({ status: 0, body: e.message }));
      add('HTTPS on the home address', viaLan.status === 200, `https://${ips[0]}:${PORT + 1} → ${viaLan.status} ${viaLan.status ? '' : viaLan.body}`);
    }

    // A certificate the authority signs for a real website must be REFUSED (name constraints).
    const rogue = await issueServerCert(server.authority, ['8.8.8.8']);
    const rogueServer = https.createServer({ key: rogue.keyPem, cert: rogue.certPem }, (_q, s) => s.end('nope'));
    await new Promise<void>((r) => rogueServer.listen(PORT + 2, '127.0.0.1', r));
    const blocked = await get(`https://127.0.0.1:${PORT + 2}/`, server.authority.certPem, '8.8.8.8').then(() => 'accepted', (e) => e.message);
    rogueServer.close();
    add('home certificate cannot vouch for an outside address', blocked !== 'accepted', `cert for 8.8.8.8 → ${blocked}`);

    // Plain HTTP from another device only gets the setup page.
    const page = await fetch(`http://127.0.0.1:${PORT}/setup-tablet`).then((r) => r.text());
    add('setup-tablet page served', page.includes('Set up this tablet'), `${page.length} bytes`);
    const mc = await fetch(`http://127.0.0.1:${PORT}/home-certificate.mobileconfig`);
    add('iPad profile download', mc.ok && (mc.headers.get('content-type') ?? '').includes('apple-aspen-config'), `${mc.status} ${mc.headers.get('content-type')}`);

    // 2. Speech: synthesize a sentence, send it in 1-second chunks like the browser does.
    const wav = makeSpeechWav();
    if (!wav) { add('speech sample created', false, 'Windows speech synthesis unavailable'); return; }
    const pcm = wavPcm(wav);
    const t0 = Date.now();
    await fetch(`http://127.0.0.1:${PORT}/api/speech/e2warmup/end`, { method: 'POST' }); // nothing sent: returns empty fast
    const id = 'e2' + Date.now();
    const loadStart = Date.now();
    for (let o = 0; o < pcm.length; o += 32000) {
      await fetch(`http://127.0.0.1:${PORT}/api/speech/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(pcm.subarray(o, o + 32000)) });
    }
    const first = await fetch(`http://127.0.0.1:${PORT}/api/speech/${id}/end`, { method: 'POST' }).then((r) => r.json());
    const firstMs = Date.now() - loadStart;
    const expected = words(SENTENCE), got = words(first.text ?? '');
    const hits = expected.filter((w) => got.includes(w)).length;
    add('speech-to-text runs on this computer (first run, includes model load/download)', hits / expected.length >= 0.8, `"${first.text}" · ${hits}/${expected.length} words · ${(firstMs / 1000).toFixed(1)} s`);

    // Warm timing (what a kid actually waits for after they stop talking).
    const id2 = 'e2b' + Date.now();
    for (let o = 0; o < pcm.length; o += 32000) {
      await fetch(`http://127.0.0.1:${PORT}/api/speech/${id2}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(pcm.subarray(o, o + 32000)) });
    }
    const w0 = Date.now();
    const warm = await fetch(`http://127.0.0.1:${PORT}/api/speech/${id2}/end`, { method: 'POST' }).then((r) => r.json());
    const waitMs = Date.now() - w0;
    add('warm wait after talking stops < 3 s (laptop)', waitMs < 3000, `${(waitMs / 1000).toFixed(2)} s for ${warm.seconds?.toFixed(1)} s of speech (model ${(warm.transcribeMs / 1000).toFixed(2)} s)`);
    void t0;
  } finally {
    await server.close();
    const passed = checks.filter((c) => c.pass).length;
    writeFileSync('devpost/e2-results.md', `# E2 results: local speech and the home certificate

Run on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · **${passed}/${checks.length} mechanical checks passed**

## In plain words

- **The home certificate** works for this computer's home addresses, and it is **refused for any outside address**, so it can't be misused for real websites.
- **Speech to text** runs on this computer with Moonshine (faster than Whisper for short sentences; see the benchmark). The "warm wait" row is how long a kid waits after they stop talking (the audio itself is only kilobytes on Wi-Fi).
- **Still to do by hand:** install the certificate on a real tablet from \`/setup-tablet\` and try \`/talk-test\` there (learner check).

| Result | Check | Detail |
|---|---|---|
${checks.map((c) => `| ${c.pass ? '✅' : '❌'} | ${c.name} | ${c.detail.replace(/\|/g, '\\|')} |`).join('\n')}

## Tablet results (learner check)

_To be filled in after trying it on the tablet._
`, 'utf8');
    console.log(`\n${passed}/${checks.length} passed → devpost/e2-results.md`);
    process.exitCode = passed === checks.length ? 0 : 1;
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
