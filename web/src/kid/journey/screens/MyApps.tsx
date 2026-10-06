// prd.md > My Apps: this kid's shelf, newest first, with name, picture and Open. Apps live on the
// family's computer and open on this device, or on a device on the home Wi-Fi with this kid's pass.
import { useEffect, useState } from 'react';
import { myApps, type ShelfApp } from '../lib/api';

export default function MyApps({ name, onClose }: { name: string; onClose: () => void }) {
  const [apps, setApps] = useState<ShelfApp[] | null>(null);
  useEffect(() => { myApps().then(setApps).catch(() => setApps([])); }, []);
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
          {apps.map(a => (
            <li key={a.slug} className="flex flex-col gap-3 rounded-3xl border-2 border-line bg-surface p-5">
              <div className="text-5xl" aria-hidden>{a.emoji}</div>
              <div>
                <p className="text-xl font-extrabold text-ink">{a.name}</p>
                <p className="text-sm text-muted">{new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
              <a href={a.path} target="_blank" rel="noopener noreferrer" className="mt-auto rounded-full bg-accent px-5 py-2 text-center font-extrabold text-white">Open ↗</a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
