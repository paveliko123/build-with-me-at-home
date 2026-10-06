// spec.md > Look and Feel: each theme's waiting animation, used while the app builds.
import { themeById } from '../themes/themes';
import type { ThemeId } from '../types';

export default function WaitingAnimation({ theme, label }: { theme: ThemeId; label?: string }) {
  const t = themeById(theme);
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
