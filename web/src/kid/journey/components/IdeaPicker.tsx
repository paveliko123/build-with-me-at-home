// "💡 Show me ideas" (family trial): three ideas from the idea library as big picture cards, plus
// "✨ Something else" (back to their own idea) and "🔀 More ideas". Instant: no Claude call.
import type { IdeaCard } from '../lib/api';

interface Props {
  ideas: IdeaCard[] | null; // null while loading
  young: boolean;
  onPick: (idea: IdeaCard) => void;
  onMore: () => void;
  onOwn: () => void;
}

export default function IdeaPicker({ ideas, young, onPick, onMore, onOwn }: Props) {
  return (
    <section aria-label="Ideas to start from" className="rounded-3xl border-2 border-accent bg-surface p-4">
      <p className={`font-extrabold text-ink ${young ? 'text-2xl' : 'text-xl'}`}>💡 Here are some ideas. Pick one to make it yours!</p>
      {!ideas && <p className="mt-2 text-muted">Finding ideas…</p>}
      {ideas && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ideas.map(i => (
            <button key={i.id} onClick={() => onPick(i)}
              className="flex min-h-11 items-start gap-3 rounded-2xl border-2 border-line bg-surface-2 p-4 text-left text-ink hover:border-accent">
              <span className={young ? 'text-5xl' : 'text-4xl'} aria-hidden>{i.emoji}</span>
              <span>
                <span className={`block font-extrabold ${young ? 'text-xl' : 'text-lg'}`}>{i.title}</span>
                <span className="block text-muted">{i.pitch}</span>
              </span>
            </button>
          ))}
          <button onClick={onOwn}
            className="flex min-h-11 items-center gap-3 rounded-2xl border-2 border-dashed border-accent bg-surface p-4 text-left text-ink hover:bg-accent-soft">
            <span className={young ? 'text-5xl' : 'text-4xl'} aria-hidden>✨</span>
            <span className={`font-extrabold ${young ? 'text-xl' : 'text-lg'}`}>Something else: my own idea!</span>
          </button>
        </div>
      )}
      {ideas && <button onClick={onMore} className="mt-3 min-h-11 rounded-full border-2 border-line bg-surface px-5 font-bold text-ink hover:border-accent">🔀 More ideas</button>}
    </section>
  );
}
