// A plan's key decisions at a glance (lib/planSummary.ts): used for the teen's review and on
// "How I planned it" in My apps.
import { summarizePlan } from '../lib/planSummary';

export default function PlanCard({ markdown }: { markdown: string }) {
  const { title, summary, points } = summarizePlan(markdown);
  return (
    <div className="space-y-3">
      {title && <h4 className="text-2xl font-extrabold leading-tight text-ink">🎯 {title}</h4>}
      {summary && <p className="text-lg font-semibold text-ink">{summary}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {points.map(p => (
          <li key={p.label} className="rounded-2xl bg-surface-2 px-4 py-3">
            <p className="font-extrabold text-ink"><span aria-hidden>{p.icon}</span> {p.label}</p>
            <ul className="mt-1 space-y-0.5 text-ink">
              {p.lines.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
