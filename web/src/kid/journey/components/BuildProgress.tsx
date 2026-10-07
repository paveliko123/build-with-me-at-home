// The teaching progress view while the app builds (family trial; learner decision "B plus C"):
// what the builder is working on right now, in plain words, a bar for how much is written, and
// the kid's own plan steps ticking off as their code gets written. Kids get playful words; teens
// get the real names (CSS, JavaScript…) and the part being written.
import type { BuildProgressInfo, Milestone } from '../lib/api';

const KID: Record<Milestone, string> = {
  look: '🎨 Picking the colors and where everything goes.',
  drawing: '🖌️ Drawing your pictures out of shapes.',
  rules: '⚙️ Writing the rules of your app.',
  tap: '👆 Deciding what happens when you tap.',
  move: '🎬 Making things move.',
  sound: '🔊 Making sounds out of math!',
  memory: '💾 Teaching it to remember.',
};
const TEEN: Record<Milestone, string> = {
  look: '🎨 CSS: the colors, fonts and layout.',
  drawing: '🖌️ Drawing with SVG and canvas: pictures made of shapes and code.',
  rules: '⚙️ JavaScript: the rules and logic.',
  tap: '👆 Event listeners: what happens on a tap or a key.',
  move: '🎬 The animation loop (requestAnimationFrame).',
  sound: '🔊 The Web Audio API: sounds made from math, no sound files.',
  memory: '💾 localStorage: it remembers, on this device.',
};
const PHASE = {
  waiting: { kid: '⏳ Waiting for a turn: another app is being built.', teen: '⏳ In the queue: another build is running.' },
  reading: { kid: '📖 Reading your plan…', teen: '📖 Reading your plans (idea, design, tech)…' },
  checking: { kid: '📏 Checking it follows the rules…', teen: '📏 Checking the app against the rules…' },
  safety: { kid: '🛡️ A safety check of the words…', teen: '🛡️ A safety check of the app\'s words…' },
  verifying: { kid: '✅ Making sure your changes went in…', teen: '✅ Checking each change really made it in…' },
  done: { kid: '🎉 Done!', teen: '🎉 Done!' },
  failed: { kid: '🙈 Hmm, something went wrong.', teen: '🙈 Something went wrong.' },
} as const;

/** The one line for a build in progress (also used on the small badge for changes). */
export function progressLine(p: BuildProgressInfo | null, young: boolean, fallback: string): string {
  if (!p) return fallback;
  if (p.phase === 'writing') {
    const last = p.milestones.at(-1);
    if (p.mode !== 'full') return young ? '✏️ Writing your changes…' : '✏️ Writing the edits…';
    return last ? (young ? KID : TEEN)[last] : (young ? '✏️ Starting to write your app…' : '✏️ Writing the HTML…');
  }
  return PHASE[p.phase][young ? 'kid' : 'teen'];
}

export default function BuildProgress({ progress, young, fallback }: { progress: BuildProgressInfo | null; young: boolean; fallback: string }) {
  const p = progress;
  const writing = p?.phase === 'writing';
  const share = !p ? 3 : p.phase === 'done' ? 100 : p.phase === 'safety' || p.phase === 'verifying' ? 97 : p.phase === 'checking' ? 94
    : writing ? Math.min(92, Math.round(5 + (p.chars / p.expected) * 87)) : 4;
  const names = young ? KID : TEEN;
  return (
    <div className="w-full max-w-lg space-y-3 px-6" role="status" aria-live="polite">
      <p className={`font-extrabold text-ink ${young ? 'text-2xl' : 'text-xl'}`}>{progressLine(p, young, fallback)}</p>
      <div className="h-4 overflow-hidden rounded-full bg-accent-soft" aria-hidden>
        <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${share}%` }} />
      </div>
      {!young && writing && p?.part && <p className="font-mono text-sm text-muted">Now writing: {p.part}()</p>}
      {p && p.steps.length > 0 && (
        <section aria-label="Your plan, turning into code">
          <p className="font-bold text-muted">{young ? 'Your plan:' : 'Your plan, turning into code:'}</p>
          <ul className="mt-1 space-y-0.5">
            {p.steps.map(s => (
              <li key={s.step} className={`flex items-center gap-2 ${young ? 'text-lg' : ''} ${s.done ? 'font-bold text-ink' : 'text-muted'}`}>
                <span aria-hidden className="inline-block w-6 text-center">{s.done ? '✅' : '⬜'}</span>{s.step}
                <span className="sr-only">{s.done ? '(done)' : '(not yet)'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* Learner: one list only. A second "done so far" list ticked general parts (the colors)
          while the matching plan step stayed empty, which read as a contradiction. Without
          plan steps (an older plan) the parts done so far are the list. */}
      {p && !p.steps.length && p.milestones.length > 1 && (
        <ul className="space-y-0.5 text-muted" aria-label="Done so far">
          {p.milestones.slice(0, -1).map(m => <li key={m}>✓ {names[m].replace(/^\S+\s/, '')}</li>)}
        </ul>
      )}
    </div>
  );
}
