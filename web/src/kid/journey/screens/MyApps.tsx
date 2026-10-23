// prd.md > My Apps: this kid's shelf, newest first, with name, picture and Open. Apps live on the
// family's computer and open on this device, or on a device on the home Wi-Fi with this kid's pass.
import { useEffect, useState } from 'react';
import { appPlan, myApps, type ShelfApp } from '../lib/api';
import Md from '../components/Md';
import PlanCard from '../components/PlanCard';

const PLAN_NAMES = { scope: '💡 The idea', prd: '🎨 The design', spec: '🛠️ The tech plan' } as const;

/** "📄 How I planned it": the plans next to the app, nice to show or print (family trial). */
function HowIPlanned({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof appPlan>> | null | 'none'>(null);
  useEffect(() => { appPlan(slug).then(setPlan).catch(() => setPlan('none')); }, [slug]);
  return (
    <main className="bwm-print mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <button onClick={onClose} className="min-h-11 rounded-full border-2 border-line bg-surface px-4 font-bold text-ink hover:border-accent">← My apps</button>
        <button onClick={() => window.print()} className="min-h-11 rounded-full border-2 border-line bg-surface px-4 font-bold text-ink hover:border-accent">🖨️ Print</button>
      </div>
      {plan === null && <p className="text-muted">Loading…</p>}
      {plan === 'none' && <p className="text-muted">There's no plan to show for this app.</p>}
      {plan && plan !== 'none' && (
        <>
          <h1 className="text-3xl font-extrabold text-ink"><span aria-hidden>{plan.emoji}</span> How I planned {plan.name}</h1>
          <p className="text-lg text-muted">First the plan, then the app: these are the plans I approved before it was built.</p>
          {plan.docs.map(d => (
            <section key={d.kind} className="rounded-3xl border-2 border-line bg-surface p-5">
              <h2 className="mb-3 text-xl font-extrabold text-muted">{PLAN_NAMES[d.kind]}</h2>
              <PlanCard markdown={d.markdown} />
              <details className="mt-4 rounded-2xl border-2 border-line px-4 py-2">
                <summary className="cursor-pointer font-bold text-muted">Show the whole plan</summary>
                <div className="ppg-doc mt-2"><Md doc>{d.markdown}</Md></div>
              </details>
            </section>
          ))}
        </>
      )}
    </main>
  );
}

export default function MyApps({ name, onClose, onNewApp }: { name: string; onClose: () => void; onNewApp?: () => void }) {
  const [apps, setApps] = useState<ShelfApp[] | null>(null);
  const [planFor, setPlanFor] = useState<string | null>(null);
  useEffect(() => { myApps().then(setApps).catch(() => setApps([])); }, []);
  if (planFor) return <HowIPlanned slug={planFor} onClose={() => setPlanFor(null)} />;
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold text-ink">📚 {name}'s apps</h1>
        <button onClick={onClose} className="rounded-full border-2 border-line bg-surface px-4 py-1.5 font-bold text-ink hover:border-accent">← Back</button>
      </div>
      {apps === null && <p className="text-muted">Loading…</p>}
      {apps?.length === 0 && (
        <div className="rounded-3xl border-2 border-dashed border-line px-6 py-14 text-center">
          <div className="text-6xl" aria-hidden>🌱</div>
          <p className="mt-3 text-2xl font-extrabold text-ink">Your apps will live here!</p>
          <p className="mt-1 text-muted">Finish an app and ship it, and it shows up on this shelf.</p>
        </div>
      )}
      {!!apps?.length && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Learner request: start a new app from the shelf, as a card like the others. */}
          {onNewApp && (
            <li className="flex flex-col gap-3 rounded-3xl border-2 border-dashed border-accent bg-surface p-5">
              <div className="text-5xl" aria-hidden>✨</div>
              <div>
                <p className="text-xl font-extrabold text-ink">Start a new app</p>
                <p className="text-sm text-muted">Plan it, build it, ship it!</p>
              </div>
              <button onClick={onNewApp} className="mt-auto rounded-full bg-accent px-5 py-2 text-center font-extrabold text-white">＋ New app</button>
            </li>
          )}
          {apps.map(a => (
            <li key={a.slug} className="flex flex-col gap-3 rounded-3xl border-2 border-line bg-surface p-5">
              {a.iconUrl ? <img src={a.iconUrl} alt="" width={64} height={64} className="rounded-2xl" /> : <div className="text-5xl" aria-hidden>{a.emoji}</div>}
              <div>
                <p className="text-xl font-extrabold text-ink">{a.name}</p>
                <p className="text-sm text-muted">{new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
              <a href={a.path} target="_blank" rel="noopener noreferrer" className="mt-auto rounded-full bg-accent px-5 py-2 text-center font-extrabold text-white">Open ↗</a>
              {a.hasPlan && <button onClick={() => setPlanFor(a.slug)} className="min-h-11 rounded-full border-2 border-line bg-surface px-5 font-bold text-ink hover:border-accent">📄 How I planned it</button>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
