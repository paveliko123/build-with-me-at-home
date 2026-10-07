import { THEMES, themeStyle } from './journey/themes/themes';
import type { ThemeId } from './journey/types';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, clock, timeOfDay, type KidSessionView, type PassPeek } from '../lib/api';
import { useNow } from '../parent/Passes';
import Journey from './journey/Journey';

// The kid's side behind a pass (prd.md > Passes, States and Boundaries): no pass → ask a parent
// (or type a code); live → the journey (themed, ./journey) with a countdown from 10 minutes;
// over → Time's up; server gone → Can't reach the computer. The simple screens use the
// parent-side styles (.parent); the journey brings its own theme.

const OPEN_ERRORS: Record<string, string> = {
  used: 'This pass was already used — ask your parent for a new one.',
  over: 'That pass has ended. Ask your parent for a new one.',
  unknown: "That code didn't work. Check it with your parent.",
  'not-home': 'Passes only work at home, on your home Wi-Fi.',
};
const openError = (e: unknown) => e instanceof ApiError
  ? (e.body?.error === 'wait' ? `Too many tries. Wait ${e.body.seconds} seconds, then try again.` : OPEN_ERRORS[e.body?.error] ?? 'Something went wrong. Try again.')
  : "Can't reach the computer — ask your parent to start Build With Me.";

export function KidApp() {
  const [s, setS] = useState<KidSessionView | null | 'none' | 'unreachable'>(null);
  const [offset, setOffset] = useState(0); // server clock − this device's clock
  const [lost, setLost] = useState(false);
  const [closing, setClosing] = useState<(NonNullable<Closing> & { at: number }) | null>(null);

  const load = useCallback(async () => {
    try {
      const v = await api<KidSessionView>('/api/kid/session');
      setOffset(v.now - Date.now()); setS(v); setLost(false);
    } catch (e) {
      setS(e instanceof ApiError && e.status === 401 ? 'none' : 'unreachable');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Retry while the computer can't be reached.
  useEffect(() => {
    if (s !== 'unreachable') return;
    const t = setInterval(load, 5000); return () => clearInterval(t);
  }, [s, load]);

  // Coming back to the tab (or the tablet waking up): check the pass again (UI review K3).
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [load]);

  // Live updates for this pass (extended, ended). A dropped stream for more than ~8 s
  // shows "Can't reach"; it clears itself when the computer is back.
  const live = s && typeof s === 'object' && s.state === 'live';
  useEffect(() => {
    if (!live) return;
    const es = new EventSource('/api/events?as=kid');
    let timer: number | undefined;
    es.addEventListener('pass', (ev) => { const v = JSON.parse((ev as MessageEvent).data) as KidSessionView; setOffset(v.now - Date.now()); setS(v); });
    es.addEventListener('hello', () => { if (timer) { clearTimeout(timer); timer = undefined; } setLost(false); });
    es.addEventListener('closing', (ev) => { const c = JSON.parse((ev as MessageEvent).data) as Closing; setClosing(c ? { ...c, at: Date.now() } : null); });
    es.onerror = () => { timer ??= window.setTimeout(() => setLost(true), 8000); };
    return () => { es.close(); if (timer) clearTimeout(timer); };
  }, [live]);

  if (s === null) return <KidShell><div className="kidwrap"><p className="muted">Loading…</p></div></KidShell>;
  if (s === 'unreachable') return <KidShell><CantReach /></KidShell>;
  if (s === 'none') return <KidShell><NoPass onOpened={load} /></KidShell>;
  if (s.state === 'over') return <KidShell><TimesUp name={s.kid.nickname} onOpened={load} /></KidShell>;
  return (
    <>
      <Journey name={s.kid.nickname} onPassEnded={load} />
      <Countdown endsAt={s.endsAt} offset={offset} onZero={load} />
      {closing && !lost && <ClosingNotice closing={closing} />}
      {lost && <div className="bwm-overlay"><KidShell><CantReach /></KidShell></div>}
    </>
  );
}

type Closing = null | { seconds: number } | { waiting: true };

/** The parent closed their window on the laptop: Build With Me stops soon (learner request). */
function ClosingNotice({ closing }: { closing: NonNullable<Closing> & { at: number } }) {
  const now = useNow();
  const left = 'seconds' in closing ? Math.max(0, Math.ceil(closing.seconds - (now - closing.at) / 1000)) : null;
  return (
    <div className="bwm-closing" role="alert">
      <b>⏳ Your grown-up closed Build With Me on the laptop.</b>{' '}
      {left === null ? 'It will stop as soon as it finishes what it’s doing.' : <>It will stop in <b>{left} seconds</b>.</>}{' '}
      Everything is saved.
    </div>
  );
}

function Countdown({ endsAt, offset, onZero }: { endsAt: number; offset: number; onZero: () => void }) {
  const now = useNow() + offset;
  const left = endsAt - now;
  const fired = useRef(false);
  useEffect(() => { if (left <= 0 && !fired.current) { fired.current = true; onZero(); } if (left > 0) fired.current = false; }, [left, onZero]);
  if (left > 10 * 60_000 || left <= 0) return null;
  // In the screen's top bar when it has a spot for it (never over Send or the answer box);
  // otherwise in the top corner.
  const found = document.getElementById('bwm-countdown-slot');
  const slot = found && found.offsetParent !== null ? found : null; // not a hidden screen's (My apps open)
  const pill = <div className={`bwm-countdown${slot ? ' in-bar' : ''}`} role="timer" aria-live="off">⏰ {clock(left)} left</div>;
  return slot ? createPortal(pill, slot) : pill;
}

export function CodeEntry({ onOpened }: { onOpened: () => void }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const raw = code.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
  const shown = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
  const go = async () => {
    setBusy(true); setErr('');
    try { await api('/api/pass/open', { body: { code: raw } }); onOpened(); }
    catch (e) { setErr(openError(e)); }
    setBusy(false);
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (raw.length === 8) go(); }} style={{ marginTop: 10 }}>
      <input className="codein" value={shown} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX" aria-label="pass code" autoComplete="off" autoCapitalize="characters" spellCheck={false} />
      <div><button className="bigbtn" disabled={busy || raw.length !== 8}>Go</button></div>
      <p className="err">{err}</p>
    </form>
  );
}

