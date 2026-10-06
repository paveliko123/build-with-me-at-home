import { useCallback, useEffect, useState } from 'react';
import { api, type ActivePass, type Kid, type Status } from '../lib/api';
import { ActivePasses, GivePass } from './Passes';
import { KidForm } from './KidForm';
import { PinPad } from './PinPad';

// prd.md > Screens and Layout (parent home), laid out like devpost/parent-mockup.html.
// Reports (slice 7) plug into the cards marked below. Passes update live over SSE.
export function ParentHome({ onLock }: { onLock: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [modal, setModal] = useState<'kids' | 'tablet' | 'settings' | null>(null);
  const [passes, setPasses] = useState<ActivePass[]>([]);
  const [shown, setShown] = useState<string | null>(null);

  const loadKids = useCallback(() => api<Kid[]>('/api/parent/kids').then(setKids).catch(() => onLock()), [onLock]);
  useEffect(() => {
    loadKids();
    api<Status>('/api/parent/status').then(setStatus).catch(() => setStatus({ claude: { found: false, signedIn: false } }));
  }, [loadKids]);

  const loadPasses = useCallback(() => api<ActivePass[]>('/api/parent/passes').then(setPasses).catch(() => onLock()), [onLock]);
  useEffect(() => {
    loadPasses();
    const es = new EventSource('/api/events');
    es.addEventListener('passes', () => loadPasses());
    // The countdowns tick locally; this catches anything missed while the stream reconnects.
    const t = setInterval(loadPasses, 60_000);
    return () => { es.close(); clearInterval(t); };
  }, [loadPasses]);

  const lock = async () => { await api('/api/parent/lock', { body: {} }).catch(() => {}); onLock(); };
  const now = new Date();

  return (
    <main>
      <div className="top">
        <div><h1>Hi! 👋</h1><span className="muted">Parent area · {now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ghost" onClick={() => setModal('settings')}>⚙️ Settings</button>
          <button className="ghost" onClick={lock}>🔒 Lock</button>
        </div>
      </div>

      <StatusStrip status={status} />

      <div className="grid">
        <div className="stack">
          <GivePass kids={kids} passes={passes} shown={shown} setShown={setShown} onAddKid={() => setModal('kids')} reload={loadPasses} />
          <ActivePasses passes={passes} onShow={setShown} reload={loadPasses} />
        </div>
        <div className="stack">
          <div className="card">
            <h2>🔔 Needs your attention</h2>
            <div className="empty">Nothing right now.</div>
          </div>
          <div className="card">
            <h2>📄 Latest reports</h2>
            <div className="empty">Reports appear after your kids finish an app.</div>
          </div>
          <div className="card">
            <h2>🧒 Kids &amp; their apps</h2>
            {kids.map((k) => (
              <div className="row" key={k.id}>
                <div>{k.emoji} <b>{k.nickname}</b> <span className={`pill ${k.group === 'teen' ? 't' : 'k'}`}>{k.group === 'teen' ? 'Teen' : 'Kid'}</span><br /><span className="muted">0 apps</span></div>
                <button className="ghost" onClick={() => setModal('kids')}>Manage</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <button className="ghost" onClick={() => setModal('kids')}>＋ Add a kid</button>
              <button className="ghost" onClick={() => setModal('tablet')}>📱 Set up a tablet or laptop for talking</button>
            </div>
          </div>
        </div>
      </div>

      {modal === 'kids' && <KidsManage kids={kids} reload={loadKids} onClose={() => setModal(null)} />}
      {modal === 'tablet' && <TabletSetup onClose={() => setModal(null)} />}
      {modal === 'settings' && <Settings onClose={() => setModal(null)} />}
    </main>
  );
}

function pctClass(p?: number) { return p === undefined ? '' : p >= 85 ? 'high' : p >= 60 ? 'mid' : ''; }

function StatusStrip({ status }: { status: Status | null }) {
  const u = status?.usage;
  return (
    <div className="status">
      <div className="card stat"><b>Claude Code</b>
        {!status ? <span className="muted">Checking…</span>
          : !status.claude.found ? <span className="pill bad">Not found: run /build-with-me:setup</span>
          : !status.claude.signedIn ? <span className="pill bad">Signed out: run claude, then /login</span>
          : <span className="pill ok">✓ Signed in{status.claude.subscription ? ' · subscription' : ''}</span>}
      </div>
      <div className="card stat"><b>5-hour limit</b>
        {u?.fiveHourPct !== undefined ? <><div className="meter"><i className={pctClass(u.fiveHourPct)} style={{ width: `${u.fiveHourPct}%` }} /></div><span className="muted">{u.fiveHourPct}% used{u.fiveHourResets ? ` · resets ${u.fiveHourResets}` : ''}</span></> : <span className="muted">{status ? 'Not available' : 'Checking…'}</span>}
      </div>
      <div className="card stat"><b>Weekly limit</b>
        {u?.weeklyPct !== undefined ? <><div className="meter"><i className={pctClass(u.weeklyPct)} style={{ width: `${u.weeklyPct}%` }} /></div><span className="muted">{u.weeklyPct}% used{u.weeklyResets ? ` · resets ${u.weeklyResets}` : ''}</span></> : <span className="muted">{status ? 'Not available' : 'Checking…'}</span>}
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card" role="dialog" aria-label={title}>
        <div className="top" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>{title}</h2><button className="ghost" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

function KidsManage({ kids, reload, onClose }: { kids: Kid[]; reload: () => void; onClose: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState('');
  return (
    <Modal title="🧒 Kids & their apps" onClose={onClose}>
      {kids.map((k) => editing === k.id ? (
        <div key={k.id} className="card" style={{ margin: '8px 0' }}>
          <KidForm initial={k} submitLabel="Save" onCancel={() => setEditing(null)} onSubmit={async (d) => { await api(`/api/parent/kids/${k.id}`, { method: 'PUT', body: d }); setEditing(null); reload(); }} />
        </div>
      ) : (
        <div className="row" key={k.id}>
          <div>{k.emoji} <b>{k.nickname}</b> <span className={`pill ${k.group === 'teen' ? 't' : 'k'}`}>{k.group === 'teen' ? 'Teen' : 'Kid'}</span></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="ghost" onClick={() => setEditing(k.id)}>Edit</button>
            <button className="ghost danger" onClick={async () => {
              if (!confirm(`Remove ${k.nickname}? Their apps and reports stay in the folder.`)) return;
              try { await api(`/api/parent/kids/${k.id}`, { method: 'DELETE' }); setErr(''); reload(); } catch (e) { setErr((e as Error).message); }
            }}>Remove</button>
          </div>
        </div>
      ))}
      <p className="err">{err}</p>
      <h2 style={{ marginTop: 10 }}>Add a kid</h2>
      <KidForm submitLabel="Add" onSubmit={async (d) => { await api('/api/parent/kids', { body: d }); reload(); }} />
    </Modal>
  );
}

function TabletSetup({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<{ url: string | null; qr: string | null; certificateName?: string } | null>(null);
  useEffect(() => { api('/api/parent/tablet-setup').then(setInfo).catch(() => setInfo({ url: null, qr: null })); }, []);
  return (
    <Modal title="📱 Set up a tablet or laptop for talking" onClose={onClose}>
      <b>What this does, and why</b>
      <ul className="explain">
        <li><b>Goal:</b> your kid can <b>talk</b> to Claude on a tablet, phone, laptop or Chromebook, not only type.</li>
        <li><b>Why a setup step:</b> browsers only allow the microphone on <b>secure</b> pages. A secure page needs that device to trust this computer.</li>
        <li><b>What you install:</b> a small <b>home certificate</b>{info?.certificateName ? <> called <b>{info.certificateName}</b></> : null}. It only works inside your home network and can't vouch for any real website. Only you can approve it, in the device's Settings.</li>
        <li><b>Heads-up:</b> when the device opens the link, the browser warns that the site <b>"doesn't support a secure connection"</b> or shows <b>"Not secure"</b>. That's expected for this one setup page: tap <b>Continue to site</b>. Kids' pages are secure once setup is done.</li>
        <li><b>How long:</b> once per device, about 2 minutes. A step-by-step guide opens and ends with a ✅ check.</li>
      </ul>
      {!info ? <p className="muted">Loading…</p> : info.url ? (
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <img className="qr" src={info.qr!} alt="QR code for the device setup page" />
          <div><b>Tablet or phone:</b> scan with the camera.<br /><b>Laptop or Chromebook:</b> type this in the browser:<br /><code>{info.url}</code>
            <p className="muted" style={{ fontSize: 13 }}>The device must be on the same Wi-Fi. If it can't open the page, allow Node.js on <b>private networks</b> in the Windows firewall.</p></div>
        </div>
      ) : <p className="err">This computer doesn't seem to be on a home network right now.</p>}
      <p className="muted" style={{ fontSize: 13 }}>Without this setup, kids can still type, or talk with the device's own dictation: the keyboard's 🎤 on tablets, Win+H on Windows, Fn Fn on a Mac, Search+D on a Chromebook. School Chromebooks usually block this setup.</p>
    </Modal>
  );
}

function Settings({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'cur' | 'next'>('cur');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const save = async () => {
    try { await api('/api/parent/pin', { body: { current: cur, next } }); setMsg('✅ PIN changed.'); setCur(''); setNext(''); setStep('cur'); }
    catch (e: any) { setMsg(e?.body?.reason === 'wrong' ? 'The current PIN was wrong.' : e.message); setStep('cur'); setCur(''); setNext(''); }
  };
  return (
    <Modal title="⚙️ Settings" onClose={onClose}>
      <h2>Change PIN</h2>
      <div style={{ textAlign: 'center' }}>
        <p>{step === 'cur' ? 'Current PIN' : 'New PIN (4 to 8 digits)'}</p>
        {step === 'cur' ? <PinPad value={cur} onChange={setCur} onEnter={() => cur.length >= 4 && setStep('next')} /> : <PinPad value={next} onChange={setNext} onEnter={save} />}
        <p className="err">{msg}</p>
        {step === 'cur' ? <button className="btn" disabled={cur.length < 4} onClick={() => setStep('next')}>Next</button> : <button className="btn" disabled={next.length < 4} onClick={save}>Save new PIN</button>}
      </div>
    </Modal>
  );
}
