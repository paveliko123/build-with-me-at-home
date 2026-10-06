// Writes app/dist/build.json with a fresh build id. The launcher compares it with the
// running copy to refresh and restart automatically after an update or a rebuild.
// Also copies the course skills (app/skills, MIT, Devpost) next to the bundled server.
import { writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
mkdirSync('app/dist', { recursive: true });
rmSync('app/dist/skills', { recursive: true, force: true });
cpSync('app/skills', 'app/dist/skills', { recursive: true });
const id = `${Date.now().toString(36)}`;
writeFileSync('app/dist/build.json', JSON.stringify({ id, builtAt: new Date().toISOString() }, null, 2));
console.log('build', id);
