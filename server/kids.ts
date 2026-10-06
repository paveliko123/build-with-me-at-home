// The family's kids, kept in family.json. The age group is set only here, by the parent.

import { randomBytes } from 'node:crypto';
import { readFamily, updateFamily, type Kid, type AgeGroup } from './store.js';

export function cleanKidInput(body: any): { nickname: string; group: AgeGroup; emoji: string } | string {
  const nickname = typeof body?.nickname === 'string' ? body.nickname.trim().slice(0, 24) : '';
  if (!nickname) return 'A nickname is needed.';
  const group: AgeGroup = body?.group === 'teen' ? 'teen' : body?.group === 'kid' ? 'kid' : (null as any);
  if (!group) return 'Pick Kid (under 13) or Teen (13–17).';
  const emoji = typeof body?.emoji === 'string' && body.emoji.trim() ? [...body.emoji.trim()].slice(0, 2).join('') : '🙂';
  return { nickname, group, emoji };
}

export function listKids(): Kid[] {
  return readFamily().kids;
}

export function addKid(input: { nickname: string; group: AgeGroup; emoji: string }): Kid {
  const kid: Kid = { id: randomBytes(6).toString('hex'), ...input, createdAt: Date.now() };
  updateFamily((f) => { f.kids.push(kid); });
  return kid;
}

export function editKid(id: string, input: { nickname: string; group: AgeGroup; emoji: string }): Kid | null {
  let found: Kid | null = null;
  updateFamily((f) => {
    const k = f.kids.find((x) => x.id === id);
    if (k) { Object.assign(k, input); found = k; }
  });
  return found;
}

export function removeKid(id: string): boolean {
  let removed = false;
  updateFamily((f) => {
    const before = f.kids.length;
    f.kids = f.kids.filter((k) => k.id !== id);
    removed = f.kids.length < before;
  });
  return removed;
}
