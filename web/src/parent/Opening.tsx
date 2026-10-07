import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type ParentState } from '../lib/api';
import { chime, urgentTitle } from './urgent';
import { PinPad, RESPONSIBILITY } from './PinPad';

// prd.md > Parent Gate and Responsibility: the note, then the PIN, then Enter.
export function Opening({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState('');
  // Safety review: a wellbeing alert shows here too, with a chime, so a locked Parent area can't
  // hide it (checked every 15 seconds while this page is open).
  const [urgent, setUrgent] = useState(0);
  const heard = useRef(0);
  useEffect(() => {
    const look = () => api<ParentState>('/api/parent/state').then((s) => {
      const n = s.urgent ?? 0;
      if (n > heard.current) chime();
      heard.current = n; setUrgent(n); urgentTitle(n);
    }).catch(() => {});
    void look();
    const t = window.setInterval(() => void look(), 15_000);
    return () => { window.clearInterval(t); urgentTitle(0); };
  }, []);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // UI review P6: the parent area locks itself when a kid's pass opens on this laptop; say so.
  const [lockedBy] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem('bwm-locked-by') ?? 'null'); return v && Date.now() - v.at < 12 * 60 * 60_000 ? String(v.name) : null; } catch { return null; }
  });

  const enter = async () => {
    if (busy || pin.length < 4) return;
    setBusy(true); setErr('');
    try {
      await api('/api/parent/unlock', { body: { pin } });
      try { localStorage.removeItem('bwm-locked-by'); } catch { /* fine */ }
      onUnlocked();
    } catch (e) {
      const b = e instanceof ApiError ? e.body : null;
      if (b?.reason === 'locked') setErr(`Too many wrong tries, so the PIN pad is paused. Wait ${b.seconds} seconds, then try again.`);
      else if (b?.reason === 'wrong') setErr(`That's not the PIN. ${b.triesLeft} ${b.triesLeft === 1 ? 'try' : 'tries'} left.`);
      else setErr('Something went wrong. Try again.');
      setPin('');
    } finally { setBusy(false); }
  };

  // Family trial: one screen without scrolling. On a laptop the note sits beside the PIN pad;
  // on a phone they stack.
  return (
    <div className="pinwrap split">
      <div className="brandside">
        <div className="logo">🛠️✨</div>
        <h1>Build With Me at Home</h1>
        <div className="resp">{RESPONSIBILITY}</div>
        <div className="keepopen" role="note">⚠️ <b>Keep this window open while your kids use Build With Me.</b> Closing it stops the app about a minute later, on tablets too.</div>
      </div>
      <div className="padside">
        {urgent > 0 && <p className="urgent" role="alert">💛 <b>One of your kids may need you.</b> Enter your PIN to see the alert.</p>}
        {lockedBy && <p className="muted" style={{ fontWeight: 600, margin: '0 0 4px' }}>🔒 Locked because {lockedBy}'s pass was opened on this laptop.</p>}
        <p className="muted" style={{ margin: 0 }}>Grown-ups only. Enter your parent PIN.</p>
        <PinPad value={pin} onChange={setPin} onEnter={enter} />
        <p className="err" role="alert">{err}</p>
        <button className="btn" style={{ width: 240 }} disabled={busy || pin.length < 4} onClick={enter}>Enter</button>
        <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>Forgot your PIN? In Claude Code, run <code>/build-with-me:reset-pin</code>.</p>
      </div>
    </div>
  );
}
