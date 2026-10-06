import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { PinPad, RESPONSIBILITY } from './PinPad';

// prd.md > Parent Gate and Responsibility: the note, then the PIN, then Enter.
export function Opening({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const enter = async () => {
    if (busy || pin.length < 4) return;
    setBusy(true); setErr('');
    try {
      await api('/api/parent/unlock', { body: { pin } });
      onUnlocked();
    } catch (e) {
      const b = e instanceof ApiError ? e.body : null;
      if (b?.reason === 'locked') setErr(`Too many tries. Wait ${b.seconds} seconds.`);
      else if (b?.reason === 'wrong') setErr(`That's not the PIN. ${b.triesLeft} ${b.triesLeft === 1 ? 'try' : 'tries'} left.`);
      else setErr('Something went wrong. Try again.');
      setPin('');
    } finally { setBusy(false); }
  };

  return (
    <div className="pinwrap">
      <div className="logo">🛠️✨</div>
      <h1>Build With Me at Home</h1>
      <div className="resp">{RESPONSIBILITY}</div>
      <p className="muted">Grown-ups only. Enter your parent PIN.</p>
      <PinPad value={pin} onChange={setPin} onEnter={enter} />
      <p className="err" role="alert">{err}</p>
      <button className="btn" style={{ width: 240 }} disabled={busy || pin.length < 4} onClick={enter}>Enter</button>
      <p className="muted" style={{ fontSize: 13, marginTop: 18 }}>Forgot your PIN? In Claude Code, run <code>/build-with-me:reset-pin</code>.</p>
    </div>
  );
}
