// Themed "thinking" state shown during every guide reply (checkpoint feedback: no input
// box while the guide is replying).
import { themeById } from '../themes/themes';
import type { ThemeId } from '../types';

export default function Thinking({ theme, big = false }: { theme: ThemeId; big?: boolean }) {
  const t = themeById(theme);
  return (
    <div className={`flex items-center gap-4 ${big ? 'flex-col py-10 text-center' : 'py-2'}`} role="status" aria-live="polite">
      <span className={`inline-block ppg-${t.animation === 'orbit' || t.animation === 'drive' ? 'bounce' : t.animation} ${big ? 'text-7xl' : 'text-4xl'}`} aria-hidden>{t.emoji}</span>
      <span className={`font-bold text-muted ${big ? 'text-2xl' : 'text-lg'}`}>{t.thinking}</span>
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map(delay => (
          <span key={delay} className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
    </div>
  );
}
