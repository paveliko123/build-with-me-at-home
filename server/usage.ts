// Reads the parent's plan usage (the same numbers as Claude Code's /usage) by running
// the built-in /usage command through the isolated runner.

import { oneShot } from './claude/runner.js';

export interface UsageReading {
  at: number;
  fiveHourPct?: number;
  weeklyPct?: number;
  fiveHourResets?: string;
  weeklyResets?: string;
  raw: string;
  ok: boolean;
}

// Finds a percentage on the line that mentions the window, or on the next few lines
// (the /usage text puts the bar and the percentage close to the heading).
function pctNear(lines: string[], heading: RegExp): { pct?: number; resets?: string } {
  const i = lines.findIndex((l) => heading.test(l));
  if (i < 0) return {};
  const windowLines = lines.slice(i, i + 4);
  let pct: number | undefined;
  let resets: string | undefined;
  for (const l of windowLines) {
    const m = l.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
    if (m && pct === undefined) pct = Number(m[1]);
    const r = l.match(/resets?\s+(.+)$/i);
    if (r && !resets) resets = r[1].replace(/\s*\([^)]*\)\s*$/, '').trim(); // drop the time-zone name
  }
  return { pct, resets };
}

export function parseUsage(raw: string): Omit<UsageReading, 'at' | 'raw'> {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const five = pctNear(lines, /(current session|5[- ]?hour|five[- ]?hour)/i);
  const week = pctNear(lines, /(current week|weekly|7[- ]?day)(?!.*opus|.*sonnet)/i);
  return {
    fiveHourPct: five.pct,
    fiveHourResets: five.resets,
    weeklyPct: week.pct,
    weeklyResets: week.resets,
    ok: five.pct !== undefined || week.pct !== undefined,
  };
}

export async function readUsage(): Promise<UsageReading> {
  const r = await oneShot({
    model: 'haiku',
    systemPrompt: 'You are a usage reader.',
    allowSlashCommands: true,
    prompt: '/usage',
    timeoutMs: 60_000,
  });
  const raw = r.text || r.error || '';
  return { at: Date.now(), raw, ...parseUsage(raw) };
}
