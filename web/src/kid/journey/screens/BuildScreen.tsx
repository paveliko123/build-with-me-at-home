// prd.md > The Kid's Journey, Build. Ported from Build With Me's BuildScreen; the calls go to the
// family's computer (lib/api.ts), and the controls row sits above the answer box.
// The conversation on the left (⅓), the real app on the right (⅔),
// the same sides as the planning screens. After the app is built, the guide collects the
// person's changes into one list and rebuilds only when they say they're done, so every
// new version holds all their changes and says what changed. A JavaScript error inside a
// new version triggers one automatic repair. During the first build the guide keeps them
// company with a short waiting chat (ideas for later, at most two questions).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AnswerBox from '../components/AnswerBox';
import Md from '../components/Md';
import Thinking from '../components/Thinking';
import VisualPane from '../components/VisualPane';
import WaitingAnimation from '../components/WaitingAnimation';
import { addIdeas, buildProgress, changeTurn, generateApp, guideTurn, limitMessage, passEnded, type BuildMode, type BuildProgressInfo } from '../lib/api';
import BuildProgress, { progressLine } from '../components/BuildProgress';
import { speak, stopSpeaking, voiceReady, warmVoice } from '../lib/voice';
import { pauseFor } from '../lib/speech';
import type { Profile } from '../types';
import { keepNewestInView } from '../lib/scroll';

interface ChatLine { from: 'guide' | 'kid'; text: string }

const WAIT_CHAT_AFTER_MS = 6_000;
const MAX_WAIT_QUESTIONS = 2;
const LISTEN_DELAY_MS = 600; // after the guide stops talking, before the mic opens
const STOP_ASKING = /\b(stop|no more questions?|never ?mind|be quiet|shh+|enough questions)\b/i;

interface Step { n: number; title: string; check?: string }

/** Slices from the approved 5-build checklist ("- [ ] **N. Title**" plus its fields). */
function parseChecklist(markdown: string): { steps: Step[]; mode: 'learn' | 'fast' | null } {
  const steps: Step[] = [];
  for (const line of markdown.split('\n')) {
    const slice = line.trim().match(/^- \[[ xX]\] \*\*(\d+)\.\s*(.+?)\*\*/);
    if (slice) steps.push({ n: Number(slice[1]), title: slice[2].trim().replace(/[.:]$/, '') });
    const check = line.trim().match(/^[-*]?\s*\**Learner check:?\**:?\s*(.+)$/i);
    if (check && steps.length) steps[steps.length - 1].check = check[1].trim();
  }
  const line = markdown.match(/Build mode:\s*\**\s*(learn|fast)\b/i);
  const mode = line ? (line[1].toLowerCase() as 'learn' | 'fast') : null;
  return { steps, mode };
}

export interface Resume { html: string; version: number; stepsBuilt: number; pendingChanges?: string[] }

interface Props {
  profile: Profile;
  intro?: string; // the Tech plan's one-line summary, e.g. "Here's how I'll build it!"
  checklist?: string; // experienced end: build step by step from the approved checklist
  resume?: Resume; // after a refresh: the newest version is already built
  onShip: (html: string) => void;
  voiceOn: boolean; // read the guide's lines aloud, and listen after a question (talk mode)
  controls?: React.ReactNode; // type/talk switch, voice settings and toggle
  onPassEnded?: () => void; // time's up or the pass ended mid-build: the pass screens take over
}

