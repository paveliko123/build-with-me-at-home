// spec.md > Look and Feel: each theme's waiting animation, used while the app builds.
import { themeById } from '../themes/themes';
import type { ThemeId } from '../types';

// compact: just the animation, smaller, for the build pane next to the progress view (the
// progress line is the label there; learner: the build view must fit without scrolling).
export default function WaitingAnimation({ theme, label, compact = false }: { theme: ThemeId; label?: string; compact?: boolean }) {
  const t = themeById(theme);
  if (compact) {
    return (
      <div className="relative flex h-32 w-52 shrink-0 items-center justify-center overflow-hidden" aria-hidden>
        {t.motifs.map((m, i) => (
          <span key={m} className="ppg-float absolute text-2xl"
            style={{ left: `${8 + i * 24}%`, top: i % 2 ? '6%' : '68%', animationDelay: `${i * 0.4}s` }}>{m}</span>
        ))}
        {t.animation === 'orbit'
          ? <><span className="text-5xl">{t.motifs[0]}</span><span className="ppg-orbit absolute text-4xl">{t.emoji}</span></>
          : <span className={`ppg-${t.animation} text-6xl`}>{t.emoji}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-6 text-center" role="status" aria-live="polite">
      <div className="relative flex h-44 w-72 items-center justify-center overflow-hidden" aria-hidden>
        {t.motifs.map((m, i) => (
          <span key={m} className="ppg-float absolute text-3xl"
            style={{ left: `${10 + i * 24}%`, top: i % 2 ? '8%' : '70%', animationDelay: `${i * 0.4}s` }}>{m}</span>
        ))}
        {t.animation === 'orbit' ? (
          <>
            <span className="text-6xl">{t.motifs[0]}</span>
            <span className="ppg-orbit absolute text-5xl">{t.emoji}</span>
          </>
        ) : (
          <span className={`ppg-${t.animation} text-7xl`}>{t.emoji}</span>
        )}
      </div>
      <p className="text-2xl font-extrabold text-ink">{label ?? t.building}</p>
    </div>
  );
}
