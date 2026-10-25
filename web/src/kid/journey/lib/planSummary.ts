// The short plan card a teen approves (family trial: a whole document to read, with a Markdown
// download, was too much). Built from the plan's own sections, so it never says anything the
// plan doesn't: the title and its one-line summary, then up to 5 sections with an icon each,
// in a fixed order of what matters most to a teen deciding "is this my app?".

export interface PlanPoint { icon: string; label: string; lines: string[] }
export interface PlanSummary { title: string; summary: string; points: PlanPoint[] }

const SECTIONS: { match: RegExp; icon: string }[] = [
  { match: /special|unique|kernel/i, icon: '✨' },
  { match: /who .*for|for whom|^who/i, icon: '👤' },
  { match: /how it works|core loop|what it does|steps|journey/i, icon: '⭐' },
  { match: /what you see|screens?|layout/i, icon: '📱' },
  { match: /look|style|feel|colou?rs?/i, icon: '🎨' },
  { match: /know it works|working looks like|done/i, icon: '✅' },
  { match: /pieces|parts|chose|choices|decisions/i, icon: '🧩' },
  { match: /leaving out|later|cut|not now/i, icon: '⏸️' },
];
const MAX_POINTS = 5;
const MAX_LINES = 3;
const MAX_CHARS = 240;

/** A long line keeps its whole sentences (a teen's test: a cut at 140 characters stopped
 *  mid-sentence); only a single sentence longer than the limit ends at a word with "…". */
function shorten(line: string): string {
  if (line.length <= MAX_CHARS) return line;
  const sentences = line.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [];
  let kept = '';
  for (const s of sentences) { if ((kept + s).trim().length > MAX_CHARS) break; kept += s; }
  if (kept.trim()) return kept.trim();
  return `${line.slice(0, MAX_CHARS).replace(/\s+\S*$/, '')}…`;
}

/** Plain text of one Markdown line (no bullets, numbers, bold or links). */
function plain(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/[*_`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim();
}

export function summarizePlan(markdown: string): PlanSummary {
  const lines = markdown.split(/\r?\n/);
  let title = '', summary = '';
  const sections: { heading: string; body: string[] }[] = [];
  let cur: { heading: string; body: string[] } | null = null;
  for (const raw of lines) {
    const h1 = raw.match(/^#\s+(.+)/), h2 = raw.match(/^#{2,3}\s+(.+)/);
    if (h1 && !title) { title = plain(h1[1]); continue; }
    if (h2) { cur = { heading: plain(h2[1]), body: [] }; sections.push(cur); continue; }
    const text = plain(raw);
    if (!text || /^[-=|: ]+$/.test(text)) continue;
    if (!cur) { if (!summary) summary = text; continue; }
    cur.body.push(text);
  }
  const points: PlanPoint[] = [];
  for (const { match, icon } of SECTIONS) {
    if (points.length >= MAX_POINTS) break;
    const s = sections.find(x => match.test(x.heading) && !points.some(p => p.label === x.heading));
    if (!s || !s.body.length) continue;
    // "not discussed" lines tell a teen nothing.
    const body = s.body.filter(l => !/not discussed|not decided/i.test(l));
    if (!body.length) continue;
    points.push({ icon, label: s.heading, lines: body.slice(0, MAX_LINES).map(shorten) });
  }
  return { title: title.replace(/:\s*the (design|tech) plan$/i, ''), summary, points };
}
