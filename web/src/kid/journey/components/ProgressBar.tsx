// spec.md > Stage Flow: Intro, then six numbered steps that match the six skills
// (1-start … 6-ship). Experienced teens and adults also see each step's document name.
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

export default function ProgressBar({ stage, showSkills = false }: { stage: Step; showSkills?: boolean }) {
  const current = STEPS.findIndex(s => s.stage === stage);
  return (
    <ol className="flex items-center gap-1 overflow-x-auto px-4 py-3 sm:justify-center" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.stage} aria-current={i === current ? 'step' : undefined}
          className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${i === current ? 'bg-accent text-white' : i < current ? 'bg-accent-soft text-ink' : 'text-muted'}`}>
          {i > 0 && <span className="opacity-70">{i}</span>}
          <span aria-hidden>{s.emoji}</span>{s.label}
          {showSkills && s.skill && <span className="text-xs font-semibold opacity-70">· {s.skill}</span>}
        </li>
      ))}
    </ol>
  );
}
