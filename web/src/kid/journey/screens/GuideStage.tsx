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
import type { DocKind, GuideReply, Profile, StageDoc } from '../types';
import { keepNewestInView } from '../lib/scroll';

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
  voiceOn: boolean; // read replies aloud, then listen (talk mode)
}

export default function GuideStage({ profile, reply, history, visual, docs, pane, onPane, busy, error, onSend, onRetry, voiceOn }: Props) {
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

  // Keep the newest part of the conversation in view.
  useEffect(() => {
    keepNewestInView(scroller.current);
  }, [history.length, reply, busy]);

  const placeholder = reply?.cards?.length ? '…or type your own answer'
    : draft ? 'Say "looks good", or tell me what to change'
    : reply?.question ? 'Type your answer' : 'Type here';
  const current: Pane = pane !== 'picture' && shownDocs.includes(pane) ? pane
    : visual || !shownDocs.length ? 'picture' : shownDocs[shownDocs.length - 1];
  const chips: Pane[] = [...(visual ? ['picture' as const] : []), ...shownDocs];

  return (
    <main className="mx-auto grid max-w-7xl gap-4 px-4 pb-4 lg:h-[calc(100vh-56px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="flex min-h-0 flex-col">
        <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2 pr-1" aria-label="Conversation">
          {history.map((line, i) => line.from === 'stage'
            ? <p key={i} className="my-1 self-center rounded-full bg-accent-soft px-4 py-1 text-sm font-bold text-ink">{line.text}</p>
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

          {showReply && reply.cards && reply.cards.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {reply.cards.map(card => (
                <button key={card.label} onClick={() => onSend(card.label)}
                  className="rounded-3xl border-2 border-line bg-surface p-4 text-left transition hover:border-accent hover:shadow-md">
                  <span className="text-4xl" aria-hidden>{card.emoji}</span>
                  <span className="mt-1 block text-xl font-extrabold text-ink">{card.label}</span>
                  {card.detail && <span className="mt-1 block text-muted">{card.detail}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {showReply && (
          <div className="pt-2">
            <AnswerBox inputMode={profile.inputMode} onSend={onSend} placeholder={placeholder}
              listenToken={heard.reply === reply ? heard.n : 0} handsFree={voiceOn} silenceMs={pauseFor(profile.ageGroup)} />
          </div>
        )}
      </section>

      <aside className="flex min-h-[420px] flex-col gap-2 lg:min-h-0">
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
          ? <DocReview doc={docs[current]!} className="flex-1" />
          : visual
            ? <VisualPane title="Picture of the idea" html={visual} fit className="min-h-[420px] flex-1" />
            : <div className="flex min-h-[420px] flex-1 items-center justify-center rounded-3xl border-2 border-dashed border-line px-6 text-center text-lg text-muted">Pictures of your idea will show up here</div>}
      </aside>
    </main>
  );
}
