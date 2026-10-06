// prd.md > The Kid's Journey, Theme: the kid's only choice is the helper's style. The age group
// comes from the parent's family settings and sets the guide on the server. Ported from Build With Me.
// Picking a theme previews its colors.
import { useState } from 'react';
import { THEMES } from '../themes/themes';
import type { Profile as ProfileT, ThemeId } from '../types';

export interface ProfileChoice {
  theme: ThemeId;
  inputMode: ProfileT['inputMode'];
}

interface Props {
  inputMode: ProfileT['inputMode'];
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  onDone: (choice: ProfileChoice) => void;
  busy: boolean;
}

export default function ThemePick({ inputMode, theme, onThemeChange, onDone, busy }: Props) {
  const [picked, setPicked] = useState(false);
  const ready = picked && !busy;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 px-4 py-6">
      <section>
        {/* Learner testing (2026-10-05): a kid thought the theme was what his app had to be
            about ("space" meant coding about space). It's only this site's look. */}
        <h2 className="text-3xl font-extrabold text-ink">🎨 Pick your helper's style</h2>
        <p className="mb-4 mt-1 text-lg font-semibold text-muted">
          Just the colors and the helper's personality while we work together. <span className="text-ink">Your app can be about anything you want!</span>
        </p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {THEMES.map(t => {
            const selected = picked && theme === t.id;
            return (
              <button key={t.id} onClick={() => { onThemeChange(t.id); setPicked(true); }} aria-pressed={selected}
                className={`rounded-2xl border-2 px-1 py-3 text-center transition ${selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-accent'}`}>
                <span className="block text-4xl" aria-hidden>{t.emoji}</span>
                <span className="text-sm font-bold text-ink">{t.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col items-center gap-2">
        <button disabled={!ready} onClick={() => onDone({ theme, inputMode })}
          className="rounded-full bg-accent px-10 py-4 text-2xl font-extrabold text-white shadow-lg transition enabled:hover:scale-[1.03] disabled:opacity-40">
          {busy ? 'Getting ready…' : "Let's go! →"}
        </button>
        {!picked && !busy && <p className="text-sm font-semibold text-muted">Pick your helper's style</p>}
      </div>
    </main>
  );
}
