import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

// Plugin private folder (packages, model, certs, sandbox). In development it's a temp
// folder; under the plugin it's ${CLAUDE_PLUGIN_DATA}, passed in as BWM_PLUGIN_DATA
// because the server runs with a cleaned environment.
export function pluginDataDir(): string {
  // Development default lives outside the repo so claude never sees a git repository.
  const dir = process.env.BWM_PLUGIN_DATA || join(tmpdir(), 'build-with-me-dev');
  mkdirSync(dir, { recursive: true });
  return dir;
}

// An empty working folder for every claude run, so no project CLAUDE.md, .mcp.json
// or settings can be picked up.
export function sandboxDir(): string {
  const dir = join(pluginDataDir(), 'sandbox');
  mkdirSync(dir, { recursive: true });
  return dir;
}

// The family's data: <home>\Build With Me (kept on uninstall). Not Documents or Desktop:
// those are often redirected to OneDrive/iCloud (even a work account), and kids' data must
// never sync anywhere. BWM_DATA overrides it for development and tests.
export function familyDataDir(): string {
  const dir = process.env.BWM_DATA || join(homedir(), 'Build With Me');
  mkdirSync(dir, { recursive: true });
  return dir;
}
