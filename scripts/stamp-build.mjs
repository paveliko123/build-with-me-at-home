// Writes app/dist/build.json with a fresh build id. The launcher compares it with the
// running copy to refresh and restart automatically after an update or a rebuild.
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('app/dist', { recursive: true });
const id = `${Date.now().toString(36)}`;
writeFileSync('app/dist/build.json', JSON.stringify({ id, builtAt: new Date().toISOString() }, null, 2));
console.log('build', id);
