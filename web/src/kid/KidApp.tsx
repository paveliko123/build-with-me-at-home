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

  // Live updates for this pass (extended, ended). A dropped stream for more than ~8 s
  // shows "Can't reach"; it clears itself when the computer is back.
  const live = s && typeof s === 'object' && s.state === 'live';
  useEffect(() => {
    if (!live) return;
    const es = new EventSource('/api/events');
    let timer: number | undefined;
    es.addEventListener('pass', (ev) => { const v = JSON.parse((ev as MessageEvent).data) as KidSessionView; setOffset(v.now - Date.now()); setS(v); });
    es.addEventListener('hello', () => { if (timer) { clearTimeout(timer); timer = undefined; } setLost(false); });
    es.onerror = () => { timer ??= window.setTimeout(() => setLost(true), 8000); };
    return () => { es.close(); if (timer) clearTimeout(timer); };
  }, [live]);

  if (s === null) return <div className="parent"><div className="kidwrap"><p className="muted">Loading…</p></div></div>;
  if (s === 'unreachable') return <div className="parent"><CantReach /></div>;
  if (s === 'none') return <div className="parent"><NoPass onOpened={load} /></div>;
  if (s.state === 'over') return <div className="parent"><TimesUp name={s.kid.nickname} onOpened={load} /></div>;
  return (
    <>
      <Journey name={s.kid.nickname} onPassEnded={load} />
      <Countdown endsAt={s.endsAt} offset={offset} onZero={load} />
      {lost && <div className="bwm-overlay"><div className="parent"><CantReach /></div></div>}
    </>
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
    try { await api('/api/pass/open', { body: { code } }); location.replace('/kid'); }
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
      <p className="muted">Good until {timeOfDay(peek.endsAt)}. Only one device can use it.</p>
      <button className="bigbtn" onClick={start} disabled={busy}>Start</button>
      <p className="err">{err}</p>
    </div>
  );
}
