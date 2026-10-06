// Entry point: starts the server and prints where to open it.
import { startServer } from './index.js';

const s = await startServer({ preloadSpeech: true });
console.log(`Build With Me is running.
  On this computer: ${s.httpUrl}
  Tablets (after setup): ${s.httpsUrls.join('  ') || '(no home network address found)'}
  Tablet setup page: ${s.httpsUrls[0] ? s.httpsUrls[0].replace('https://', 'http://').replace(/:\d+$/, ':' + (Number(process.env.BWM_PORT || 4747))) + '/setup-tablet' : '(none)'}`);

const stop = async () => { await s.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
