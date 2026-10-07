// spec.md > Guide Stage Screen. Left: the conversation, with earlier questions and every
// answer (card picks too) as chat bubbles, then the current question on a big card, the
// answer cards when the dial allows, and the answer box. Right: the picture of the idea
// and, from slider 2 up, the stage's document. The last picture and document stay on
// screen until a newer one replaces them.
import { useEffect, useRef, useState } from 'react';
import AnswerBox from '../components/AnswerBox';
import DocReview from '../components/DocReview';
import Md from '../components/Md';
import Thinking from '../components/Thinking';
import VisualPane from '../components/VisualPane';
import { replySpeech, speak, stopSpeaking } from '../lib/voice';
import { pauseFor } from '../lib/speech';
import type { DocKind, GuideReply, IdeasMode, Profile, StageDoc } from '../types';
import { keepNewestInView } from '../lib/scroll';
import IdeaPicker from '../components/IdeaPicker';
import { getIdeas, type IdeaCard } from '../lib/api';

// "💡 Show me ideas": a stuck answer opens the ideas at once; quiet this long makes the button glow.
const STUCK = /^\s*(i\s*(do\s*n[o'’]?t|dont|dunno)(\s*know)?|idk|dunno|no\s*idea|not\s*sure|nothing|help|hmm+|um+|uh+|\?+|you\s*(choose|pick)|anything|i\s*(do\s*n[o'’]?t|dont)\s*have\s*(an?\s*)?ideas?)\s*[.!?…]*\s*$/i;
const QUIET_MS = 20_000;

export type Pane = 'picture' | DocKind;
const DOC_ORDER: DocKind[] = ['learner-profile', 'scope', 'prd', 'spec', 'checklist'];
const DOC_CHIPS: Partial<Record<DocKind, string>> = { 'learner-profile': 'About you', scope: 'Idea', prd: 'Design', spec: 'Tech plan', checklist: 'Checklist' };

export interface Line {
  from: 'guide' | 'me' | 'stage';
  text: string;
}

interface Props {
  profile: Profile;
  reply: GuideReply | null;
  history: Line[];
  visual: string | null;
  docs: Partial<Record<DocKind, StageDoc>>; // every document so far; approved ones can be reopened
  pane: Pane;
  onPane: (pane: Pane) => void;
  busy: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onRetry: () => void;
  // "💡 Show me ideas" (family trial), at every guide stage: app ideas from the idea library while
  // the Idea stage is looking for the app, otherwise ideas for the current question (the guide).
  ideasMode: IdeasMode;
  onIdea: (idea: IdeaCard) => void;
  onAskIdeas: (text?: string) => void;
  voiceOn: boolean; // read replies aloud, then listen (talk mode)
  controls?: React.ReactNode; // type/talk switch, voice settings and toggle (above the answer box)
}

