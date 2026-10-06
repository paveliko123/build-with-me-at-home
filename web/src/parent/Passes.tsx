import { useEffect, useState } from 'react';
import { api, ApiError, clock, timeOfDay, type ActivePass, type Kid } from '../lib/api';

// prd.md > Passes: 🎟️ Give a pass and ⏱️ Active passes (laid out like parent-mockup.html).

const PRESETS: { label: string; minutes: () => number }[] = [
  { label: '30 min', minutes: () => 30 },
  { label: '1 hour', minutes: () => 60 },
  { label: '2 hours', minutes: () => 120 },
  { label: 'Rest of today', minutes: () => { const end = new Date(); end.setHours(23, 59, 0, 0); return Math.max(1, Math.round((end.getTime() - Date.now()) / 60_000)); } },
];
const lengthText = (min: number) => min % 60 === 0 ? `${min / 60} hour${min === 60 ? '' : 's'}` : min > 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;

/** Ticks once a second so countdowns move. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return now;
}

export function GivePass({ kids, passes, shown, setShown, onAddKid, reload }: {
  kids: Kid[]; passes: ActivePass[]; shown: string | null; setShown: (id: string | null) => void; onAddKid: () => void; reload: () => void;
}) {
  const [kidId, setKidId] = useState<string | null>(kids[0]?.id ?? null);
  const [preset, setPreset] = useState<number | 'custom'>(1);
  const [custom, setCustom] = useState('45');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!kids.some((k) => k.id === kidId)) setKidId(kids[0]?.id ?? null); }, [kids, kidId]);

  const minutes = preset === 'custom' ? Number(custom) : PRESETS[preset].minutes();
  // After a reload the newest unopened pass shows again, so its code is never lost.
  const pass = shown === null
    ? [...passes].filter((p) => !p.usedAt).sort((a, b) => b.createdAt - a.createdAt)[0]
    : passes.find((p) => p.id === shown);

  const create = async (replace = false) => {
    if (!kidId) return;
    setBusy(true); setErr('');
    try {
      const p = await api<ActivePass>('/api/parent/passes', { body: { kidId, minutes, replace } });
      setShown(p.id); reload();
    } catch (e) {
      if (e instanceof ApiError && e.body?.code === 'kid-has-pass') {
        const name = kids.find((k) => k.id === kidId)?.nickname ?? 'This kid';
        if (confirm(`${name} already has a pass until ${timeOfDay(e.body.endsAt)}. End it and make a new one?`)) { setBusy(false); return create(true); }
      } else setErr((e as Error).message);
    }
    setBusy(false);
  };

  if (!kids.length) return <div className="card"><h2>🎟️ Give a pass</h2><div className="empty">Add a kid first. <button className="ghost" onClick={onAddKid}>＋ Add a kid</button></div></div>;

  return (
    <div className="card">
      <h2>🎟️ Give a pass</h2>
      <p className="label">Who?</p>
      <div className="kidpick">
        {kids.map((k) => (
          <button key={k.id} className="kidbtn" aria-pressed={k.id === kidId} onClick={() => setKidId(k.id)}>
            <span className="em">{k.emoji}</span><b>{k.nickname}</b> <span className={`pill ${k.group === 'teen' ? 't' : 'k'}`}>{k.group === 'teen' ? 'Teen' : 'Kid'}</span>
          </button>
        ))}
        <button className="kidbtn" style={{ borderStyle: 'dashed' }} onClick={onAddKid}><span className="em">＋</span><span className="muted">Add a kid</span></button>
      </div>
      <p className="label">For how long?</p>
      <div className="dur">
        {PRESETS.map((p, i) => <button key={p.label} aria-pressed={preset === i} onClick={() => setPreset(i)}>{p.label}</button>)}
        <span className="muted">or</span>
        <input type="number" min={1} max={1440} value={custom} aria-label="custom minutes" onFocus={() => setPreset('custom')} onChange={(e) => { setCustom(e.target.value); setPreset('custom'); }} />
        <span className="muted">min</span>
      </div>
      <button className="btn" disabled={busy || !kidId || !(minutes >= 1 && minutes <= 1440)} onClick={() => create()}>Create pass</button>
      <p className="err">{err}</p>
      {pass && <PassCode pass={pass} onClose={() => setShown('hidden')} />}
    </div>
  );
}

function PassCode({ pass, onClose }: { pass: ActivePass; onClose: () => void }) {
  const name = pass.kid?.nickname ?? 'Your kid';
  if (pass.usedAt) {
    return <div className="qrbox"><div>✅ <b>{name}'s pass is open</b> on {pass.device ?? 'a device'}. <button className="ghost" onClick={onClose}>OK</button></div></div>;
  }
  return (
    <div className="qrbox">
      {pass.qr && <img className="qr" src={pass.qr} alt={`QR code for ${name}'s pass`} />}
      <div style={{ flex: 1, minWidth: 240 }}>
        <div className="top" style={{ marginBottom: 6 }}><b>{name}'s pass · {lengthText(pass.minutes)}</b><button className="ghost" onClick={onClose}>Hide</button></div>
        <p className="label" style={{ margin: '8px 0 6px' }}>Open it on one device</p>
        {pass.qr && <div className="way">📱 <span><b>Tablet or phone:</b> scan the code with the camera</span></div>}
        <div className="way">💻 <span><b>This laptop:</b> <a className="btn" style={{ display: 'inline-block', textDecoration: 'none', padding: '6px 12px', margin: '2px 4px' }} href={pass.laptopUrl} target="_blank" rel="noopener">Open on this laptop</a><span className="muted" style={{ fontSize: 13 }}>(locks the parent area here)</span></span></div>
        {pass.typeAt && <div className="way">🧑‍💻 <span><b>Kid's own laptop or Chromebook</b> (not this one): open <code>{pass.typeAt}</code> and type <span className="typed">{pass.typedCode}</span></span></div>}
        <span className="muted" style={{ fontSize: 13, display: 'block', marginTop: 8 }}>One use only: the first device that opens it gets the pass. Works on home Wi-Fi until {timeOfDay(pass.endsAt)}. A device that isn't set up for talking may show a security warning first: set it up with 📱 below.</span>
      </div>
    </div>
  );
}

export function ActivePasses({ passes, onShow, reload }: { passes: ActivePass[]; onShow: (id: string) => void; reload: () => void }) {
  const now = useNow();
  const act = async (p: ActivePass, what: 'extend' | 'end', minutes?: number) => {
    if (what === 'end' && !confirm(`End ${p.kid?.nickname ?? 'this'}'s pass now? Their work is saved.`)) return;
    await api(`/api/parent/passes/${p.id}/${what}`, { body: minutes ? { minutes } : {} }).catch((e) => alert((e as Error).message));
    reload();
  };
  return (
    <div className="card">
      <h2>⏱️ Active passes</h2>
      {!passes.length && <div className="empty">No active passes.</div>}
      {passes.map((p) => {
        const left = p.endsAt - now;
        return (
          <div className="passrow" key={p.id}>
            <div>
              <b>{p.kid?.emoji} {p.kid?.nickname ?? 'Removed kid'}</b> {p.kid && <span className={`pill ${p.kid.group === 'teen' ? 't' : 'k'}`}>{p.kid.group === 'teen' ? 'Teen' : 'Kid'}</span>}{' '}
              <span className="muted">· {p.usedAt ? <>{p.device} · {p.step ?? 'Welcome'}</> : <>not opened yet · <a href="#" onClick={(e) => { e.preventDefault(); onShow(p.id); }}>show code</a></>}</span>
              <div className={`time${left <= 10 * 60_000 ? ' low' : ''}`}>{clock(left)} left</div>
            </div>
            <div className="acts">
              <button className="ghost" onClick={() => act(p, 'extend', 30)}>+30 min</button>
              <button className="ghost" onClick={() => act(p, 'extend', 60)}>+1 hr</button>
              <button className="ghost danger" onClick={() => act(p, 'end')}>End now</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
