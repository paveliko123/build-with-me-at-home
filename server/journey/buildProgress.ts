// The teaching progress view while an app builds (family trial: "Building…" for minutes; learner
// decision "B plus C"). The builder's text streams in as Opus writes it (same call, no extra
// cost); this watches it and turns it into milestones a kid understands: the look, the drawings,
// the rules, taps, movement, sound, remembering. It also ticks off the kid's own build steps from
// the Tech plan when the code for that part is written (a function named for it, such as
// drawBasket for "the basket"; live test: plain mentions came far too early, in the styles). The code itself is never sent to the
// screen (it hasn't been checked yet): only milestone names, a size, and, for teens, the name of
// the part being written when it's a plain word.

export type Milestone = 'look' | 'drawing' | 'rules' | 'tap' | 'move' | 'sound' | 'memory';
export const MILESTONES: Milestone[] = ['look', 'drawing', 'rules', 'tap', 'move', 'sound', 'memory'];
export type Phase = 'waiting' | 'reading' | 'writing' | 'checking' | 'safety' | 'verifying' | 'done' | 'failed';
export interface BuildStep { step: string; word: string; kind: Milestone }

export interface Progress {
  mode: 'full' | 'edit' | 'repair';
  phase: Phase;
  chars: number;
  expected: number;
  milestones: Milestone[]; // in the order they appeared
  part: string | null; // the function being written (a plain word), for teens
  steps: { step: string; kind: Milestone; done: boolean }[];
  startedAt: number;
  updatedAt: number;
}

const SEEN: Record<Milestone, RegExp> = {
  look: /<style\b/i,
  drawing: /<svg\b(?![^>]*\bbwm-icon\b)|<canvas\b|getContext\(\s*['"]2d/i,
  rules: /<script\b/i,
  tap: /addEventListener\(\s*['"](click|pointerdown|pointerup|touchstart|keydown|keyup)|\bonclick\s*=/i,
  move: /requestAnimationFrame/,
  sound: /AudioContext|createOscillator/,
  memory: /localStorage/,
};
const PART = /function\s+([A-Za-z][A-Za-z0-9]{2,23})\s*\(|(?:const|let)\s+([A-Za-z][A-Za-z0-9]{2,23})\s*=\s*(?:async\s*)?(?:\([^)]{0,60}\)|[A-Za-z]\w*)\s*=>/g;
const NOT_SHOWN = /kill|dead|die|blood|gun|shoot|bomb|hate|stupid|dumb|sex|drug/i;

interface Tracker extends Progress { text: string; words: string[] }
const trackers = new Map<string, Tracker>();

export function startProgress(projectId: string, mode: Progress['mode'], expected: number, steps: BuildStep[] = [], waiting = false): void {
  const now = Date.now();
  trackers.set(projectId, {
    mode, phase: waiting ? 'waiting' : 'reading', chars: 0, expected: Math.max(2000, expected), milestones: [], part: null,
    steps: steps.map((s) => ({ step: s.step, kind: s.kind, done: false })),
    words: steps.map((s) => s.word.toLowerCase().replace(/[^a-z0-9]/g, '')),
    startedAt: now, updatedAt: now, text: '',
  });
}

export function setPhase(projectId: string, phase: Phase): void {
  const t = trackers.get(projectId);
  if (!t) return;
  t.phase = phase;
  t.updatedAt = Date.now();
  // All the code is written once it's being checked: every plan step is ticked (learner: an
  // unticked step next to a finished build read as missing).
  if (phase === 'checking' || phase === 'safety' || phase === 'verifying' || phase === 'done') for (const s of t.steps) s.done = true;
  if (phase === 'done' || phase === 'failed') setTimeout(() => { if (trackers.get(projectId) === t) trackers.delete(projectId); }, 60_000).unref();
}

/** A new chunk of the builder's text. A second writing round (a fix-up) starts the count again. */
export function onText(projectId: string, chunk: string): void {
  const t = trackers.get(projectId);
  if (!t || !chunk) return;
  if (t.phase !== 'writing') { t.phase = 'writing'; t.text = ''; t.chars = 0; }
  const from = Math.max(0, t.text.length - 200);
  t.text += chunk;
  t.chars = t.text.length;
  t.updatedAt = Date.now();
  const recent = t.text.slice(from);
  for (const m of MILESTONES) if (!t.milestones.includes(m) && SEEN[m].test(t.text.slice(Math.max(0, from - 200)))) t.milestones.push(m);
  // A "look" step has no function to watch for: it ticks when the styles are finished.
  if (/<\/style>/i.test(t.text.slice(Math.max(0, from - 200)))) t.steps.forEach((s) => { if (s.kind === 'look') s.done = true; });
  for (const match of recent.matchAll(PART)) {
    const name = match[1] ?? match[2];
    if (!name) continue;
    if (!NOT_SHOWN.test(name)) t.part = name;
    const lower = name.toLowerCase();
    t.steps.forEach((s, i) => { if (!s.done && t.words[i].length >= 2 && lower.includes(t.words[i])) s.done = true; });
  }
}

export function getProgress(projectId: string): Progress | null {
  const t = trackers.get(projectId);
  if (!t) return null;
  const { text: _text, words: _words, ...shown } = t;
  return { ...shown, steps: shown.steps.map((s) => ({ ...s })), milestones: [...shown.milestones] };
}

/** Test hook. */
export function resetProgressForTests(): void { trackers.clear(); }