function NoPass({ onOpened }: { onOpened: () => void }) {
  return (
    <div className="kidwrap">
      <div className="bigemoji">🎟️</div>
      <h1>Ask your parent for a pass</h1>
      <p className="muted">Scan the pass QR code with the camera, or type the code here.</p>
      <div className="kidcard"><CodeEntry onOpened={onOpened} /></div>
    </div>
  );
}

function TimesUp({ name, onOpened }: { name: string; onOpened: () => void }) {
  return (
    <div className="kidwrap">
      <div className="bigemoji">🌙</div>
      <h1>Time's up!</h1>
      <p style={{ fontSize: 18 }}>Great work, {name}. Everything is saved.</p>
      <div className="kidcard"><p className="muted" style={{ margin: 0 }}>Got a new pass code?</p><CodeEntry onOpened={onOpened} /></div>
    </div>
  );
}

function CantReach() {
  return (
    <div className="kidwrap">
      <div className="bigemoji">🔌</div>
      <h1>Can't reach the computer</h1>
      <p className="muted">Ask your parent to start Build With Me (and keep the computer awake). This page will reconnect by itself.</p>
    </div>
  );
}

/** The simple kid screens (pass, Time's up, no pass, can't reach) in the kid's own look: the
 *  theme they used last, big friendly type (UI review K7: they used the parent's grey styles). */
export function KidShell({ children }: { children: React.ReactNode }) {
  let theme: ThemeId = 'space';
  try { const t = localStorage.getItem('bwm-last-theme'); if (t && THEMES.some((x) => x.id === t)) theme = t as ThemeId; } catch { /* default */ }
  return <div className="parent kidsimple bwm-journey" style={themeStyle(theme)}>{children}</div>;
}

/** /p/<code>: shows whose pass it is, and uses it up only when the kid taps Start. */
export function PassOpen({ code }: { code: string }) {
  const [peek, setPeek] = useState<PassPeek | null | 'unreachable'>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<PassPeek>(`/api/pass/peek/${encodeURIComponent(code)}`).then((p) => {
      if (p.state === 'mine') location.replace('/kid'); else setPeek(p);
    }).catch(() => setPeek('unreachable'));
  }, [code]);
  const start = async () => {
    setBusy(true); setErr('');
    try {
      await api('/api/pass/open', { body: { code } });
      // The parent area on this laptop locks itself; the PIN screen says why (UI review P6).
      if (['localhost', '127.0.0.1'].includes(location.hostname)) try { localStorage.setItem('bwm-locked-by', JSON.stringify({ name: peek && peek !== 'unreachable' && peek.state === 'ready' ? peek.kid.nickname : 'a kid', at: Date.now() })); } catch { /* fine */ }
      location.replace('/kid');
    }
    catch (e) { setErr(openError(e)); setBusy(false); }
  };
  if (peek === null) return <div className="kidwrap"><p className="muted">Loading…</p></div>;
  if (peek === 'unreachable') return <CantReach />;
  if (peek.state === 'used') return <div className="kidwrap"><div className="bigemoji">🙈</div><h1>This pass was already used</h1><p className="muted">Ask your parent for a new one.</p></div>;
  if (peek.state === 'over') return <div className="kidwrap"><div className="bigemoji">🌙</div><h1>This pass has ended</h1><p className="muted">Ask your parent for a new one.</p></div>;
  if (peek.state !== 'ready') return <div className="kidwrap"><div className="bigemoji">🤔</div><h1>That pass link doesn't work</h1><p className="muted">Ask your parent for a new pass.</p></div>;
  return (
    <div className="kidwrap">
      <div className="bigemoji">{peek.kid.emoji}</div>
      <h1>{peek.kid.nickname}'s pass 🎟️</h1>
      <p className="muted">This pass is yours until {timeOfDay(peek.endsAt)}. Tap Start on the device you'll use.</p>
      <button className="bigbtn" onClick={start} disabled={busy}>Start</button>
      <p className="err">{err}</p>
    </div>
  );
}
