// prd.md > The Kid's Journey, Welcome: expectations up front, then talk or type. Ported from Build With Me.
const CHOICE = 'rounded-3xl border-2 border-line bg-surface px-6 py-8 text-2xl font-extrabold text-ink shadow-sm transition hover:scale-[1.02] hover:border-accent';

interface Props {
  name: string;
  onChoose: (mode: 'talk' | 'type') => void;
}

export default function Welcome({ name, onChoose }: Props) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-4 text-center">
      <div className="text-7xl" aria-hidden>👋</div>
      <div>
        <p className="text-lg font-extrabold uppercase tracking-widest text-accent">Build With Me</p>
        <h1 className="mt-2 text-4xl font-extrabold text-ink sm:text-5xl">Hi {name}! Let's make an app together!</h1>
        <p className="mt-2 text-lg font-bold text-muted">Design first, build together.</p>
      </div>
      <p className="rounded-2xl bg-accent-soft px-5 py-3 text-xl font-extrabold text-ink">🤖 Your helper is an AI, not a person.</p>
      <p className="max-w-xl text-lg text-muted">
        We plan your app together first,
        then build it. Projects are kept small: a few short sessions.
      </p>
      <div className="w-full">
        <p className="mb-4 text-xl font-bold text-ink">How do you want to answer?</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <button onClick={() => onChoose('talk')}
            className={CHOICE}>
            <span className="block text-5xl" aria-hidden>🎤</span>Talk
          </button>
          <button onClick={() => onChoose('type')}
            className={CHOICE}>
            <span className="block text-5xl" aria-hidden>⌨️</span>Type
          </button>
        </div>
        <p className="mt-3 text-sm text-muted">Pick whichever feels easier. You can switch any time.</p>
      </div>
    </main>
  );
}
