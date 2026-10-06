// Clears the parent PIN (kids, apps and reports are kept). The next time Build With Me opens
// on the laptop, it asks for a new PIN. Only someone at the parent's Claude Code can run this.
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { familyData } from './common.mjs';

const file = join(familyData(), 'family.json');
if (!existsSync(file)) { console.log('Build With Me has not been set up yet, so there is no PIN to reset.'); process.exit(0); }
const family = JSON.parse(readFileSync(file, 'utf8'));
delete family.pin;
const tmp = `${file}.${process.pid}.tmp`;
writeFileSync(tmp, JSON.stringify(family, null, 2));
renameSync(tmp, file);
console.log('PIN cleared. Open Build With Me on this computer to choose a new PIN. Kids, apps and reports are unchanged.');
