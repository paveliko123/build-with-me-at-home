// Checks the privacy scrub: emails and user folders are hidden, normal text and CSS are not.
import { scrubText } from '../server/claude/guard.js';

const cases: Array<[string, boolean]> = [
  ['mail me at someone@example.com please', false],
  ['folder C:\\Users\\Alex\\AppData\\x and /Users/bob/app and /home/ann/x', false],
  ['@media (max-width: 600px) { a { color: red } }', true],
  ['Your favorite animal is the narwhal!', true],
];

let ok = true;
for (const [input, unchanged] of cases) {
  const out = scrubText(input);
  const pass = unchanged ? out === input : !/@[a-z0-9-]+\.[a-z]{2,}|Users[\\/]|home\//i.test(out);
  ok &&= pass;
  console.log(pass ? 'PASS' : 'FAIL', JSON.stringify(out));
}
process.exitCode = ok ? 0 : 1;
