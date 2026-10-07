// spec.md > Stage Flow: six numbered steps that match the six skills (1-start … 6-ship).
// Experienced teens and adults also see each step's document name. Family trial: the Intro pill
// is gone (it read as a step of its own next to "1 Start"), finished steps show a ✓, and the bar
// is a stepper in its own header band, so it can't be mistaken for the chat.
import { useEffect, useRef } from 'react';
import type { Stage } from '../types';

type Step = Stage | 'intro';

const STEPS: { stage: Stage; label: string; emoji: string; skill?: string }[] = [
  { stage: 'start', label: 'Start', emoji: '👋' },
  { stage: 'idea', label: 'Idea', emoji: '💡', skill: 'scope' },
  { stage: 'design', label: 'Design', emoji: '🎨', skill: 'PRD' },
  { stage: 'tech', label: 'Tech plan', emoji: '🛠️', skill: 'spec' },
  { stage: 'build', label: 'Build', emoji: '🏗️' },
  { stage: 'ship', label: 'Ship', emoji: '🎉' },
];

// UI review K5: on phones the whole bar didn't fit and the current step scrolled out of view.
// Phones get one line ("Step 2 of 6 · 💡 Idea"); wider screens the bar, with the current step
// kept in view. Before Start (choosing a look), no step is current yet.
export default function ProgressBar({ stage, showSkills = false }: { stage: Step; showSkills?: boolean }) {
  const current = STEPS.findIndex(s => s.stage === stage);
  const here = useRef<HTMLLIElement>(null);
  useEffect(() => { here.current?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [current]);
  const step = STEPS[current];
  return (
    <>
    <p className="truncate px-3 py-2 text-sm font-bold text-ink sm:hidden" aria-label="Progress">
      {step ? <>Step {current + 1} of {STEPS.length} · <span aria-hidden>{step.emoji}</span> {step.label}</> : <>✨ Getting ready</>}
    </p>
    <ol className="hidden items-center overflow-x-auto px-2 py-2 sm:flex sm:justify-center" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.stage} ref={i === current ? here : undefined} aria-current={i === current ? 'step' : undefined} className="flex shrink-0 items-center">
          {i > 0 && <span aria-hidden className={`mx-1 h-0.5 w-4 rounded lg:w-6 ${i <= current ? 'bg-accent' : 'bg-line'}`} />}
          <span className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm font-bold ${i === current ? 'bg-accent text-white shadow' : i < current ? 'text-ink' : 'text-muted'}`}>
            <span aria-hidden className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${i === current ? 'bg-white/25' : i < current ? 'bg-accent text-white' : 'border-2 border-line'}`}>
              {i < current ? '✓' : i + 1}
            </span>
            <span aria-hidden>{s.emoji}</span>{s.label}
            {i < current && <span className="sr-only">(done)</span>}
            {showSkills && s.skill && <span className="text-xs font-semibold opacity-70">· {s.skill}</span>}
          </span>
        </li>
      ))}
    </ol>
    </>
  );
}
