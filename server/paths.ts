import { homedir, tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
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
  if (inCloudFolder(dir)) throw new Error(`The family folder can't be in a cloud-synced folder: ${dir}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** OneDrive, iCloud, Dropbox or Google Drive (security audit C7a; as app/common.mjs). */
export function inCloudFolder(dir: string): boolean {
  const d = resolve(dir).toLowerCase();
  const roots = [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial].filter((r): r is string => !!r).map((r) => resolve(r).toLowerCase());
  return roots.some((r) => d === r || d.startsWith(r + sep))
    || /[\\/](onedrive[^\\/]*|icloud ?drive[^\\/]*|mobile documents|dropbox|google ?drive|googledrive|my drive)([\\/]|$)/i.test(d);
}
