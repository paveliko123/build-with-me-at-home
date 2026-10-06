// Where the course skills (stage instructions, MIT, Devpost) live: app/dist/skills next to the
// bundled server, app/skills when running from source, or BWM_SKILLS_DIR.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function skillsDir(): string {
  const candidates = [process.env.BWM_SKILLS_DIR, join(here, '..', 'skills'), join(here, '..', '..', 'app', 'skills')];
  const found = candidates.find((c) => c && existsSync(join(c, '1-start', 'SKILL.md')));
  if (!found) throw new Error('The course skills are missing (app/skills). Reinstall Build With Me.');
  return found;
}