export default function BuildScreen({ profile, intro, checklist, resume, onShip, voiceOn, controls, onPassEnded }: Props) {
  const plan = useMemo(() => (checklist ? parseChecklist(checklist) : null), [checklist]);
  const [html, setHtml] = useState<string | null>(resume?.html ?? null);
  const [version, setVersion] = useState(resume?.version ?? 0);
  const [building, setBuilding] = useState(false);
  const [guideBusy, setGuideBusy] = useState(false);
  const [failed, setFailed] = useState<{ mode: BuildMode; request?: string; fromList?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ request: string; reason: string } | null>(null);
  // A message the empty allowance stopped (QA round 2: it was lost), kept to send again.
  const [blocked, setBlocked] = useState<string | null>(null);
  // The change list: collected one message at a time, built all at once when they're done.
  const [changes, setChanges] = useState<string[]>(resume?.pendingChanges ?? []);
  // Ideas the kid had in the waiting chat (family trial: they were lost). Offered as cards
  // when the app is ready; one tap puts them on the change list.
  const waitIdeas = useRef<string[]>([]);
  const [ideaOffer, setIdeaOffer] = useState<string[]>([]);
  const [chat, setChat] = useState<ChatLine[]>(() => resume
    ? [{ from: 'guide', text: `Welcome back! Here's your app (version ${resume.version}).${resume.pendingChanges?.length ? ' Your change list is still here.' : ' What would you like to change?'}` }]
    : [
      ...(intro ? [{ from: 'guide' as const, text: `🛠️ ${intro}` }] : []),
      plan && plan.mode
        ? { from: 'guide', text: `Building from your checklist: ${plan.steps.length} steps, ${plan.mode} mode. Step 1 is on its way!` }
        : plan
          ? { from: 'guide', text: `Your checklist has ${plan.steps.length} steps. Before I start: learn mode or fast mode? In learn mode I pause after each step so you can try it. In fast mode I build every step and you review at the end.` }
          : { from: 'guide', text: 'Building your app now. This usually takes a minute or two!' },
    ]);
  const [stepDone, setStepDone] = useState(resume?.stepsBuilt ?? 0); // how many checklist steps are built
  const [awaitingNext, setAwaitingNext] = useState(!!resume && !!plan && (resume.stepsBuilt ?? 0) < plan.steps.length);
  const [mode, setMode] = useState<'learn' | 'fast' | null>(plan?.mode ?? (resume ? 'learn' : null));
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const repairedVersion = useRef(0);
  const started = useRef(false);
  const buildingRef = useRef(false);
  // The waiting chat runs during the FIRST build only, asks at most two questions, and
  // stops for good when the person asks it to. Later builds just build.
  const waitAllowed = useRef(!resume);
  const waitStopped = useRef(false);
  const waitAsked = useRef(0);
  const waitingOpen = useRef(false);
  const lastWaitQuestionAt = useRef(0);
  const lastWaitQuestion = useRef('');
  const buildEndedAt = useRef(0);
  const typingSince = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLElement>(null);
  const young = profile.experience <= 1;

  // With the voice on, a guide line appears just as its voice starts (learner testing,
  // 2026-10-05: the words came seconds before it), in order.
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const lineQueue = useRef(Promise.resolve());
  const say = (line: ChatLine) => {
    if (line.from !== 'guide' || !voiceOnRef.current) { setChat(c => [...c, line]); return; }
    lineQueue.current = lineQueue.current.then(() => voiceReady(line.text)).then(() => setChat(c => [...c, line]));
  };
  const [listenToken, setListenToken] = useState(0);
  // What's building now, shown on a small badge so the app stays usable underneath.
  const [buildLabel, setBuildLabel] = useState('');
  // The teaching progress view (family trial: "Building…" for minutes): what the builder is
  // working on, asked every 1.5 s while a build runs. In talk mode, one milestone is said aloud.
  const [progress, setProgress] = useState<BuildProgressInfo | null>(null);
  const toldDrawing = useRef(false);
  useEffect(() => {
    if (!building) return;
    setProgress(null);
    let live = true;
    const tick = async () => {
      try {
        const p = await buildProgress();
        if (!live) return;
        setProgress(p);
        if (p?.mode === 'full' && voiceOnRef.current && !toldDrawing.current && p.milestones.includes('drawing')) {
          toldDrawing.current = true;
          say({ from: 'guide', text: young ? "I'm drawing your pictures now!" : 'Now drawing the pictures.' });
        }
      } catch { /* the badge keeps its label */ }
    };
    void tick();
    const id = window.setInterval(tick, 1500);
    return () => { live = false; window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building]);

  // Voice: read each new guide line aloud; after a question, listen for the answer (after a
  // short pause, so the microphone doesn't catch the end of the guide's own voice).
  const spoken = useRef(0);
  useEffect(() => {
    const fresh = chat.slice(spoken.current).filter(l => l.from === 'guide');
    spoken.current = chat.length;
    if (!voiceOn || !fresh.length) return;
    const text = fresh.map(l => l.text).join(' ');
    speak(text, profile.theme, profile.ageGroup ?? 'adult', () => {
      if (/\?/.test(text)) window.setTimeout(() => setListenToken(n => n + 1), LISTEN_DELAY_MS);
    });
  }, [chat, voiceOn, profile.theme, profile.ageGroup]);
  useEffect(() => () => stopSpeaking(), []);

  // Keep the newest message in view.
  useEffect(() => {
    keepNewestInView(scroller.current);
  }, [chat, guideBusy, awaitingNext, failed, confirm, changes]);

  // The waiting chat (ideas for later). A reply that arrives after the app is ready keeps
  // just its words, never a new question.
  const guideSay = useCallback(async (text?: string) => {
    setGuideBusy(true);
    try {
      const { reply } = await guideTurn(text);
      const idea = reply.laterIdea;
      if (idea && !waitIdeas.current.includes(idea)) waitIdeas.current = [...waitIdeas.current, idea];
      if (!buildingRef.current) {
        if (text && reply.say) say({ from: 'guide', text: reply.say });
        // The build finished before this answer came back: offer its idea now.
        if (idea) setIdeaOffer(o => (o.includes(idea) ? o : [...o, idea]));
        return;
      }
      const ask = !waitStopped.current && waitAsked.current < MAX_WAIT_QUESTIONS && !!reply.question;
      if (ask) { waitAsked.current++; lastWaitQuestionAt.current = Date.now(); lastWaitQuestion.current = reply.question ?? ''; }
      const line = [reply.say, ask ? reply.question : ''].filter(Boolean).join(' ');
      if (line) say({ from: 'guide', text: line });
      waitingOpen.current = ask;
    } catch (err) {
      console.error(err);
    } finally {
      setGuideBusy(false);
    }
  }, []);

  const build = useCallback(async (mode: BuildMode, extra: { request?: string; error?: string; step?: number; confirmed?: boolean; fromList?: boolean } = {}): Promise<boolean> => {
    setBuilding(true);
    buildingRef.current = true;
    setFailed(null);
    setBuildLabel(mode === 'step' ? `Building step ${extra.step ?? ''}${plan ? ` of ${plan.steps.length}` : ''}…` : mode === 'edit' ? 'Building your changes…' : mode === 'repair' ? 'Fixing a bug…' : 'Building your app…');
    const chatThisBuild = waitAllowed.current && !waitStopped.current;
    waitAllowed.current = false;
    const timer = window.setTimeout(() => {
      if (buildingRef.current && chatThisBuild && !waitStopped.current) void guideSay();
    }, WAIT_CHAT_AFTER_MS);
    try {
      const result = await generateApp({ mode, ...extra });
      // The new version's words didn't pass the safety check: it's never shown, and the last
      // working version stays (prd.md > Safety).
      if (result.unsuitable) {
        if (extra.fromList) setChanges([]);
        say({ from: 'guide', text: "Hmm, I can't build that version. Let's try a different change! 🙂" });
        return false;
      }
      if (result.needsConfirm) {
        setConfirm({ request: extra.request ?? '', reason: result.reason });
        say({ from: 'guide', text: `Part of that is outside your scope${result.reason ? `: ${result.reason}` : '.'} Build it anyway?${profile.inputMode === 'talk' ? ' Say yes or no.' : ''}` });
        return false;
      }
      setHtml(result.html);
      setVersion(result.version);
      // Narrow screens stack the app above the chat: show the new version (QA round 3: it
      // was far above, out of view, after every build).
      if (window.matchMedia('(max-width: 1023px)').matches) window.setTimeout(() => preview.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 600);
      // QA round 3: what the builder couldn't get in is said plainly and goes back on the list.
      const missing = result.missing ?? [];
      if (extra.fromList) setChanges(mode === 'edit' ? missing : []);
      if (missing.length && mode === 'edit') {
        waitingOpen.current = false;
        say({ from: 'guide', text: `Version ${result.version} is ready, but ${missing.length === 1 ? 'this one didn\'t' : 'these didn\'t'} make it in yet: ${missing.join('; ')}. ${missing.length === 1 ? 'It\'s' : 'They\'re'} back on your list. Say "that's all" to try again, or tell me another way to do ${missing.length === 1 ? 'it' : 'them'}.` });
        return true;
      }
      if (missing.length && mode === 'step') say({ from: 'guide', text: `Heads up: part of this step isn't working yet (${missing.join('; ')}). You can ask for it as a change at the end.` });
      const changed = result.changed ? ` ${result.changed}` : '';
      // Close an open waiting-chat question, so the box is clearly for changes again.
      const later = ''; // QA rounds 2–3: "(We can talk about that another time.)" confused people
      waitingOpen.current = false;
      const next = young ? 'Try it out! What would you like to change? Or share it when you love it.' : 'Try it out. Any changes, or ready to ship?';
      // The ideas from the waiting chat come back as cards to add (family trial).
      const ideas = mode === 'full' ? waitIdeas.current : [];
      if (ideas.length) {
        waitIdeas.current = [];
        setIdeaOffer(ideas);
        say({ from: 'guide', text: `Ta-da! Your app is ready. Try it out! While you waited, you had ${ideas.length === 1 ? 'an idea' : `${ideas.length} ideas`}. Tap ➕ to add ${ideas.length === 1 ? 'it' : 'them'} to your changes.` });
      } else if (mode !== 'step') say({ from: 'guide', text: mode === 'full' ? `Ta-da! Your app is ready.${later} ${next}`
        : mode === 'edit' ? `Done! Version ${result.version}.${changed || ' Your changes are in.'} ${next}`
        : `Oops, I found a little bug and fixed it.${changed} Try it again!` });
      else if (result.changed || later) say({ from: 'guide', text: `${result.changed ? `What's new:${changed}` : ''}${later}`.trim() });
      return true;
    } catch (err) {
      console.error(err);
      if (passEnded(err)) { onPassEnded?.(); return false; }
      const limit = limitMessage(err);
      if (limit) { say({ from: 'guide', text: limit }); return false; }
      setFailed({ mode, request: extra.request, fromList: extra.fromList });
      say({ from: 'guide', text: "My brain hiccupped while building. Let's try that again!" });
      return false;
    } finally {
      window.clearTimeout(timer);
      buildEndedAt.current = Date.now();
      buildingRef.current = false;
      setBuilding(false);
    }
  }, [guideSay, young, plan, profile.inputMode, onPassEnded]);

  // Experienced end: build one checklist step, report it, then pause (learn) or continue (fast).
  const buildStep = useCallback(async (index: number) => {
    if (!plan) return;
    const step = plan.steps[index];
    const ok = await build('step', { step: step.n });
    if (!ok) return;
    setStepDone(index + 1);
    const last = index + 1 >= plan.steps.length;
    const meanwhile = !last && modeRef.current === 'fast' ? ' You can try it while I build the next step.' : '';
    say({ from: 'guide', text: `✅ Step ${step.n} of ${plan.steps.length} built: ${step.title}.${step.check ? ` Try it: ${step.check}` : ''}${meanwhile}${last ? ` All ${plan.steps.length} steps are built, so your app is complete! Try it now. Any changes, or ready to ship?` : ''}` });
    if (last) return;
    if (modeRef.current === 'learn') setAwaitingNext(true);
    else void buildStep(index + 1);
  }, [plan, build]);

  useEffect(() => {
    if (started.current || resume) return;
    started.current = true;
    if (plan?.steps.length) { if (modeRef.current) void buildStep(0); }
    else void build('full');
  }, [build, buildStep, plan, resume]);

  const onAppError = useCallback((message: string) => {
    if (building || repairedVersion.current === version) return;
    repairedVersion.current = version;
    void build('repair', { error: message });
  }, [build, building, version]);

  function chooseMode(chosen: 'learn' | 'fast', echo = false) {
    if (echo) say({ from: 'kid', text: chosen === 'fast' ? 'Fast mode' : 'Learn mode' });
    setMode(chosen);
    modeRef.current = chosen;
    say({ from: 'guide', text: `${chosen === 'fast' ? 'Fast' : 'Learn'} mode it is. Step 1 is on its way!` });
    void buildStep(0);
  }

  /** Build the whole change list as one new version. */
  function buildChanges(list = changes, confirmed = false) {
    if (!list.length || buildingRef.current) return;
    say({ from: 'guide', text: `🔧 Building ${list.length === 1 ? 'your change' : list.length === 2 ? 'both changes' : `all ${list.length} changes`} now!` });
    void build('edit', { request: list.map((c, i) => `${i + 1}. ${c}`).join('\n'), fromList: true, confirmed });
  }

  /** One message about changes: the guide updates the list (or asks to repeat). */
  async function addChange(text: string) {
    setGuideBusy(true);
    if (voiceOnRef.current) warmVoice();
    // Shortly after a build that asked a waiting-chat question, this may be its answer.
    const recent = lastWaitQuestionAt.current > 0 && Date.now() - buildEndedAt.current < 90_000 && lastWaitQuestionAt.current < buildEndedAt.current;
    const chatQuestion = recent ? lastWaitQuestion.current : undefined;
    lastWaitQuestionAt.current = 0;
    try {
      const result = await changeTurn({ text, chatQuestion });
      // Keep "thinking" on until the reply's voice is ready, then show both together.
      if (result.reply && voiceOnRef.current) await voiceReady([result.reply.say, result.reply.question].filter(Boolean).join(' '));
      setChanges(result.changes);
      if (result.reply) say({ from: 'guide', text: [result.reply.say, result.reply.question].filter(Boolean).join(' ') });
      if (result.ship && html && !buildingRef.current) { onShip(html); return; }
      if (result.ready) {
        if (buildingRef.current) say({ from: 'guide', text: 'Got it! When this version is ready, tap "That\'s all, build it!" and I\'ll build your list.' });
        else buildChanges(result.changes);
      }
    } catch (err) {
      console.error(err);
      if (passEnded(err)) { onPassEnded?.(); return; }
      say({ from: 'guide', text: limitMessage(err) ?? 'Oops, I missed that. Can you say it again?' });
    } finally {
      setGuideBusy(false);
    }
  }

  /** Waiting-chat ideas onto the change list (instant: no Claude call). */
  async function takeIdeas(ideas: string[]) {
    setIdeaOffer(o => o.filter(i => !ideas.includes(i)));
    say({ from: 'kid', text: ideas.length === 1 ? `Add: ${ideas[0]}` : `Add my ${ideas.length} ideas` });
    try {
      setChanges((await addIdeas(ideas)).changes);
      say({ from: 'guide', text: young ? 'Added! Tap "That\'s all, build it!" when your list is ready.' : 'Added to your list. Build it when you\'re ready.' });
    } catch (err) {
      console.error(err);
      if (passEnded(err)) { onPassEnded?.(); return; }
      say({ from: 'guide', text: limitMessage(err) ?? 'Oops, that didn\'t work. Tell me the idea and I\'ll add it.' });
    }
  }

  /** "Try again" after a failed build, from the button or said out loud (QA round 2). */
  function retry() {
    if (!failed) return;
    void (failed.mode === 'step' ? buildStep(stepDone) : build(failed.mode, { request: failed.request, fromList: failed.fromList }));
  }

  async function removeChange(index: number) {
    setChanges(c => c.filter((_, i) => i !== index));
    try { setChanges((await changeTurn({ remove: index })).changes); } catch (err) { console.error(err); }
  }

  function answerConfirm(yes: boolean, echo = true) {
    if (!confirm) return;
    setConfirm(null);
    if (echo) say({ from: 'kid', text: yes ? 'Yes, build it anyway' : 'No, not that one' });
    if (yes) buildChanges(changes, true);
    else say({ from: 'guide', text: 'OK! Remove that one from your list with ✕, then build the rest.' });
  }

  function send(text: string) {
    say({ from: 'kid', text });
    const startedTyping = typingSince.current;
    typingSince.current = 0;
    // Experienced end: the first answer picks learn or fast mode, then building starts.
    if (plan?.steps.length && !modeRef.current) { chooseMode(/fast/i.test(text) ? 'fast' : 'learn'); return; }
    // An open "Build it anyway?" is answered by a spoken or typed yes or no (live testing).
    if (confirm && !building) {
      if (/^\s*(yes|yeah|yep|sure|ok(ay)?|go ahead|do it|build it|please)\b/i.test(text)) { answerConfirm(true, false); return; }
      if (/^\s*(no|nope|don'?t|cancel|skip|not that)\b/i.test(text)) { answerConfirm(false, false); return; }
    }
    if (failed && !building && /^\W*(try (it )?again|again|retry|yes|yeah|ok(ay)?|go( ahead)?|please)\b/i.test(text)) { retry(); return; }
    setConfirm(null);
    setBlocked(null);
    const chatting = building && waitingOpen.current;
    // "Stop asking": the waiting chat ends for good.
    if ((chatting || building) && STOP_ASKING.test(text)) {
      waitStopped.current = true;
      waitingOpen.current = false;
      say({ from: 'guide', text: young ? "Okay! No more questions. I'll just build." : 'Sure, no more questions. Building quietly.' });
      return;
    }
    // An answer to the waiting chat stays chat, even if the build finished before it was sent.
    const lateReply = !building && startedTyping > 0 && startedTyping >= lastWaitQuestionAt.current
      && lastWaitQuestionAt.current > 0 && startedTyping < buildEndedAt.current;
    if (chatting || lateReply) { void guideSay(text); return; }
    void addChange(text);
  }

  const choosingMode = !!plan?.steps.length && !mode;
  const chatMode = building && waitingOpen.current;
  const boxLabel = choosingMode ? '🧭 Choose how to build'
    : chatMode ? '💬 Chat while your app builds (ideas for later)'
    : building ? '📝 Anything you say now goes on the list for next time'
    : changes.length ? '📝 Add another change, or build your list'
    : young ? '✏️ What would you like to change?' : '✏️ Describe a change';
  const placeholder = choosingMode ? 'Or type "learn" or "fast"'
    : chatMode ? 'Say something…'
    : profile.ageGroup === 'kid' ? 'Like "make it purple with stars"' : profile.ageGroup === 'teen' ? 'Like "add a high score"' : 'Like "add a reset button"';
  const button = 'rounded-full bg-accent px-5 py-2 font-bold text-white disabled:opacity-40';

  return (
    // One screen, no page scrolling: the app on top and the chat below on phones held upright;
    // side by side from tablet width (iPad portrait, phones held sideways); the chat scrolls inside.
    <main className="grid h-[calc(100dvh-var(--bwm-top,56px))] grid-rows-[minmax(0,55fr)_minmax(0,45fr)] gap-3 px-3 pb-3 pt-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-rows-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-4 lg:px-4 lg:pb-4">
      <aside className="order-2 flex min-h-0 flex-col rounded-3xl border-2 border-line bg-surface md:order-1">
        {plan && (
          <ol className="flex flex-wrap gap-2 border-b-2 border-line p-3 text-sm" aria-label="Checklist progress">
            {plan.steps.map((step, i) => (
              <li key={step.n} className={`rounded-full px-3 py-1 font-bold ${i < stepDone ? 'bg-accent text-white' : i === stepDone && building ? 'bg-accent-soft text-ink' : 'text-muted'}`}>
                {i < stepDone && <span aria-label="done">✓ </span>}{step.n}. {step.title}
              </li>
            ))}
          </ol>
        )}
        <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {chat.map((line, i) => (
            <div key={i} className={`max-w-[90%] whitespace-pre-line rounded-2xl px-4 py-3 ${young ? 'text-lg' : ''} ${line.from === 'guide' ? 'bg-accent-soft text-ink' : 'ml-auto w-fit bg-accent text-white'}`}>
              {line.from === 'guide' ? <span className="ppg-say block"><Md>{line.text}</Md></span> : line.text}
            </div>
          ))}
          {guideBusy && <Thinking theme={profile.theme} />}
          {choosingMode && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => chooseMode('learn', true)} className={button}>🧑‍🏫 Learn mode</button>
              <button onClick={() => chooseMode('fast', true)} className={button}>⚡ Fast mode</button>
            </div>
          )}
          {confirm && !building && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => answerConfirm(true)} className={button}>Yes, build it</button>
              <button onClick={() => answerConfirm(false)} className="rounded-full border-2 border-line px-5 py-2 font-bold text-ink">No, not that one</button>
            </div>
          )}
          {awaitingNext && plan && !building && stepDone < plan.steps.length && (
            <button onClick={() => { setAwaitingNext(false); say({ from: 'kid', text: `Build step ${plan.steps[stepDone].n}` }); void buildStep(stepDone); }} className={button}>
              Build step {plan.steps[stepDone].n}: {plan.steps[stepDone].title} →
            </button>
          )}
          {failed && <button onClick={retry} className={button}>Try again</button>}
          {ideaOffer.length > 0 && !building && (
            <section className="rounded-2xl border-2 border-accent bg-surface-2 p-3" aria-label="Your ideas from the wait">
              <h3 className="font-extrabold text-ink">💡 Your ideas</h3>
              <ul className="mt-2 space-y-2">
                {ideaOffer.map(idea => (
                  <li key={idea} className="flex items-center gap-2">
                    <span className="flex-1 text-ink">{idea}</span>
                    <button onClick={() => void takeIdeas([idea])} disabled={guideBusy} className="min-h-11 rounded-full bg-accent px-4 font-bold text-white disabled:opacity-40">➕ Add</button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {ideaOffer.length > 1 && <button onClick={() => void takeIdeas(ideaOffer)} disabled={guideBusy} className={button}>➕ Add {ideaOffer.length === 2 ? 'both' : 'all'}</button>}
                <button onClick={() => setIdeaOffer([])} className="min-h-11 rounded-full border-2 border-line px-5 font-bold text-ink">Not now</button>
              </div>
            </section>
          )}
          {blocked && !guideBusy && (
            <button onClick={() => { const text = blocked; setBlocked(null); say({ from: 'kid', text }); void addChange(text); }} className={button}>↩️ Send "{blocked.slice(0, 40)}{blocked.length > 40 ? '…' : ''}" again</button>
          )}
        </div>
        <div className="border-t-2 border-line p-3">
          {changes.length > 0 && (
            <section className="mb-3 rounded-2xl border-2 border-accent bg-surface-2 p-3" aria-label="Your change list">
              <h3 className="font-extrabold text-ink">📝 Your changes ({changes.length})</h3>
              <ol className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                {changes.map((c, i) => (
                  <li key={`${i}-${c}`} className="flex items-start gap-2 text-ink">
                    <span className="font-bold text-muted">{i + 1}.</span>
                    <span className="flex-1">{c}</span>
                    <button onClick={() => void removeChange(i)} disabled={building} aria-label={`Remove change ${i + 1}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-muted hover:bg-accent-soft hover:text-ink disabled:opacity-40">✕</button>
                  </li>
                ))}
              </ol>
              {!building && (
                <button onClick={() => buildChanges()} disabled={guideBusy} className={`${button} mt-2 w-full`}>
                  ✅ That's all, build it!
                </button>
              )}
            </section>
          )}
          {controls && <div className="relative z-20 mb-2 flex flex-wrap items-center gap-2">{controls}</div>}
          <p className="mb-2 text-sm font-bold text-muted">{boxLabel}</p>
          <AnswerBox compact inputMode={profile.inputMode} onSend={send} onType={() => { typingSince.current = Date.now(); }}
            listenToken={listenToken} handsFree={voiceOn} silenceMs={pauseFor(profile.ageGroup)}
            disabled={guideBusy || (!building && !html && !choosingMode)} placeholder={placeholder} />
          {html && !building && !choosingMode && changes.length === 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => onShip(html)} className="flex-1 rounded-full bg-accent px-5 py-2.5 font-extrabold text-white shadow hover:scale-[1.01]">
                🎉 {young ? "I'm happy with it, put it on my shelf!" : 'Ship it'}
              </button>
            </div>
          )}
        </div>
      </aside>

      <section ref={preview} className="relative order-1 min-h-0 md:order-2">
        {html && <VisualPane title="Your app" html={html} onAppError={onAppError} className="h-full min-h-0" />}
        {!html && (
          <div className="absolute inset-0 flex overflow-y-auto rounded-3xl border-2 border-line bg-surface/95">
            {choosingMode
              ? <p className="m-auto px-6 text-center text-2xl font-extrabold text-ink"><span className="md:hidden">↓</span><span className="hidden md:inline">←</span> Choose learn or fast mode to start building</p>
              : <div className="m-auto flex w-full flex-col items-center gap-4 py-4"><div className="scale-75"><WaitingAnimation theme={profile.theme} /></div><BuildProgress progress={progress} young={young} fallback={buildLabel} /></div>}
          </div>
        )}
        {html && building && (
          <div role="status" className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-full bg-accent px-4 py-2 font-bold text-white shadow-lg">
            <span className="ppg-bounce inline-block" aria-hidden>⏳</span>{progressLine(progress, young, buildLabel)}
          </div>
        )}
      </section>
    </main>
  );
}
