// The talk button (prd.md > Talking: kids' voices stay in the house). Build With Me listened
// with the browser's speech recognition, which sends audio to an outside service. Here the
// microphone is recorded on the device, sent only to the family's computer (/api/speech, on
// Moonshine, slice 2) and turned into text there. Same hook shape as before, so the ported
// AnswerBox works unchanged: it ends after a real pause, or when the kid taps "I'm done".
import { useCallback, useEffect, useRef, useState } from 'react';

interface Controller { done(): void; result: Promise<{ text: string }> }
interface Recorder {
  micSupported(): boolean;
  recordUtterance(opts: { pauseMs?: number; maxMs?: number; onLevel?: (l: number) => void; onState?: (s: string) => void }): Promise<Controller>;
}

// public/lib/recorder.js (shared with the talk test), loaded on first use.
let recorder: Promise<Recorder> | null = null;
const loadRecorder = () => (recorder ??= import(/* @vite-ignore */ `${location.origin}/lib/recorder.js`) as Promise<Recorder>);

/** Talking needs a secure page (this laptop, or a device set up for talking) and a microphone. */
export function speechSupported(): boolean {
  return !!(window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === 'function' && (window as any).AudioWorkletNode);
}

export type SpeechProblem = 'unsupported' | 'blocked' | 'no-speech' | null;

// How long a pause ends a spoken answer: longer for kids, who stop to think. (Build With Me's
// values, minus about a second: the recorder hears silence at once, not after a result lag.)
export function pauseFor(ageGroup: string | undefined): number {
  return ageGroup === 'kid' ? 4000 : ageGroup === 'teen' ? 3000 : 2500;
}

const MAX_LISTEN_MS = 90_000; // one answer never listens longer than this

/**
 * onFinal fires with the words once the speaker pauses for silenceMs, or when stop() is called
 * ("I'm done"). onText shows "…" while the computer turns the recording into text.
 */
export function useSpeech(onText: (text: string) => void, onFinal: (text: string) => void, silenceMs = 3000) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [level, setLevel] = useState(0);
  const [problem, setProblem] = useState<SpeechProblem>(speechSupported() ? null : 'unsupported');
  const current = useRef<{ ctl: Controller | null; cancelled: boolean } | null>(null);
  const handlers = useRef({ onText, onFinal });
  handlers.current = { onText, onFinal };

  const cancel = useCallback(() => {
    const c = current.current;
    current.current = null;
    if (c) { c.cancelled = true; c.ctl?.done(); }
    setListening(false); setTranscribing(false); setLevel(0);
  }, []);
  useEffect(() => cancel, [cancel]);

  // auto: started by the app after the guide spoke, so silence isn't reported as a problem.
  const start = useCallback(async (auto = false) => {
    cancel();
    if (!speechSupported()) { setProblem('unsupported'); return; }
    const me = { ctl: null as Controller | null, cancelled: false };
    current.current = me;
    setProblem(null); setListening(true);
    try {
      const rec = await loadRecorder();
      const ctl = await rec.recordUtterance({
        pauseMs: silenceMs, maxMs: MAX_LISTEN_MS,
        onLevel: (l) => { if (!me.cancelled) setLevel(l); },
        onState: (s) => { if (!me.cancelled && s === 'thinking') { setListening(false); setTranscribing(true); handlers.current.onText('…'); } },
      });
      me.ctl = ctl;
      if (me.cancelled) { ctl.done(); return; }
      const { text } = await ctl.result;
      if (me.cancelled) return;
      current.current = null;
      setListening(false); setTranscribing(false); setLevel(0);
      handlers.current.onText('');
      const said = (text ?? '').trim();
      if (said) handlers.current.onFinal(said);
      else if (!auto) setProblem('no-speech');
    } catch (err) {
      if (me.cancelled) return;
      current.current = null;
      setListening(false); setTranscribing(false); setLevel(0);
      handlers.current.onText('');
      const name = (err as { name?: string })?.name;
      setProblem(name === 'NotAllowedError' || name === 'NotFoundError' || name === 'SecurityError' ? 'blocked' : 'no-speech');
    }
  }, [silenceMs, cancel]);

  /** "I'm done": end the recording now and send what was said. */
  const stop = useCallback(() => { current.current?.ctl?.done(); }, []);

  return { listening, transcribing, level, problem, start, stop, cancel };
}
