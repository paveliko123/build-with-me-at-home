// Plain JSON files in <home>\Build With Me (or BWM_DATA). Writes are atomic: write a
// temporary file, then rename over the old one, so a crash never leaves half a file.

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { familyDataDir } from './paths.js';

export function dataPath(rel: string): string {
  return join(familyDataDir(), rel);
}

export function readJson<T>(rel: string, fallback: T): T {
  const file = dataPath(rel);
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(readFileSync(file, 'utf8')) as T; }
  catch { return fallback; }
}

export function writeJson(rel: string, data: unknown): void {
  const file = dataPath(rel);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  renameSync(tmp, file);
}

/** Read-modify-write in one synchronous step (Node runs it without interleaving). */
export function updateJson<T>(rel: string, fallback: T, change: (current: T) => T | void): T {
  const current = readJson(rel, fallback);
  const next = (change(current) ?? current) as T;
  writeJson(rel, next);
  return next;
}

export function removePath(rel: string): void {
  rmSync(dataPath(rel), { recursive: true, force: true });
}

// ---------- family.json ----------

export type AgeGroup = 'kid' | 'teen';
export interface Kid { id: string; nickname: string; group: AgeGroup; emoji: string; createdAt: number }
export interface Family {
  version: 1;
  pin?: { salt: string; hash: string };
  kids: Kid[];
  settings: { port?: number };
}

export const FAMILY_FILE = 'family.json';
export const emptyFamily = (): Family => ({ version: 1, kids: [], settings: {} });
export const readFamily = (): Family => readJson<Family>(FAMILY_FILE, emptyFamily());
export const updateFamily = (change: (f: Family) => Family | void): Family => updateJson(FAMILY_FILE, emptyFamily(), change);
