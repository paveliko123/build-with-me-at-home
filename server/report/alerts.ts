// "Needs your attention" (prd.md > The Parent Report, Limit Reached): flags from reports and
// limit-reached events, kept in alerts.json until the parent dismisses them.

import { randomBytes } from 'node:crypto';
import { readJson, updateJson } from '../store.js';
import { passEvents } from '../passes.js';

export interface Alert {
  id: string;
  at: number;
  kind: 'flag' | 'limit' | 'wellbeing' | 'pin'; // wellbeing: at once, during the pass; pin: wrong PIN tries
  kidId: string;
  kidName: string;
  text: string;
  reportId?: string;
  resetsAt?: number | null;
  dismissed?: boolean;
}

const FILE = 'alerts.json';

export function listAlerts(): Alert[] {
  return readJson<{ alerts: Alert[] }>(FILE, { alerts: [] }).alerts.filter((a) => !a.dismissed).sort((a, b) => b.at - a.at);
}

export function addAlert(a: Omit<Alert, 'id' | 'at'>): void {
  updateJson<{ alerts: Alert[] }>(FILE, { alerts: [] }, (f) => {
    // One limit alert per kid at a time is enough.
    if (a.kind === 'limit' && f.alerts.some((x) => x.kind === 'limit' && x.kidId === a.kidId && x.text === a.text && !x.dismissed && Date.now() - x.at < 30 * 60_000)) return;
    f.alerts.push({ ...a, id: randomBytes(6).toString('base64url'), at: Date.now() });
    f.alerts = f.alerts.slice(-200);
  });
  passEvents.emit('changed'); // the parent home reloads its cards
}

export function dismissAlert(id: string): boolean {
  let found = false;
  updateJson<{ alerts: Alert[] }>(FILE, { alerts: [] }, (f) => { const x = f.alerts.find((y) => y.id === id); if (x) { x.dismissed = true; found = true; } });
  return found;
}
