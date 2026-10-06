// How much of the 5-hour limit an app's own Claude calls used (the learner's question: "what if I
// use Claude at the same time?"). /usage is one number for the whole account, so it can't tell a
// kid's use from the parent's. Every call the app makes does report its own size, as Claude
// Code's cost estimate; the plan's % per unit of that is learned here from this family's own
// measurements: E3 runs and reports where the change in /usage was measured from the start and
// no other kid was busy. Kept in the family folder, so it survives reinstalls.

import { readJson, writeJson } from '../store.js';

export interface Sample { at: number; pct: number; cost: number; source: 'e3' | 'report' }

const FILE = 'usage-calibration.json';
const MIN_COST = 2; // whole-percent readings need about this much use before the rate means anything
const KEEP = 30;

export function samples(): Sample[] {
  return readJson<Sample[]>(FILE, []);
}

export function addSample(s: Omit<Sample, 'at'> & { at?: number }): void {
  if (!(s.cost > 0) || !(s.pct >= 0)) return;
  writeJson(FILE, [...samples(), { at: Date.now(), ...s }].slice(-KEEP));
}

/** % of the 5-hour limit per unit of Claude Code's cost estimate, or null until there's enough.
 *  Readings that ran high (the parent using Claude at the same time) are left out: anything above
 *  1.5 times the median rate. */
export function pctPerCost(): { rate: number; count: number } | null {
  const all = samples();
  if (sum(all.map((s) => s.cost)) < MIN_COST) return null;
  const rates = all.map((s) => s.pct / s.cost).sort((a, b) => a - b);
  const median = rates[Math.floor(rates.length / 2)];
  const kept = all.filter((s) => s.pct / s.cost <= median * 1.5);
  const cost = sum(kept.map((s) => s.cost));
  if (cost < MIN_COST) return null;
  return { rate: sum(kept.map((s) => s.pct)) / cost, count: kept.length };
}

/** This app's own share of the 5-hour limit, from its own calls. */
export function ownShare(cost: number): number | null {
  const c = pctPerCost();
  return c && cost > 0 ? Math.round(cost * c.rate * 10) / 10 : null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
