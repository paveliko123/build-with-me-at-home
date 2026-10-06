import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type ParentState } from './lib/api';
import { FirstRun } from './parent/FirstRun';
import { Opening } from './parent/Opening';
import { ParentHome } from './parent/ParentHome';
import './parent/parent.css';

// Routing: the laptop gets the parent side (first run → opening → home). Any other device
// without a pass sees "Ask your parent for a pass" (kid screens arrive with passes, slice 4).
type View = 'loading' | 'first-run' | 'new-pin' | 'opening' | 'home' | 'no-pass' | 'error';

export default function App() {
  const [view, setView] = useState<View>('loading');

  const refresh = useCallback(async () => {
    try {
      const s = await api<ParentState>('/api/parent/state');
      setView(!s.hasPin ? (s.kids > 0 ? 'new-pin' : 'first-run') : s.unlocked ? 'home' : 'opening');
    } catch (e) {
      setView(e instanceof ApiError && e.status === 403 ? 'no-pass' : 'error');
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="parent">
      {view === 'loading' && <main><p className="muted">Loading…</p></main>}
      {view === 'first-run' && <FirstRun onDone={refresh} />}
      {view === 'new-pin' && <FirstRun onDone={refresh} newPinOnly />}
      {view === 'opening' && <Opening onUnlocked={refresh} />}
      {view === 'home' && <ParentHome onLock={refresh} />}
      {view === 'no-pass' && (
        <div className="pinwrap"><div className="logo">🎟️</div><h1>Ask your parent for a pass</h1><p className="muted">Your parent can give you a pass from the computer. Then scan its QR code.</p></div>
      )}
      {view === 'error' && (
        <div className="pinwrap"><div className="logo">🔌</div><h1>Can't reach Build With Me</h1><p className="muted">Make sure it's running on the computer, then reload this page.</p></div>
      )}
    </div>
  );
}
