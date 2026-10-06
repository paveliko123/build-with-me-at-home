// Removing a kid deletes everything kept about them (security audit M2): their projects and
// conversations, shipped apps, parent reports (data and the HTML files in Reports\), passes and
// alerts. The parent sees what will go before confirming (ParentHome.tsx, KidsManage).

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dataPath, readJson, removePath, updateFamily, updateJson } from './store.js';
import { forgetKidPasses, activePasses } from './passes.js';
import { shelf } from './journey/apps.js';

const SAFE = /^[A-Za-z0-9_-]{1,60}$/;
const REPORT_DATA = 'report-data';

interface KidReport { id: string; file?: string }

function reportsOf(kidId: string): KidReport[] {
  const out = new Map<string, KidReport>();
  const scan = (dir: string, withFile: boolean) => {
    let files: string[] = [];
    try { files = readdirSync(dataPath(dir)).filter((f) => f.endsWith('.json')); } catch { return; }
    for (const f of files) {
      const r = readJson<{ id?: string; kidId?: string; file?: string } | null>(`${dir}/${f}`, null);
      if (r?.kidId !== kidId) continue;
      const id = f.slice(0, -5);
      out.set(id, { id, file: withFile ? r.file : out.get(id)?.file });
    }
  };
  scan(REPORT_DATA, false);
  scan(`${REPORT_DATA}/index`, true);
  return [...out.values()];
}

function projectCount(kidId: string): number {
  try { return readdirSync(dataPath(`kids/${kidId}/projects`)).length; } catch { return 0; }
}

/** What removing this kid would delete. */
export function kidDataSummary(kidId: string) {
  if (!SAFE.test(kidId)) return null;
  const apps = shelf(kidId).length;
  return {
    apps,
    projects: projectCount(kidId),
    reports: reportsOf(kidId).length,
    livePass: activePasses().some((p) => p.kidId === kidId),
  };
}

/** Removes the kid and deletes all their data. */
export function eraseKid(kidId: string): boolean {
  if (!SAFE.test(kidId)) return false;
  let removed = false;
  updateFamily((f) => {
    const before = f.kids.length;
    f.kids = f.kids.filter((k) => k.id !== kidId);
    removed = f.kids.length < before;
  });
  if (!removed) return false;
  forgetKidPasses(kidId); // their device drops out on its next request
  for (const r of reportsOf(kidId)) {
    removePath(`${REPORT_DATA}/${r.id}.json`);
    removePath(`${REPORT_DATA}/index/${r.id}.json`);
    if (r.file && !/[\\/]/.test(r.file)) {
      const html = dataPath(`Reports/${r.file}`);
      if (existsSync(html)) rmSync(html, { force: true });
    }
  }
  updateJson<{ alerts: { kidId: string }[] }>('alerts.json', { alerts: [] }, (f) => { f.alerts = f.alerts.filter((a) => a.kidId !== kidId); });
  removePath(`kids/${kidId}`);
  console.log(`[kids] removed kid ${kidId} and their data`);
  return true;
}
