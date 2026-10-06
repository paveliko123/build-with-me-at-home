import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type ParentState } from './lib/api';
import { FirstRun } from './parent/FirstRun';
import { Opening } from './parent/Opening';
import { ParentHome } from './parent/ParentHome';
import { KidApp, PassOpen } from './kid/KidApp';
import './parent/parent.css';

// Routing: /p/<code> opens a pass; /kid is the kid side (the laptop uses it after "open on
// this laptop"). On / the laptop gets the parent side (first run → opening → home) and any
// other device gets the kid side (its pass, or "Ask your parent for a pass").
type View = 'loading' | 'first-run' | 'new-pin' | 'opening' | 'home' | 'kid' | 'error';

export default function App() {
  const passCode = location.pathname.match(/^\/p\/([A-Za-z0-9_-]{8,64})\/?$/)?.[1];
  if (passCode) return <div className="parent"><PassOpen code={passCode} /></div>;
  if (location.pathname.startsWith('/kid')) return <div className="parent"><KidApp /></div>;
  return <ParentApp />;
}

function ParentApp() {
  const [view, setView] = useState<View>('loading');

  const refresh = useCallback(async () => {
    try {
      const s = await api<ParentState>('/api/parent/state');
      setView(!s.hasPin ? (s.kids > 0 ? 'new-pin' : 'first-run') : s.unlocked ? 'home' : 'opening');
    } catch (e) {
      setView(e instanceof ApiError && e.status === 403 ? 'kid' : 'error');
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
      {view === 'kid' && <KidApp />}
      {view === 'error' && (
        <div className="pinwrap"><div className="logo">🔌</div><h1>Can't reach Build With Me</h1><p className="muted">Make sure it's running on the computer, then reload this page.</p></div>
      )}
    </div>
  );
}
