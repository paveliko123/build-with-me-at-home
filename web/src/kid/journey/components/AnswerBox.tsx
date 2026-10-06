// The answer input used on the guide and Build screens: a big talk button (when talking
// is chosen and available) plus a text box that grows with the answer. Enter sends,
// Shift+Enter starts a new line. Speech fills the box live and sends itself after a real
// pause or when the person taps "I'm done"; the sent text then shows as a chat bubble.
// Hands-free: each time listenToken changes (the guide finished speaking), it listens.
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useSpeech } from '../lib/speech';
// Ported from Build With Me. Talking now records on the device and the family's computer turns
// it into text (lib/speech.ts); everything else is unchanged.
import { stopSpeaking } from '../lib/voice';

interface Props {
  inputMode: 'talk' | 'type';
  placeholder: string;
  disabled?: boolean;
  onSend: (text: string) => void;
  compact?: boolean;
  onType?: () => void; // the person started typing an answer
  listenToken?: number; // changes when the app should start listening by itself
  silenceMs?: number; // how long a pause ends a spoken answer
  handsFree?: boolean; // voice on: turning it off also stops listening
}

const PROBLEM_TEXT = {
  unsupported: "Talking isn't set up on this device yet (ask your parent). You can type, or use your keyboard's 🎤 button!",
  blocked: "I can't hear you (the microphone is blocked), so let's type for now! Your keyboard's 🎤 button works too.",
  'no-speech': "I didn't hear anything. Tap the mic and try again!",
};

const MAX_HEIGHT = 200;

export default function AnswerBox({ inputMode, placeholder, disabled = false, onSend, compact = false, onType, listenToken = 0, silenceMs = 2500, handsFree = true }: Props) {
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeech(setText, said => { onSend(said); setText(''); }, silenceMs);
  const talk = inputMode === 'talk' && speech.problem !== 'unsupported' && speech.problem !== 'blocked';
  const { start, cancel } = speech;

  // Hands-free turn-taking: listen when asked to (never while the box is disabled).
  useEffect(() => {
    if (listenToken > 0 && talk && !disabled) start(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenToken]);
  useEffect(() => { if (disabled) cancel(); }, [disabled, cancel]);
  useEffect(() => { if (!handsFree) cancel(); }, [handsFree, cancel]);

  function toggleMic() {
    if (speech.listening) { speech.stop(); return; }
    stopSpeaking(); // the person wants to talk now: the guide stops
    start();
  }

  // Grow with the text, up to a few lines, then scroll inside.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, [text]);

  function send() {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    send();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {talk && !compact && (
        <button type="button" disabled={disabled || speech.transcribing} onClick={toggleMic}
          aria-pressed={speech.listening}
          className={`flex items-center justify-center gap-3 rounded-full px-6 py-4 text-2xl font-extrabold text-white shadow-lg transition disabled:opacity-40 ${speech.listening ? 'bg-red-500' : 'bg-accent hover:scale-[1.02]'}`}
          style={speech.listening ? { boxShadow: `0 0 0 ${Math.round(4 + speech.level * 18)}px rgba(239,68,68,.25)` } : undefined}>
          <span aria-hidden>{speech.listening ? '✋' : speech.transcribing ? '✍️' : '🎤'}</span>{speech.listening ? "Listening… tap when you're done" : speech.transcribing ? 'Writing down your words…' : 'Tap and talk'}
        </button>
      )}
      <form onSubmit={submit} className="flex items-end gap-2">
        {talk && compact && (
          <button type="button" disabled={disabled || speech.transcribing} onClick={toggleMic} aria-label={speech.listening ? "I'm done" : 'Talk'}
            className={`h-12 shrink-0 rounded-full px-4 text-xl text-white disabled:opacity-40 ${speech.listening ? 'animate-pulse bg-red-500' : 'bg-accent'}`}>{speech.listening ? '✋' : '🎤'}</button>
        )}
        <label className="sr-only" htmlFor={compact ? 'change' : 'answer'}>Your answer</label>
        <textarea ref={box} id={compact ? 'change' : 'answer'} rows={1} value={text} onChange={e => { if (!text && e.target.value) onType?.(); setText(e.target.value); }} onKeyDown={onKeyDown}
          disabled={disabled} autoFocus={!talk} placeholder={speech.listening ? 'Listening…' : placeholder}
          className={`min-w-0 flex-1 resize-none rounded-3xl border-2 border-line bg-surface leading-snug text-ink outline-none focus:border-accent ${compact ? 'px-4 py-3' : 'px-5 py-3.5 text-lg'}`} />
        <button type="submit" disabled={disabled || !text.trim()}
          className={`shrink-0 rounded-full bg-accent font-extrabold text-white disabled:opacity-40 ${compact ? 'h-12 px-5' : 'h-14 px-6 text-lg'}`}>Send</button>
      </form>
      {inputMode === 'talk' && speech.problem && (
        <p className="text-sm font-semibold text-muted" role="status">{PROBLEM_TEXT[speech.problem]}</p>
      )}
    </div>
  );
}
