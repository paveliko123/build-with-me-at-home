// spec.md > Doc Review: the stage's plan as a short card the teen approves (family trial: a whole
// document with a Markdown download was too much, and nothing said "read it and tell me").
// The app gives the direction itself: "Your plan is ready" with 👍 / ✏️. The full plan folds
// underneath. Approving can also be said or typed ("looks good"), as in the skills.
import Md from './Md';
import PlanCard from './PlanCard';
import type { StageDoc } from '../types';

const NAMES: Record<StageDoc['kind'], string> = {
  'learner-profile': 'About you',
  scope: 'Idea plan',
  prd: 'Design plan',
  spec: 'Tech plan',
  checklist: 'Build checklist',
  'app-map': 'App map',
};

interface Props {
  doc: StageDoc;
  className?: string;
  /** Draft actions: 👍 sends an approval, ✏️ asks what to change (focuses the answer box). */
  onApprove?: () => void;
  onChange?: () => void;
  busy?: boolean;
}

export default function DocReview({ doc, className = '', onApprove, onChange, busy = false }: Props) {
  const draft = doc.status === 'draft';
  return (
    <section id="bwm-plan" className={`flex min-h-0 flex-col rounded-3xl border-2 ${draft ? 'border-accent' : 'border-line'} bg-surface ${className}`} aria-label={NAMES[doc.kind]}>
      <header className={`flex flex-wrap items-center gap-3 border-b-2 border-line px-5 py-3 ${draft ? 'bg-accent-soft' : ''}`}>
        <span className="text-xl" aria-hidden>📋</span>
        <h3 className="font-extrabold text-ink">{draft ? `Your ${NAMES[doc.kind]} is ready: have a look. Happy with it?` : NAMES[doc.kind]}</h3>
        {!draft && <span className="rounded-full bg-accent px-3 py-0.5 text-sm font-bold text-white">✓ Approved</span>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-ink">
        {doc.kind === 'learner-profile' ? (
          // "About you" is short and isn't a plan: shown whole, in one layer, under the card's own title.
          <div className="ppg-doc"><Md doc>{doc.markdown.replace(/^\s*#\s+[^\n]*\n/, '')}</Md></div>
        ) : (
          <>
            <PlanCard markdown={doc.markdown} />
            <details className="mt-4 rounded-2xl border-2 border-line px-4 py-2">
              <summary className="cursor-pointer font-bold text-muted">Show the whole plan</summary>
              <div className="ppg-doc mt-2"><Md doc>{doc.markdown}</Md></div>
            </details>
          </>
        )}
      </div>
      {draft && onApprove && (
        <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 rounded-b-3xl border-t-2 border-line bg-surface px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <button onClick={onApprove} disabled={busy} className="min-h-11 flex-1 rounded-full bg-accent px-5 font-extrabold text-white disabled:opacity-40">👍 Looks good</button>
          <button onClick={onChange} disabled={busy} className="min-h-11 flex-1 rounded-full border-2 border-line bg-surface px-5 font-bold text-ink hover:border-accent disabled:opacity-40">✏️ Change something</button>
        </div>
      )}
    </section>
  );
}
