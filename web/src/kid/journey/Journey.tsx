// The kid's journey behind a pass (prd.md > The Kid's Journey): Welcome → Theme → Start, Idea,
// Design and Tech plan with the guide → Build → Ship onto My apps. Ported from Build With Me's
// App.tsx: the project lives on the family's computer (one unfinished project per kid, resumed by
// the next pass), so there's no project ID in the browser.
import { useEffect, useRef, useState } from 'react';
import ProgressBar from './components/ProgressBar';
import KidDialog from './components/KidDialog';
import Thinking from './components/Thinking';
import GuideStage, { type Line, type Pane } from './screens/GuideStage';
import ThemePick, { type ProfileChoice } from './screens/ThemePick';
import BuildScreen, { type Resume } from './screens/BuildScreen';
import ShipScreen from './screens/ShipScreen';
import MyApps from './screens/MyApps';
import Welcome from './screens/Welcome';
import { getJourney, guideTurn, limitMessage, newApp, passEnded, setInputMode as saveInputMode, startJourney, type IdeaCard } from './lib/api';
import { speechSupported } from './lib/speech';
import { defaultSpeed, deviceVoices, setVoiceName, setVoiceSpeed, SPEEDS, stopSpeaking, voiceSupported } from './lib/voice';
import { DEFAULT_THEME, themeStyle } from './themes/themes';
import type { DocKind, GuideReply, GuideTurnResult, Profile as ProfileT, SessionSnapshot, Stage, StageDoc, ThemeId } from './types';
import '@fontsource-variable/nunito';

type Screen = 'loading' | 'welcome' | 'profile' | 'guide';
const GUIDE_STAGES: Stage[] = ['start', 'idea', 'design', 'tech'];
const STAGE_LABELS: Partial<Record<Stage, string>> = { start: '1 · 👋 Start', idea: '2 · 💡 Idea', design: '3 · 🎨 Design', tech: '4 · 🛠️ Tech plan', build: '5 · 🏗️ Build' };
const SPEED_LABELS = ['🐢 Slow', 'Normal', 'Fast', 'Faster', '🐇 Fastest'];

/** The guide's reply as one chat line once the person has answered it. */
function guideLine(reply: GuideReply): string {
  return [reply.say, reply.question].filter(Boolean).join('\n\n');
}