export default function GuideStage({ profile, reply, history, visual, docs, pane, onPane, busy, error, onSend, onRetry, ideasMode, onIdea, onAskIdeas, voiceOn, controls }: Props) {
  const young = profile.experience <= 1;
  const showReply = reply && !busy;
  const shownDocs = profile.experience >= 2 ? DOC_ORDER.filter(k => docs[k]) : [];
  const draft = shownDocs.map(k => docs[k]!).find(d => d.status === 'draft');
  const scroller = useRef<HTMLDivElement>(null);
  // Voice: read each new reply aloud (its words, question, and cards), then listen. The
  // listening signal belongs to one reply, so a fresh answer box never starts too early.
  const [heard, setHeard] = useState<{ reply: GuideReply | null; n: number }>({ reply: null, n: 0 });
  useEffect(() => {
    if (!reply || busy || !voiceOn) return;
    speak(replySpeech(reply), profile.theme, profile.ageGroup ?? 'adult', () => window.setTimeout(() => setHeard(h => ({ reply, n: h.n + 1 })), 600));
    return () => stopSpeaking();
  }, [reply, busy, voiceOn, profile.theme, profile.ageGroup]);

  // Keep the newest part of the conversation in view, also after turning the device.
  useEffect(() => {
    keepNewestInView(scroller.current);
  }, [history.length, reply, busy]);
  useEffect(() => {
    const again = () => keepNewestInView(scroller.current);
    window.addEventListener('orientationchange', again);
    window.addEventListener('resize', again);
    return () => { window.removeEventListener('orientationchange', again); window.removeEventListener('resize', again); };
  }, []);
  // Below the large layout the page scrolls and the answer bar is pinned to the bottom: the
  // newest message scrolls to just above it (index.css, .bwm-convo).
  const bar = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = bar.current, m = main.current;
    if (!el || !m || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => m.style.setProperty('--bwm-bar', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // "💡 Show me ideas" (family trial): very light. The button is there from the first question
  // (not while a plan waits for a 👍); a stuck answer ("I don't know", "idk", "help"…) gets ideas
  // at once; and after about 20 seconds with no answer the button glows (in talk mode the guide
  // also asks gently). App ideas come from the idea library (no Claude call); ideas for any other
  // question come from the guide as answer cards.
  const ideasOn = !draft;
  const library = ideasMode === 'library';
  const [ideas, setIdeas] = useState<IdeaCard[] | null | false>(false); // false: closed, null: loading
  const seenIdeas = useRef<string[]>([]);
  const [glow, setGlow] = useState(false);
  const [nudged, setNudged] = useState(false);
  const quietTimer = useRef(0);
  const showIdeas = async () => {
    setGlow(false);
    setIdeas(null);
    try {
      const got = await getIdeas(seenIdeas.current);
      seenIdeas.current = [...seenIdeas.current, ...got.map(i => i.id)];
      setIdeas(got);
      if (voiceOn) speak(`Here are some ideas: ${got.map(i => i.title).join(', ')}. Or something else!`, profile.theme, profile.ageGroup ?? 'adult');
    } catch { setIdeas(false); }
  };
  const restartQuiet = () => {
    window.clearTimeout(quietTimer.current);
    setGlow(false);
    if (!ideasOn || busy || ideas !== false || !!reply?.cards?.length) return;
    quietTimer.current = window.setTimeout(() => {
      setGlow(true);
      if (voiceOn && !nudged) { setNudged(true); speak('Want some ideas? Tap the light bulb!', profile.theme, profile.ageGroup ?? 'adult'); }
    }, QUIET_MS);
  };
  useEffect(() => { restartQuiet(); return () => window.clearTimeout(quietTimer.current); }, [reply, busy, ideasOn, ideas === false]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!ideasOn || !library) setIdeas(false); }, [ideasOn, library]);
  const askIdeas = (text?: string) => {
    setGlow(false);
    if (library) void showIdeas();
    else { stopSpeaking(); onAskIdeas(text); }
  };
  // The idea cards scroll into view when they open (they sit under the question card).
  useEffect(() => { if (ideas) keepNewestInView(scroller.current); }, [ideas]);
  const send = (text: string) => {
    if (ideasOn && STUCK.test(text)) { askIdeas(library ? undefined : text); return; }
    setIdeas(false);
    onSend(text);
  };
  const pickIdea = (idea: IdeaCard) => { setIdeas(false); stopSpeaking(); onIdea(idea); };
  const ownIdea = () => {
    setIdeas(false);
    const box = bar.current?.querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input[type=text]');
    box?.focus();
  };

  // ✏️ Change something: the answer box asks what to change (family trial).
  const [changing, setChanging] = useState(false);
  useEffect(() => { setChanging(false); }, [draft?.markdown]);
  const askChange = () => {
    setChanging(true);
    const box = bar.current?.querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input[type=text]');
    box?.scrollIntoView({ block: 'nearest' });
    box?.focus();
  };
  const seePlan = () => {
    if (draft) onPane(draft.kind as Pane);
    window.setTimeout(() => document.getElementById('bwm-plan')?.scrollIntoView({ block: 'start' }), 50);
  };
  const placeholder = changing ? 'What would you like to change?'
    : reply?.cards?.length ? '…or type your own answer'
    : draft ? 'Say "looks good", or tell me what to change'
    : reply?.question ? 'Type your answer' : 'Type here';
  const current: Pane = pane !== 'picture' && shownDocs.includes(pane) ? pane
    : visual || !shownDocs.length ? 'picture' : shownDocs[shownDocs.length - 1];
  const chips: Pane[] = [...(visual ? ['picture' as const] : []), ...shownDocs];
  const side = !!visual || shownDocs.length > 0;

  return (
    <main ref={main} className={`mx-auto grid gap-4 px-4 pb-4 pt-3 lg:h-[calc(100dvh-var(--bwm-top,56px))] ${side ? 'max-w-7xl lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]' : 'max-w-4xl'}`}>
      <section className="flex min-h-0 flex-col">
        <div ref={scroller} className="bwm-convo flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2 pr-1" aria-label="Conversation">
          {history.map((line, i) => line.from === 'stage'
            ? <p key={i} className="my-2 flex items-center gap-3 text-sm font-bold text-muted"><span aria-hidden className="h-0.5 flex-1 rounded bg-line" />{line.text}<span aria-hidden className="h-0.5 flex-1 rounded bg-line" /></p>
            : (
              <div key={i} className={`max-w-[85%] rounded-3xl px-4 py-2.5 ${line.from === 'me'
                ? `self-end rounded-br-md bg-accent font-semibold text-white ${young ? 'text-lg' : ''}`
                : 'ppg-say self-start rounded-bl-md bg-surface-2 text-muted'}`}>
                {line.from === 'me' ? <span className="whitespace-pre-line">{line.text}</span> : <Md>{line.text}</Md>}
              </div>
            ))}

          <div className="rounded-3xl border-2 border-line bg-surface p-5 shadow-sm sm:p-6" aria-live="polite">
            {busy && <Thinking theme={profile.theme} big={!reply && history.length === 0} />}
            {showReply && (
              <>
                {reply.say && <div className={`ppg-say text-muted ${young ? 'text-xl' : 'text-lg'}`}><Md>{reply.say}</Md></div>}
                {reply.question && (
                  <h2 className={`mt-3 font-extrabold leading-tight text-ink ${young ? 'text-3xl' : 'text-2xl'}`}><Md inline>{reply.question}</Md></h2>
                )}
                {reply.tooBig && <p className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 font-bold text-ink">🐘 That one's too big to build in one go, so let's shrink it!</p>}
                {reply.techSummary && <p className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 font-bold text-ink">🛠️ {reply.techSummary}</p>}
                {draft && <button onClick={seePlan} className="mt-4 min-h-11 rounded-full border-2 border-accent bg-surface px-5 font-bold text-ink lg:hidden">📋 See your plan</button>}
                {!draft && reply.visualHtml && (
                  <button onClick={() => { onPane('picture'); window.setTimeout(() => document.getElementById('bwm-aside')?.scrollIntoView({ block: 'start' }), 50); }}
                    className="mt-4 min-h-11 rounded-full border-2 border-accent bg-surface px-5 font-bold text-ink lg:hidden">🖼️ See the picture</button>
                )}
                {ideasOn && ideas === false && reply.question && (
                  young
                    ? <button onClick={() => askIdeas()} className={`mt-4 min-h-12 rounded-full bg-accent px-6 text-lg font-extrabold text-white shadow ${glow ? 'bwm-glow' : ''}`}>{reply.cards?.length && !library ? '🔀 Other ideas' : '💡 Show me ideas'}</button>
                    : <button onClick={() => askIdeas()} className={`mt-4 min-h-11 rounded-full border-2 border-accent bg-surface px-4 font-bold text-ink ${glow ? 'bwm-glow' : ''}`}>{reply.cards?.length && !library ? '🔀 Other ideas' : '💡 Need inspiration?'}</button>
                )}
                {glow && voiceOn && ideas === false && <p className="mt-2 font-bold text-muted">Want some ideas? Tap the light bulb!</p>}
              </>
            )}
            {error && !busy && (error.startsWith('LIMIT:')
              ? <p className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 font-bold text-ink">{error.slice(6)}</p>
              : (
                <div className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 text-ink">
                  <p className="font-bold">My brain hiccupped, let's try that again!</p>
                  <button onClick={onRetry} className="mt-2 rounded-full bg-accent px-5 py-2 font-bold text-white">Try again</button>
                </div>
              ))}
          </div>

          {ideasOn && library && ideas !== false && <IdeaPicker ideas={ideas} young={young} onPick={pickIdea} onMore={() => void showIdeas()} onOwn={ownIdea} />}
          {showReply && reply.cards && reply.cards.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {reply.cards.map(card => (
                <button key={card.label} onClick={() => send(card.label)}
                  className="rounded-3xl border-2 border-line bg-surface p-4 text-left transition hover:border-accent hover:shadow-md">
                  <span className="text-4xl" aria-hidden>{card.emoji}</span>
                  <span className="mt-1 block text-xl font-extrabold text-ink">{card.label}</span>
                  {card.detail && <span className="mt-1 block text-muted">{card.detail}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div ref={bar} className="sticky bottom-0 z-20 -mx-4 bg-bg px-4 pb-[max(env(safe-area-inset-bottom),0.5rem)] lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pb-0">
          {controls && <div className="relative flex flex-wrap items-center gap-2 pt-2">{controls}</div>}
          {showReply && (
            <div className="pt-2">
              <AnswerBox inputMode={profile.inputMode} onSend={send} onType={restartQuiet} placeholder={placeholder}
                listenToken={heard.reply === reply ? heard.n : 0} handsFree={voiceOn} silenceMs={pauseFor(profile.ageGroup)} />
            </div>
          )}
        </div>
      </section>

      {/* UI review K6 and the family trial: the picture pane appears only once there's a picture
          or a plan to show (an empty box sat under the answer box, and took half the screen). */}
      {side && <aside id="bwm-aside" className="flex min-h-[420px] flex-col gap-2 lg:min-h-0">
        {chips.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="What to show">
            {chips.map(p => (
              <button key={p} role="tab" aria-selected={current === p} onClick={() => onPane(p)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold ${current === p ? 'bg-accent text-white' : 'border-2 border-line bg-surface text-ink'}`}>
                {p === 'picture' ? '🖼️ Picture' : `📄 ${DOC_CHIPS[p] ?? p}${docs[p]?.status === 'approved' ? ' ✓' : ''}`}
              </button>
            ))}
          </div>
        )}
        {current !== 'picture'
          ? <DocReview doc={docs[current]!} className="flex-1" busy={busy}
              onApprove={() => onSend('Looks good!')} onChange={askChange} />
          : visual
            ? <VisualPane title="Picture of the idea" html={visual} fit className="min-h-[420px] flex-1" />
            : null}
      </aside>}
    </main>
  );
}
