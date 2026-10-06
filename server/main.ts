// Entry point: starts the server, writes a lock file (pid + port) in the plugin data folder,
// and prints where to open it. A second copy exits if the port is already taken.
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './index.js';
import { pluginDataDir } from './paths.js';

const lock = join(pluginDataDir(), 'server.lock');
let s: Awaited<ReturnType<typeof startServer>>;
try {
  s = await startServer({ preloadSpeech: true });
} catch (e: any) {
  console.error(e?.code === 'EADDRINUSE' ? 'Build With Me is already running (port in use).' : e);
  process.exit(1);
}
writeFileSync(lock, JSON.stringify({ pid: process.pid, port: s.httpPort, started: new Date().toISOString() }));
console.log(`Build With Me is running.
  On this computer: ${s.httpUrl}
  Tablets (after setup): ${s.httpsUrls.join('  ') || '(no home network address found)'}
  Tablet setup page: ${s.httpsUrls[0] ? s.httpsUrls[0].replace('https://', 'http://').replace(/:\d+$/, ':' + s.httpPort) + '/setup-tablet' : '(none)'}`);

const stop = async () => { rmSync(lock, { force: true }); await s.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
