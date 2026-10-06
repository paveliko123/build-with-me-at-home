// A question in the app's own style, instead of the browser's confirm() popup (family trial:
// "New app" showed a grey Chrome box). Esc or tapping outside picks the safe answer.
import { useEffect, useRef } from 'react';

interface Props {
  title: string;
  text: string;
  yes: string;
  no: string;
  onYes: () => void;
  onNo: () => void;
}

export default function KidDialog({ title, text, yes, no, onYes, onNo }: Props) {
  const safe = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    safe.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onNo(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onNo]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onNo(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="kid-dialog-title" aria-describedby="kid-dialog-text"
        className="w-full max-w-md rounded-3xl border-2 border-line bg-surface p-6 text-ink shadow-xl">
        <h2 id="kid-dialog-title" className="text-2xl font-extrabold">{title}</h2>
        <p id="kid-dialog-text" className="mt-2 text-lg">{text}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button ref={safe} onClick={onNo} className="min-h-11 flex-1 rounded-full border-2 border-line bg-surface px-5 font-bold text-ink hover:border-accent">{no}</button>
          <button onClick={onYes} className="min-h-11 flex-1 rounded-full bg-accent px-5 font-extrabold text-white">{yes}</button>
        </div>
      </div>
    </div>
  );
}
