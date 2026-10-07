import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ActivePass, type Kid, type Status } from '../lib/api';
import { ActivePasses, GivePass } from './Passes';
import { AllReports, AttentionCard, LatestReports, ReportView, type AlertItem, type ReportItem } from './Reports';
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
  const [apps, setApps] = useState<Record<string, KidApp[]>>({});
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [view, setView] = useState<{ kind: 'home' } | { kind: 'reports' } | { kind: 'report'; id: string; from: 'home' | 'reports' }>({ kind: 'home' });
  const loadReports = useCallback(() => {
    api<ReportItem[]>('/api/parent/reports').then(setReports).catch(() => {});
    api<AlertItem[]>('/api/parent/alerts').then(setAlerts).catch(() => {});
  }, []);
  const loadApps = useCallback(() => api<Record<string, KidApp[]>>('/api/parent/apps').then(setApps).catch(() => {}), []);
  useEffect(() => { loadApps(); }, [loadApps]);

  const loadKids = useCallback(() => api<Kid[]>('/api/parent/kids').then(setKids).catch(() => onLock()), [onLock]);
  useEffect(() => {
    loadKids();
    api<Status>('/api/parent/status').then(setStatus).catch(() => setStatus({ claude: { found: false, signedIn: false } }));
  }, [loadKids]);

  const loadPasses = useCallback(() => api<ActivePass[]>('/api/parent/passes').then(setPasses).catch(() => onLock()), [onLock]);
  useEffect(() => {
    loadPasses();
    const es = new EventSource('/api/events');
    es.addEventListener('passes', () => { loadPasses(); loadReports(); loadApps(); });
    // The countdowns tick locally; this catches anything missed while the stream reconnects.
    const t = setInterval(loadPasses, 60_000);
    return () => { es.close(); clearInterval(t); };
  }, [loadPasses, loadReports, loadApps]);
  useEffect(() => { loadReports(); }, [loadReports]);

  const lock = async () => { await api('/api/parent/lock', { body: {} }).catch(() => {}); onLock(); };
  const now = new Date();
  const [focusKid, setFocusKid] = useState<string | null>(null);

  if (view.kind === 'reports') return <AllReports reports={reports} onOpen={(id) => setView({ kind: 'report', id, from: 'reports' })} onBack={() => setView({ kind: 'home' })} />;
  if (view.kind === 'report') return <ReportView id={view.id} onBack={() => setView(view.from === 'reports' ? { kind: 'reports' } : { kind: 'home' })} />;

  return (
    <main>
      <div className="top">
        <div><h1>Hi! 👋</h1><span className="muted">Parent area · {now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
        {/* Family trial: the status sits in the header row, so the page fits one laptop screen. */}
        <StatusStrip status={status} />
        <div className="topacts" style={{ display: 'flex', gap: 8 }}>
          <button className="ghost" onClick={() => setModal('settings')}>⚙️ Settings</button>
          <button className="ghost" onClick={lock}>🔒 Lock</button>
        </div>
      </div>

      <div className="grid home">
        <div className="stack">
          <GivePass kids={kids} passes={passes} shown={shown} setShown={setShown} onAddKid={() => setModal('kids')} reload={loadPasses} />
          <ActivePasses passes={passes} onShow={setShown} reload={loadPasses} />
        </div>
        <div className="stack">
          <AttentionCard alerts={alerts} reload={loadReports} onOpenReport={(id) => setView({ kind: 'report', id, from: 'home' })} />
          <LatestReports reports={reports} onOpen={(id) => setView({ kind: 'report', id, from: 'home' })} onAll={() => setView({ kind: 'reports' })} />
        </div>
        <div className="stack">
          <div className="card">
            <h2>🧒 Kids &amp; their apps</h2>
            {kids.map((k) => (
              <div className="row" key={k.id}>
                <div>{k.emoji} <b>{k.nickname}</b> <span className={`pill ${k.group === 'teen' ? 't' : 'k'}`}>{k.group === 'teen' ? 'Teen' : 'Kid'}</span><br /><span className="muted">{(apps[k.id]?.length ?? 0) === 1 ? '1 app' : `${apps[k.id]?.length ?? 0} apps`}</span></div>
                <button className="ghost" onClick={() => { setFocusKid(k.id); setModal('kids'); }} aria-label={`Manage ${k.nickname}`}>Manage</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <button className="ghost" onClick={() => { setFocusKid(null); setModal('kids'); }}>＋ Add a kid</button>
              <button className="ghost" onClick={() => setModal('tablet')}>📱 Set up a tablet or laptop for talking</button>
            </div>
          </div>
        </div>
      </div>

      {modal === 'kids' && <KidsManage kids={kids} apps={apps} focusKid={focusKid} reload={() => { loadKids(); loadApps(); loadReports(); loadPasses(); }} onClose={() => setModal(null)} />}
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

// UI review A4: focus moves into the dialog (its Close button), Tab stays inside, and focus goes
// back to the button that opened it.
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); opener?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card" role="dialog" aria-modal="true" aria-label={title} ref={box}>
        <div className="top" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>{title}</h2><button className="ghost" onClick={onClose} ref={close}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

interface KidApp { slug: string; name: string; emoji: string; iconUrl?: string | null; createdAt: number; path: string }

interface KidData { apps: number; projects: number; reports: number; livePass: boolean }
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Removing a kid deletes everything kept about them, so say exactly what goes, and have the
 *  parent type the kid's name to confirm (security audit M2). */
function RemoveKid({ kid, onCancel, onRemoved }: { kid: Kid; onCancel: () => void; onRemoved: () => void }) {
  const [info, setInfo] = useState<KidData | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api<KidData>(`/api/parent/kids/${kid.id}/data`).then(setInfo).catch((e) => setErr((e as Error).message)); }, [kid.id]);
  const confirmed = typed.trim().toLowerCase() === kid.nickname.trim().toLowerCase();
  const titleId = `remove-${kid.id}`;
  return (
    <div className="danger-box" role="alertdialog" aria-labelledby={titleId}>
      <b id={titleId}>⚠️ Remove {kid.nickname} and delete all of {kid.nickname}'s data?</b>
      {!info ? <p className="muted">{err || 'Checking what there is…'}</p> : (
        <>
          <p style={{ margin: '6px 0 0' }}>This permanently deletes from this computer:</p>
          <ul>
            <li>{count(info.apps, 'shipped app', 'shipped apps')} (their links stop working)</li>
            <li>{count(info.projects, 'project', 'projects')}, with the conversations</li>
            <li>{count(info.reports, 'parent report', 'parent reports')}, including the files in your Reports folder</li>
            {info.livePass && <li>{kid.nickname}'s live pass (it ends now)</li>}
          </ul>
          <p style={{ margin: '0 0 8px' }}><b>This can't be undone.</b> To keep a report, copy its file out of the Reports folder first.</p>
          <label>Type <b>{kid.nickname}</b> to confirm:<br />
            <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label={`Type ${kid.nickname} to confirm`} />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="ghost" onClick={onCancel}>Cancel</button>
            <button className="btn danger-fill" disabled={!confirmed || busy} onClick={async () => {
              setBusy(true);
              try { await api(`/api/parent/kids/${kid.id}?erase=1`, { method: 'DELETE' }); onRemoved(); }
              catch (e) { setErr((e as Error).message); setBusy(false); }
            }}>{busy ? 'Deleting…' : `Delete ${kid.nickname} and all their data`}</button>
          </div>
          {err && <p className="err">{err}</p>}
        </>
      )}
    </div>
  );
}

function KidsManage({ kids, apps, reload, onClose, focusKid }: { kids: Kid[]; apps: Record<string, KidApp[]>; reload: () => void; onClose: () => void; focusKid?: string | null }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [deletingApp, setDeletingApp] = useState<string | null>(null);
  // UI review A10: "Manage" next to a kid opens the list at that kid.
  useEffect(() => { if (focusKid) document.getElementById(`manage-${focusKid}`)?.scrollIntoView({ block: 'start' }); }, [focusKid]);
  const [err, setErr] = useState('');
  return (
    <Modal title="🧒 Kids & their apps" onClose={onClose}>
      {kids.map((k) => editing === k.id ? (
        <div key={k.id} className="card" style={{ margin: '8px 0' }}>
          <KidForm initial={k} submitLabel="Save" onCancel={() => setEditing(null)} onSubmit={async (d) => { await api(`/api/parent/kids/${k.id}`, { method: 'PUT', body: d }); setEditing(null); reload(); }} />
        </div>
      ) : (
        <div key={k.id} id={`manage-${k.id}`}>
        <div className="row">
          <div>{k.emoji} <b>{k.nickname}</b> <span className={`pill ${k.group === 'teen' ? 't' : 'k'}`}>{k.group === 'teen' ? 'Teen' : 'Kid'}</span></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="ghost" onClick={() => setEditing(k.id)}>Edit</button>
            <button className="ghost danger" onClick={() => {
              if (kids.length <= 1) { setErr('Keep at least one kid.'); return; }
              setErr(''); setRemoving(removing === k.id ? null : k.id);
            }}>Remove</button>
          </div>
        </div>
        {removing === k.id && <RemoveKid kid={k} onCancel={() => setRemoving(null)} onRemoved={() => { setRemoving(null); reload(); }} />}
        {(apps[k.id] ?? []).map((a) => (
          <div className="row" key={a.slug} style={{ paddingLeft: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{a.iconUrl ? <img src={a.iconUrl} alt="" width={22} height={22} style={{ borderRadius: 6 }} /> : a.emoji} {a.name} <span className="muted" style={{ fontSize: 13 }}>· {new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></div>
            <div style={{ display: 'flex', gap: 6 }}>
              <a className="ghost" style={{ textDecoration: 'none' }} href={a.path} target="_blank" rel="noopener">Open</a>
              <button className="ghost danger" onClick={() => setDeletingApp(`${k.id}/${a.slug}`)}>Delete</button>
            </div>
            {deletingApp === `${k.id}/${a.slug}` && (
              <div className="confirm" role="alertdialog" aria-label={`Delete ${a.name}?`} style={{ width: '100%' }}>
                <span>Delete {a.name}? It disappears from {k.nickname}'s shelf. Its report stays.</span>
                <span className="acts">
                  <button className="btn danger-fill" onClick={async () => {
                    try { await api(`/api/parent/kids/${k.id}/apps/${a.slug}`, { method: 'DELETE' }); setErr(''); setDeletingApp(null); reload(); } catch (e) { setErr((e as Error).message); }
                  }}>Delete</button>
                  <button className="ghost" onClick={() => setDeletingApp(null)}>Cancel</button>
                </span>
              </div>
            )}
          </div>
        ))}
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
      {!info ? <p className="muted">Loading…</p> : info.url ? (
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <img className="qr" src={info.qr!} alt="QR code for the device setup page" />
          <div><b>Tablet or phone:</b> scan with the camera.<br /><b>Laptop or Chromebook:</b> type this in the browser:<br /><code>{info.url}</code>
            <p className="muted" style={{ fontSize: 13 }}>The device must be on the same Wi-Fi. If it can't open the page, allow Node.js on <b>private networks</b> in the Windows firewall.</p></div>
        </div>
      ) : <p className="err">This computer doesn't seem to be on a home network right now.</p>}
      <details style={{ marginTop: 12 }}><summary><b>What this does, and why the security warning?</b></summary>
      <ul className="explain">
        <li><b>Goal:</b> your kid can <b>talk</b> to Claude on a tablet, phone, laptop or Chromebook, not only type.</li>
        <li><b>Why a setup step:</b> browsers only allow the microphone on <b>secure</b> pages. A secure page needs that device to trust this computer.</li>
        <li><b>What you install:</b> a small <b>home certificate</b>{info?.certificateName ? <> called <b>{info.certificateName}</b></> : null}. It only works inside your home network and can't vouch for any real website. Only you can approve it, in the device's Settings.</li>
        <li><b>Heads-up:</b> when the device opens the link, the browser warns that the site <b>"doesn't support a secure connection"</b> or shows <b>"Not secure"</b>. That's expected for this one setup page: tap <b>Continue to site</b>. Kids' pages are secure once setup is done.</li>
        <li><b>How long:</b> once per device, about 2 minutes. A step-by-step guide opens and ends with a ✅ check.</li>
      </ul>
      </details>
      <p className="muted" style={{ fontSize: 13 }}>Without this setup, kids can still type, or talk with the device's own dictation: the keyboard's 🎤 on tablets, Win+H on Windows, Fn Fn on a Mac, Search+D on a Chromebook. School Chromebooks usually block this setup.</p>
    </Modal>
  );
}

// UI review A6: the new PIN is entered twice, as in first run (a typo would lock the parent out).
function Settings({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'cur' | 'next' | 'again'>('cur');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState('');
  const reset = () => { setStep('cur'); setCur(''); setNext(''); setAgain(''); };
  const save = async () => {
    if (again !== next) { setMsg('The new PINs don\'t match. Enter the new PIN again.'); setNext(''); setAgain(''); setStep('next'); return; }
    try { await api('/api/parent/pin', { body: { current: cur, next } }); setMsg('✅ PIN changed.'); reset(); }
    catch (e: any) { setMsg(e?.body?.reason === 'wrong' ? 'The current PIN was wrong.' : e.message); reset(); }
  };
  return (
    <Modal title="⚙️ Settings" onClose={onClose}>
      <h2>Change PIN</h2>
      <div style={{ textAlign: 'center' }}>
        <p>{step === 'cur' ? 'Current PIN' : step === 'next' ? 'New PIN (4 to 8 digits)' : 'Enter the new PIN again'}</p>
        {step === 'cur' ? <PinPad value={cur} onChange={setCur} onEnter={() => cur.length >= 4 && setStep('next')} />
          : step === 'next' ? <PinPad value={next} onChange={setNext} onEnter={() => next.length >= 4 && setStep('again')} />
          : <PinPad value={again} onChange={setAgain} onEnter={() => again.length >= 4 && void save()} />}
        <p className="err" role="alert">{msg}</p>
        {step === 'cur' ? <button className="btn" disabled={cur.length < 4} onClick={() => setStep('next')}>Next</button>
          : step === 'next' ? <button className="btn" disabled={next.length < 4} onClick={() => setStep('again')}>Next</button>
          : <button className="btn" disabled={again.length < 4} onClick={save}>Save new PIN</button>}
      </div>
    </Modal>
  );
}
