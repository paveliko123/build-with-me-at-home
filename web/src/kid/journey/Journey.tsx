// The kid's journey behind a pass (prd.md > The Kid's Journey): Welcome → Theme → Start, Idea,
// Design and Tech plan with the guide. Ported from Build With Me's App.tsx: the project lives
// on the family's computer (one unfinished project per kid, resumed by the next pass), so
// there's no project ID in the browser. Build and Ship arrive in slice 6.
import { useEffect, useRef, useState } from 'react';
import ProgressBar from './components/ProgressBar';
import Thinking from './components/Thinking';
import GuideStage, { type Line, type Pane } from './screens/GuideStage';
import ThemePick, { type ProfileChoice } from './screens/ThemePick';
import Welcome from './screens/Welcome';
import { getJourney, guideTurn, limitMessage, newApp, passEnded, startJourney } from './lib/api';
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
  const [error, setError] = useState<string | null>(null);
  const [lastText, setLastText] = useState<string | undefined>(undefined);
  const started = useRef(false);

  function resume(s: SessionSnapshot) {
    setProfile(s.profile);
    setVoiceOn(s.profile.inputMode === 'talk');
    voiceRef.current = s.profile.inputMode === 'talk';
    setTheme(s.profile.theme);
    setStage(s.stage);
    setReply(s.reply);
    setDocs(Object.fromEntries(s.docs.map(d => [d.kind, d])));
    if (s.doc) setPane(s.doc.kind);
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
    setStage(r.stage);
    if (r.reply.visualHtml) { setVisual(r.reply.visualHtml); setPane('picture'); }
    const doc = r.reply.doc;
    if (doc) { setDocs(d => ({ ...d, [doc.kind]: doc })); setPane(doc.kind); }
  }

  async function turn(text?: string, who: ProfileT | null = profile, retry = false) {
    setBusy(true);
    setError(null);
    setLastText(text);
    // Echo the answer (card picks included) under the question it answers.
    if (text && !retry) setHistory(h => [...h, ...(reply ? [{ from: 'guide' as const, text: guideLine(reply) }] : []), { from: 'me', text }]);
    try {
      let result = await guideTurn(text);
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
      setError(limitMessage(err) ?? String(err));
      setBusy(false);
    }
  }

  async function startOver() {
    if (!window.confirm('Start a new app? This one is saved for your parent, but you won\'t come back to it.')) return;
    stopSpeaking();
    await newApp().catch(() => {});
    window.location.reload();
  }

  return (
    <div style={themeStyle(theme)} className="bwm-journey min-h-screen bg-bg text-ink">
      {screen === 'loading' && <div className="flex min-h-screen items-center justify-center"><Thinking theme={theme} big /></div>}
      {screen === 'welcome' && <Welcome name={name} onChoose={mode => { setInputMode(mode); setScreen('profile'); }} />}
      {screen === 'profile' && (
        <>
          <ProgressBar stage="intro" />
          <ThemePick inputMode={inputMode} theme={theme} onThemeChange={setTheme} onDone={begin} busy={busy} />
          {error && <p className="pb-6 text-center font-bold text-ink">{error.replace(/^LIMIT:/, '')}</p>}
        </>
      )}
      {screen === 'guide' && profile && (
        <>
          {/* z-30: above the screens below, so the voice menu opens over the picture pane. */}
          <div className="relative z-30">
            <button onClick={() => void startOver()}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border-2 border-line bg-surface px-3 py-1 text-sm font-bold text-ink hover:border-accent">＋ New app</button>
            <ProgressBar stage={stage} />
            {voiceSupported() && (
              <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
                {voiceOn && (
                  <div className="relative">
                    <button onClick={() => setVoiceMenu(m => !m)} aria-expanded={voiceMenu} aria-label="Voice settings"
                      className="rounded-full border-2 border-line bg-surface px-2.5 py-1 text-sm font-bold text-ink hover:border-accent">⚙️</button>
                    {voiceMenu && (
                      <div className="absolute right-0 top-full z-30 mt-2 flex w-56 flex-col gap-2 rounded-2xl border-2 border-line bg-surface p-3 shadow-lg">
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
              </div>
            )}
          </div>
          {GUIDE_STAGES.includes(stage) && (
            <GuideStage profile={profile} reply={reply} history={history} visual={visual} docs={docs} pane={pane} onPane={setPane}
              busy={busy} error={error} onSend={text => (error && /^\W*(try (it |that )?again|again|retry)\b/i.test(text) ? turn(lastText, profile, true) : turn(text))} onRetry={() => turn(lastText, profile, true)} voiceOn={voiceOn} />
          )}
          {!GUIDE_STAGES.includes(stage) && (
            <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
              <div className="text-7xl" aria-hidden>🏗️</div>
              <h1 className="text-3xl font-extrabold">Your plan is ready!</h1>
              {reply?.techSummary && <p className="rounded-2xl bg-accent-soft px-5 py-3 text-xl font-bold">🛠️ {reply.techSummary}</p>}
              <p className="text-lg text-muted">Building your app comes next. It's saved, so you'll start right here next time.</p>
            </main>
          )}
        </>
      )}
    </div>
  );
}
