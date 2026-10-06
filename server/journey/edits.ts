// Ported from Build With Me. Cost levers (2026-10-04): a change, checklist step, or fix comes back as small find-and-
// replace edits instead of the whole app again (output tokens cost 5x input). If any edit
// doesn't apply cleanly, generateApp falls back to a full rewrite.

export const EDIT_FORMAT = `Reply with only the edits, in this EDIT FORMAT (never the whole file, no Markdown fences):
CHANGED: <what this version adds or changes, in plain words, at most 20 words>
<<<<<<< FIND
<lines copied exactly from the current app, enough of them to appear only once>
=======
<the new lines that replace them>
>>>>>>> END
Use as many FIND/END blocks as needed, from top to bottom. Copy the FIND text character for character, including spaces and indentation. To add new code, FIND a nearby unique line and repeat it in the replacement together with the new code. Keep each block small.`;

export interface Edited { html: string; changed?: string; blocks: number }

const CHANGED_NOTE = /<!--\s*changed:[\s\S]*?-->/i;

/** What a new version changed, line by line ("- " removed, "+ " added), ignoring the builder's
 * own "changed:" note. Empty when nothing real changed (QA round 3: a version that was the old
 * app plus a note claiming the changes). */
export function lineDiff(before: string, after: string): string {
  const lines = (html: string) => html.replace(CHANGED_NOTE, '').split('\n').map(l => l.trim()).filter(Boolean);
  const left = new Map<string, number>();
  for (const line of lines(before)) left.set(line, (left.get(line) ?? 0) + 1);
  const added: string[] = [];
  for (const line of lines(after)) {
    const n = left.get(line) ?? 0;
    if (n > 0) left.set(line, n - 1); else added.push(line);
  }
  const removed = [...left].flatMap(([line, n]) => Array(n).fill(line) as string[]);
  return [...removed.map(l => `- ${l}`), ...added.map(l => `+ ${l}`)].join('\n').slice(0, 60_000);
}

/** The app without the builder's "changed:" note (used when the note claims too much). */
export function withoutChangedNote(html: string): string {
  return html.replace(/^(<!doctype html>)\s*<!--\s*changed:[\s\S]*?-->/i, '$1');
}

const BLOCK = /<<<<<<< FIND\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n?>>>>>>> END/g;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The place to edit: an exact match, or one that only differs in whitespace; null unless unique. */
function locate(html: string, find: string): { start: number; end: number } | null {
  const exact = html.split(find).length - 1;
  if (exact === 1) { const start = html.indexOf(find); return { start, end: start + find.length }; }
  if (exact > 1 || !find.trim()) return null;
  const loose = new RegExp(find.trim().split(/\s+/).map(escapeRegExp).join('\\s+'), 'g');
  const matches = [...html.matchAll(loose)];
  if (matches.length !== 1) return null;
  return { start: matches[0].index!, end: matches[0].index! + matches[0][0].length };
}

/** Applies the builder's edits to the current app, or returns why it couldn't. */
export function applyEdits(current: string, reply: string): Edited | { error: string } {
  const blocks = [...reply.matchAll(BLOCK)];
  if (!blocks.length) return { error: 'no edit blocks' };
  let html = current;
  for (const [, find, replacement] of blocks) {
    const spot = locate(html, find);
    if (!spot) return { error: `an edit's FIND text wasn't found exactly once: ${JSON.stringify(find.slice(0, 80))}` };
    html = html.slice(0, spot.start) + replacement + html.slice(spot.end);
  }
  const changed = reply.match(/^\s*CHANGED:\s*(.+)$/m)?.[1].trim().slice(0, 200);
  if (changed) {
    const note = `<!-- changed: ${changed.replace(/--/g, '—')} -->`;
    html = /^<!doctype html>\s*<!--\s*changed:[\s\S]*?-->/i.test(html)
      ? html.replace(/^(<!doctype html>)\s*<!--\s*changed:[\s\S]*?-->/i, (_, doctype: string) => `${doctype}\n${note}`)
      : html.replace(/^<!doctype html>/i, doctype => `${doctype}\n${note}`);
  }
  return { html, changed, blocks: blocks.length };
}
