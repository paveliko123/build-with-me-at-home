import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { PinPad, RESPONSIBILITY } from './PinPad';

// prd.md > Parent Gate and Responsibility: the note, then the PIN, then Enter.
export function Opening({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState('');
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