export default function Journey({ name, onPassEnded }: { name: string; onPassEnded: () => void }) {
  const [screen, setScreen] = useState<Screen>('loading');
  const [inputMode, setInputMode] = useState<ProfileT['inputMode']>('type');
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [profile, setProfile] = useState<ProfileT | null>(null);
  const [stage, setStage] = useState<Stage>('start');
  const [reply, setReply] = useState<GuideReply | null>(null);
  const [history, setHistory] = useState<Line[]>([]);
  const [visual, setVisual] = useState<string | null>(null);
  const [docs, setDocs] = useState<Partial<Record<DocKind, StageDoc>>>({});
  const [pane, setPane] = useState<Pane>('picture');
  // Voice: on by default for kids who chose to talk; the toggle pauses it.
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceMenu, setVoiceMenu] = useState(false);
  const voiceRef = useRef(false);
  voiceRef.current = voiceOn;
  const [voices, setVoices] = useState(deviceVoices);
  useEffect(() => {
    if (!voiceSupported()) return;
    const update = () => setVoices(deviceVoices());
    window.speechSynthesis.addEventListener?.('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', update);
  }, []);
  // The voice menu: remembered on this device; '' is the theme's own voice.
  const [voiceName, setVoiceNameState] = useState(() => { try { return localStorage.getItem('bwm-voice-name') ?? ''; } catch { return ''; } });
  setVoiceName(voiceName);
  function changeVoice(n: string) {
    setVoiceNameState(n);
    try { localStorage.setItem('bwm-voice-name', n); } catch { /* storage unavailable */ }
  }
  const [speed, setSpeed] = useState<number | null>(() => {
    try { const v = Number(localStorage.getItem('bwm-voice-speed')); return SPEEDS.includes(v) ? v : null; } catch { return null; }
  });
  const voiceSpeed = speed ?? defaultSpeed(profile?.ageGroup ?? 'kid');
  setVoiceSpeed(voiceSpeed);
  function changeSpeed(value: number) {
    setSpeed(value);
    try { localStorage.setItem('bwm-voice-speed', String(value)); } catch { /* storage unavailable */ }
  }
  const [busy, setBusy] = useState(false);
  // The screens below fill the rest of the window: they size themselves from the top bar's real height.
  const topBar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = topBar.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--bwm-top', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, [screen, !!profile]);
  // Build and Ship: the newest app (after a refresh too), and the Tech plan's one-liner.
  const [resumeApp, setResumeApp] = useState<Resume | undefined>(undefined);
  const [techSummary, setTechSummary] = useState<string | undefined>(undefined);
  const [shipHtml, setShipHtml] = useState<string | null>(null);
  // Shipped apps are on the shelf: "New app" then needs no question (family trial).
  const [shipped, setShipped] = useState(false);
  const [askNew, setAskNew] = useState(false);
  // Emojis that fit the app, from the guide: the icon choices at Ship (family trial).
  const [appEmojis, setAppEmojis] = useState<string[]>([]);
  const [shelfOpen, setShelfOpen] = useState(false);
  // prd.md > Limit Reached: a friendly screen when the parent's plan limit is hit; the work is saved.
  const [limited, setLimited] = useState(false);
  useEffect(() => {
    const on = () => { stopSpeaking(); setLimited(true); };
    window.addEventListener('bwm-limit', on);
    return () => window.removeEventListener('bwm-limit', on);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [lastText, setLastText] = useState<string | undefined>(undefined);
  const started = useRef(false);

  function resume(s: SessionSnapshot) {
    setShipped(!!s.shipped);
    setAppEmojis(s.appEmojis ?? []);
    setProfile(s.profile);
    setVoiceOn(s.profile.inputMode === 'talk');
    voiceRef.current = s.profile.inputMode === 'talk';
    setTheme(s.profile.theme);
    setStage(s.stage);
    setReply(s.reply);
    setDocs(Object.fromEntries(s.docs.map(d => [d.kind, d])));
    if (s.doc) setPane(s.doc.kind);
    if (s.app) setResumeApp({ html: s.app.html, version: s.app.version, stepsBuilt: 0, pendingChanges: s.pendingChanges });
    setTechSummary(s.techSummary);
    if (s.reply?.visualHtml) setVisual(s.reply.visualHtml);
    if (s.lastExchange) setHistory([...(s.lastExchange.question ? [{ from: 'guide' as const, text: s.lastExchange.question }] : []), { from: 'me', text: s.lastExchange.answer }]);
    else setHistory([{ from: 'stage', text: STAGE_LABELS[s.stage] ?? s.stage }]);
    setScreen('guide');
    // A stage that never got its opening reply (closed mid-handover): open it now.
    if (!s.reply && GUIDE_STAGES.includes(s.stage)) void turn(undefined, s.profile);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Pick up where the kid left off (the next pass resumes the unfinished project).
    getJourney().then(s => (s ? resume(s) : setScreen('welcome'))).catch(err => {
      if (passEnded(err)) onPassEnded(); else { console.error(err); setScreen('welcome'); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function settle(r: GuideTurnResult) {
    setReply(r.reply);
    if (r.reply.techSummary) setTechSummary(r.reply.techSummary);
    if (r.reply.appEmojis?.length) setAppEmojis(r.reply.appEmojis);
    setStage(r.stage);
    if (r.reply.visualHtml) { setVisual(r.reply.visualHtml); setPane('picture'); }
    const doc = r.reply.doc;
    if (doc) { setDocs(d => ({ ...d, [doc.kind]: doc })); setPane(doc.kind); }
  }

  async function turn(text?: string, who: ProfileT | null = profile, retry = false, idea?: IdeaCard) {
    setBusy(true);
    setError(null);
    setLastText(text);
    // Echo the answer (card picks included) under the question it answers.
    const echo = idea ? `${idea.emoji} ${idea.title}` : text;
    if (echo && !retry) setHistory(h => [...h, ...(reply ? [{ from: 'guide' as const, text: guideLine(reply) }] : []), { from: 'me', text: echo }]);
    try {
      let result = await guideTurn(idea ? undefined : text, idea?.id);
      settle(result);
      // A finished stage hands over to the next one, which the guide opens itself.
      while (result.stageChanged && GUIDE_STAGES.includes(result.stage)) {
        const next = result.stage;
        setHistory(h => [...h, { from: 'stage', text: STAGE_LABELS[next] ?? next }]);
        result = await guideTurn();
        settle(result);
      }
      void who;
    } catch (err) {
      if (passEnded(err)) { onPassEnded(); return; }
      console.error(err);
      setError(limitMessage(err) ? `LIMIT:${limitMessage(err)}` : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function begin(choice: ProfileChoice) {
    setBusy(true);
    try {
      const s = await startJourney(choice);
      setProfile(s.profile);
      setVoiceOn(s.profile.inputMode === 'talk');
      voiceRef.current = s.profile.inputMode === 'talk';
      setStage(s.stage);
      setHistory([{ from: 'stage', text: STAGE_LABELS[s.stage] ?? s.stage }]);
      setScreen('guide');
      await turn(undefined, s.profile);
    } catch (err) {
      if (passEnded(err)) { onPassEnded(); return; }
      console.error(err);
      setError(limitMessage(err) ?? "My brain hiccupped, let's try that again!");
      setBusy(false);
    }
  }

  // Learner request (early checkpoint): turn the automatic microphone off and type instead,
  // or back. The guide's voice is a separate switch.
  function switchMode(mode: ProfileT['inputMode']) {
    if (!profile) return;
    setProfile({ ...profile, inputMode: mode });
    saveInputMode(mode).catch(() => {});
  }

  /** "＋ New app": straight away after shipping (the app is on the shelf); otherwise ask first,
   *  in the app's own style and with honest words (family trial). */
  function startOver() {
    if (shipped) void goNew();
    else setAskNew(true);
  }
  async function goNew() {
    setAskNew(false);
    stopSpeaking();
    await newApp().catch(() => {});
    window.location.reload();
  }

  // Learner request (early checkpoint): the answer controls sit right above the talk button,
  // next to where the kid answers, on every screen size (they were in the top bar).
  const controls = profile && (
    <>
              {profile.inputMode === 'talk'
                ? <button onClick={() => switchMode('type')} title="Stop the microphone and type your answers"
                    className="rounded-full border-2 border-line bg-surface px-3 py-1 text-sm font-bold text-ink hover:border-accent">⌨️ Type instead</button>
                : speechSupported() && <button onClick={() => switchMode('talk')} title="Answer by talking"
                    className="rounded-full border-2 border-line bg-surface px-3 py-1 text-sm font-bold text-ink hover:border-accent">🎤 Talk instead</button>}
            {voiceSupported() && (
              <>
                {voiceOn && (
                  <div className="relative">
                    <button onClick={() => setVoiceMenu(m => !m)} aria-expanded={voiceMenu} aria-label="Voice settings"
                      className="rounded-full border-2 border-line bg-surface px-2.5 py-1 text-sm font-bold text-ink hover:border-accent">⚙️</button>
                    {voiceMenu && (
                      <div className="absolute bottom-full left-0 z-30 mb-2 flex w-56 flex-col gap-2 rounded-2xl border-2 border-line bg-surface p-3 shadow-lg">
                        <label className="flex flex-col gap-1 text-sm font-bold text-ink">
                          🗣️ Voice
                          <select value={voiceName} onChange={e => { stopSpeaking(); changeVoice(e.target.value); }}
                            className="rounded-full border-2 border-line bg-surface px-2 py-1 text-sm font-bold text-ink">
                            {voices.map(v => <option key={v.name} value={v.name}>{v.label}</option>)}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-bold text-ink">
                          ⏩ Talking speed
                          <select value={voiceSpeed} onChange={e => changeSpeed(Number(e.target.value))}
                            className="rounded-full border-2 border-line bg-surface px-2 py-1 text-sm font-bold text-ink">
                            {SPEEDS.map(s => <option key={s} value={s}>{SPEED_LABELS[SPEEDS.indexOf(s)]}</option>)}
                          </select>
                        </label>
                      </div>
                    )}
                  </div>
                )}
                <button onClick={() => { if (voiceOn) stopSpeaking(); setVoiceOn(v => !v); }} aria-pressed={voiceOn}
                  className="rounded-full border-2 border-line bg-surface px-3 py-1 text-sm font-bold text-ink hover:border-accent">
                  {voiceOn ? '🔊 Voice on' : '🔇 Voice off'}
                </button>
              </>
            )}
    </>
  );

  return (
    <div style={themeStyle(theme)} className="bwm-journey min-h-screen bg-bg text-ink">
      {screen === 'loading' && <div className="flex min-h-screen items-center justify-center"><Thinking theme={theme} big /></div>}
      {limited && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg px-4">
          <div className="max-w-md text-center">
            <div className="text-7xl" aria-hidden>🔋</div>
            <h1 className="mt-3 text-3xl font-extrabold text-ink">Your helper needs a rest</h1>
            <p className="mt-3 text-lg text-muted">Ask your parent, and you'll carry on later right where you stopped. Everything is saved.</p>
            <button onClick={() => setLimited(false)} className="mt-6 rounded-full bg-accent px-6 py-3 text-lg font-extrabold text-white">Try again</button>
          </div>
        </div>
      )}
      {shelfOpen && <MyApps name={name} onClose={() => setShelfOpen(false)} />}
      {!shelfOpen && screen === 'welcome' && (
        <>
          <div className="flex items-center justify-end gap-2 px-3 pt-3"><span id="bwm-countdown-slot" className="mr-auto" /><button onClick={() => setShelfOpen(true)} className="rounded-full border-2 border-line bg-surface px-3 py-1 text-sm font-bold text-ink hover:border-accent">📚 My apps</button></div>
          <Welcome name={name} onChoose={mode => { setInputMode(mode); setScreen('profile'); }} />
        </>
      )}
      {!shelfOpen && screen === 'profile' && (
        <>
          <div className="flex items-center gap-2 pr-3"><div className="min-w-0 flex-1"><ProgressBar stage="intro" /></div><span id="bwm-countdown-slot" /></div>
          <ThemePick inputMode={inputMode} theme={theme} onThemeChange={setTheme} onDone={begin} busy={busy} />
          {error && <p role="alert" className="pb-6 text-center font-bold text-ink">{error.replace(/^LIMIT:/, '')}</p>}
        </>
      )}
      {/* The journey stays mounted under the shelf, so a build keeps going while it's open. */}
      {screen === 'guide' && profile && (
        <div className={shelfOpen ? 'hidden' : undefined}>
          <div ref={topBar} className="flex items-center gap-1 px-3">
            <button onClick={startOver}
              className="min-h-11 shrink-0 rounded-full border-2 border-line bg-surface px-3 py-1 text-sm font-bold text-ink hover:border-accent">＋ New app</button>
            <div className="min-w-0 flex-1"><ProgressBar stage={stage} /></div>
            <span id="bwm-countdown-slot" className="shrink-0" />
            <button onClick={() => setShelfOpen(true)}
              className="min-h-11 shrink-0 rounded-full border-2 border-line bg-surface px-3 py-1 text-sm font-bold text-ink hover:border-accent">📚 My apps</button>
          </div>
          {askNew && (
            <KidDialog title="Start a new app?"
              text={profile.ageGroup === 'kid' ? "This app isn't finished yet. It stays saved, but you won't come back to it here." : "This app isn't shipped yet. It stays saved, but you won't come back to it here."}
              yes="✨ Start a new app" no="Keep going" onYes={() => void goNew()} onNo={() => setAskNew(false)} />
          )}
          {GUIDE_STAGES.includes(stage) && (
            <GuideStage profile={profile} reply={reply} history={history} visual={visual} docs={docs} pane={pane} onPane={setPane}
              controls={controls} busy={busy} error={error} ideasOn={stage === 'idea'} onIdea={idea => turn(undefined, profile, false, idea)} onSend={text => (error && /^\W*(try (it |that )?again|again|retry)\b/i.test(text) ? turn(lastText, profile, true) : turn(text))} onRetry={() => turn(lastText, profile, true)} voiceOn={voiceOn} />
          )}
          {/* The Build screen stays mounted (hidden) on the Ship screen, so "Keep building" returns to the same chat. */}
          {(stage === 'build' || (stage === 'ship' && !!shipHtml)) && (
            <div className={stage === 'ship' ? 'hidden' : undefined}>
              <BuildScreen profile={profile} intro={techSummary ?? (reply?.say || undefined)} resume={resumeApp} controls={controls}
                onShip={html => { stopSpeaking(); setShipHtml(html); setStage('ship'); }} voiceOn={voiceOn && stage === 'build'} onPassEnded={onPassEnded} />
            </div>
          )}
          {stage === 'ship' && shipHtml && (
            <ShipScreen profile={profile} html={shipHtml} appEmojis={appEmojis} onBack={() => setStage('build')} onShipped={() => setShipped(true)} voiceOn={voiceOn} onPassEnded={onPassEnded} />
          )}
        </div>
      )}
    </div>
  );
}
