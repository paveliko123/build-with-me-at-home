// spec.md > Doc Review: the stage's document as formatted Markdown with a download
// button. Approving happens in the conversation ("looks good"), as in the skills.
import Md from './Md';
import type { StageDoc } from '../types';

const NAMES: Record<StageDoc['kind'], string> = {
  'learner-profile': 'About you',
  scope: 'Idea (scope)',
  prd: 'Design (PRD)',
  spec: 'Tech plan (spec)',
  checklist: 'Build checklist',
  'app-map': 'App map',
};

export default function DocReview({ doc, className = '' }: { doc: StageDoc; className?: string }) {
  function download() {
    const blob = new Blob([doc.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.kind}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={`flex min-h-0 flex-col rounded-3xl border-2 border-line bg-surface ${className}`} aria-label={`${NAMES[doc.kind]} document`}>
      <header className="flex flex-wrap items-center gap-3 border-b-2 border-line px-5 py-3">
        <span className="text-xl" aria-hidden>📄</span>
        <h3 className="font-extrabold text-ink">{NAMES[doc.kind]}</h3>
        <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${doc.status === 'approved' ? 'bg-accent text-white' : 'bg-accent-soft text-ink'}`}>
          {doc.status === 'approved' ? 'Approved' : 'Draft for your review'}
        </span>
        <button onClick={download} className="ml-auto rounded-full border-2 border-line px-4 py-1 text-sm font-bold text-ink hover:border-accent">Download .md</button>
      </header>
      <div className="ppg-doc min-h-0 flex-1 overflow-y-auto px-6 py-4 text-ink">
        <Md doc>{doc.markdown}</Md>
      </div>
      {doc.status === 'draft' && (
        <p className="border-t-2 border-line px-5 py-3 text-sm font-semibold text-muted">Read it through. Say "looks good" to approve, or tell the guide what to change.</p>
      )}
    </section>
  );
}
