// npm run release: the built app that the plugin ships (app/dist is committed, because a plugin
// install can't build it). Type-checks, runs the free checks (no Claude calls), builds web +
// server + course skills, then scans the built files for private data before you commit them.
//   node scripts/release.mjs [--skip-checks]
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const run = (args) => {
  console.log(`\n> npm ${args.join(' ')}`);
  const r = process.platform === 'win32'
    ? spawnSync(`npm.cmd ${args.join(' ')}`, { stdio: 'inherit', shell: true })
    : spawnSync('npm', args, { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`\nRelease stopped: npm ${args.join(' ')} failed.`); process.exit(1); }
};

run(['run', 'typecheck']);
if (!process.argv.includes('--skip-checks')) for (const check of ['verify:revisions', 'verify:security', 'test:guard']) run(['run', check]);
run(['run', 'build']);

// Nothing personal in what ships: user folders, home addresses, emails other than the public one.
const PRIVATE = [
  [/C:[\\/]+Users[\\/]+(?!<|you\b|name\b|%|\$)[A-Za-z0-9._-]+/i, 'a Windows user folder'],
  [/\/Users\/(?!<|you\b|name\b|bob\b|\$)[A-Za-z0-9._-]+\//, 'a Mac user folder'],
  [/\b192\.168\.\d{1,3}\.\d{1,3}\b(?!\/)/, 'a home network address'],
  [/[A-Za-z0-9._%+-]+@(?!example\.|anthropic\.com)[A-Za-z0-9.-]+\.[a-z]{2,}/i, 'an email address'],
];
const ALLOWED_EMAIL = /paveliko@gmail\.com|noreply@anthropic\.com/i;
const problems = [];
let files = 0, bytes = 0;
function scan(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { scan(p); continue; }
    files++; bytes += st.size;
    if (!/\.(m?js|html|css|json|md|txt)$/i.test(name)) continue;
    const text = readFileSync(p, 'utf8');
    for (const [re, what] of PRIVATE) {
      const m = text.match(re);
      if (m && !(what === 'an email address' && ALLOWED_EMAIL.test(m[0]))) problems.push(`${p}: ${what} (${m[0].slice(0, 40)})`);
    }
  }
}
scan(join('app', 'dist'));
if (problems.length) {
  console.error('\nRelease stopped: private data in the built app:\n' + problems.map((x) => `  - ${x}`).join('\n'));
  process.exit(1);
}
const build = JSON.parse(readFileSync(join('app', 'dist', 'build.json'), 'utf8')).id;
console.log(`\nRelease build ${build}: ${files} files, ${(bytes / 1e6).toFixed(1)} MB, no private data found.`);
console.log('Next: review `git status app/dist`, then commit it with the release.');
