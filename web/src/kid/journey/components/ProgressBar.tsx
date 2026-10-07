// spec.md > Stage Flow: Intro, then six numbered steps that match the six skills
// (1-start … 6-ship). Experienced teens and adults also see each step's document name.
import { useEffect, useRef } from 'react';
import type { Stage } from '../types';

type Step = Stage | 'intro';

const STEPS: { stage: Step; label: string; emoji: string; skill?: string }[] = [
  { stage: 'intro', label: 'Intro', emoji: '✨' },
  { stage: 'start', label: 'Start', emoji: '👋' },
  { stage: 'idea', label: 'Idea', emoji: '💡', skill: 'scope' },
  { stage: 'design', label: 'Design', emoji: '🎨', skill: 'PRD' },
  { stage: 'tech', label: 'Tech plan', emoji: '🛠️', skill: 'spec' },
  { stage: 'build', label: 'Build', emoji: '🏗️' },
  { stage: 'ship', label: 'Ship', emoji: '🎉' },
];

// UI review K5: on phones the whole bar didn't fit and the current step scrolled out of view.
// Phones get one line ("Step 2 of 6 · 💡 Idea"); wider screens the bar, with the current step
// kept in view.
export default function ProgressBar({ stage, showSkills = false }: { stage: Step; showSkills?: boolean }) {
  const current = STEPS.findIndex(s => s.stage === stage);
  const here = useRef<HTMLLIElement>(null);
  useEffect(() => { here.current?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [current]);
  const step = STEPS[Math.max(0, current)];
  return (
    <>
    <p className="truncate px-3 py-2 text-sm font-bold text-ink sm:hidden" aria-label="Progress">
      {current > 0 ? `Step ${current} of ${STEPS.length - 1} · ` : ''}<span aria-hidden>{step.emoji}</span> {step.label}
    </p>
    <ol className="hidden items-center gap-1 overflow-x-auto px-4 py-3 sm:flex sm:justify-center" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.stage} ref={i === current ? here : undefined} aria-current={i === current ? 'step' : undefined}
          className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${i === current ? 'bg-accent text-white' : i < current ? 'bg-accent-soft text-ink' : 'text-muted'}`}>
          {i > 0 && <span className="opacity-70">{i}</span>}
          <span aria-hidden>{s.emoji}</span>{s.label}
          {showSkills && s.skill && <span className="text-xs font-semibold opacity-70">· {s.skill}</span>}
        </li>
      ))}
    </ol>
    </>
  );
}
