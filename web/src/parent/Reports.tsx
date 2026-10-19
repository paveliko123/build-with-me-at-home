import { useEffect, useState } from 'react';
import { api } from '../lib/api';

// prd.md > The Parent Report, Limit Reached, Screens and Layout (All reports, One report),
// laid out like devpost/report-mockup.html.

export interface ReportItem {
  id: string; kidId: string; kidName: string; group: 'kid' | 'teen'; createdAt: number; startedAt: number; endedAt: number;
  finished: boolean; title: string; what: string; description: string; badge: 'none' | 'handled' | 'look'; flags: number;
  appPath: string | null; fiveHourPct: number | null; file: string;
}
export interface AlertItem { id: string; at: number; kind: 'flag' | 'limit' | 'wellbeing' | 'pin' | 'signin'; kidId: string; kidName: string; text: string; reportId?: string; resetsAt?: number | null }

const when = (t: number) => new Date(t).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const dayOf = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const timeOf = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function Badge({ r }: { r: Pick<ReportItem, 'badge' | 'flags'> }) {
  return r.badge === 'none' ? <span className="pill ok">No flags</span>
    : r.badge === 'look' ? <span className="pill bad">Needs a look</span>
    : <span className="pill warn">{r.flags === 1 ? '1 flag' : `${r.flags} flags`} · handled</span>;
}

export function AttentionCard({ alerts, onOpenReport, reload }: { alerts: AlertItem[]; onOpenReport: (id: string) => void; reload: () => void }) {
  const dismiss = async (id: string) => { await api(`/api/parent/alerts/${id}/dismiss`, { body: {} }).catch(() => {}); reload(); };
  return (
    <div className="card">
      <h2>🔔 Needs your attention</h2>
      {!alerts.length && <div className="empty">Nothing right now.</div>}
      {alerts.map((a) => (
        <div key={a.id} className={`alert ${a.kind === 'flag' ? 'warn' : 'bad'}`} role={a.kind === 'wellbeing' ? 'alert' : undefined}>
          {a.kind === 'signin' ? '🔐' : a.kind === 'limit' ? '⛔' : a.kind === 'wellbeing' ? '💛' : a.kind === 'pin' ? '🔑' : '⚠️'}
          <span style={{ flex: 1 }}>
            <b>{a.kind === 'signin' ? `Claude needs you to sign in again` : a.kind === 'limit' ? `Limit reached ${when(a.at)}` : a.kind === 'wellbeing' ? `${a.kidName} may need you, ${when(a.at)}` : a.kind === 'pin' ? `Wrong PIN tries` : `${a.kidName}, ${when(a.at)}`}</b>: {a.text}
            {a.kind === 'limit' && a.resetsAt ? <> Resets around <b>{timeOf(a.resetsAt)}</b>.</> : null}
            {a.kind === 'signin' && <SignInButton onDone={reload} />}
            {a.reportId && <> <a href="#" onClick={(e) => { e.preventDefault(); onOpenReport(a.reportId!); }}>See report</a></>}
          </span>
          <button className="ghost" onClick={() => void dismiss(a.id)} aria-label="Dismiss" title="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}

type SignInState = { state: 'idle' } | { state: 'waiting'; url: string | null } | { state: 'done' } | { state: 'failed'; message: string };

/** Runs Claude Code's own sign-in (Anthropic's page opens in this computer's browser): no terminal. */
function SignInButton({ onDone }: { onDone: () => void }) {
  const [s, setS] = useState<SignInState>({ state: 'idle' });
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  useEffect(() => { api<SignInState>('/api/parent/signin').then(setS).catch(() => {}); }, []);
  useEffect(() => {
    if (s.state !== 'waiting') return;
    const t = setInterval(() => { api<SignInState>('/api/parent/signin').then((n) => { setS(n); if (n.state === 'done') onDone(); }).catch(() => {}); }, 2000);
    return () => clearInterval(t);
  }, [s.state, onDone]);
  const start = async () => { setCodeSent(false); setCode(''); setS(await api<SignInState>('/api/parent/signin/start', { body: {} })); };
  const send = async () => { const r = await api<{ ok: boolean }>('/api/parent/signin/code', { body: { code } }); setCodeSent(r.ok); };
  if (s.state === 'done') return <div style={{ marginTop: 8 }}>✅ Signed in. The guide can answer again.</div>;
  if (s.state === 'waiting') return (
    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
      <div>Anthropic's sign-in page opened in this computer's browser. Sign in there, then come back here.</div>
      {s.url && <div>Didn't open? <a href={s.url} target="_blank" rel="noreferrer">Open the sign-in page</a>.</div>}
      <div>If the page shows a code, paste it here:</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code from the sign-in page" aria-label="Sign-in code" style={{ flex: 1, minWidth: 180 }} autoComplete="off" />
        <button onClick={() => void send()} disabled={!code.trim()}>Send code</button>
      </div>
      {codeSent && <div>Code sent. Finishing the sign-in…</div>}
      <div><button className="ghost" onClick={() => void api<SignInState>('/api/parent/signin/cancel', { body: {} }).then(setS)}>Cancel</button></div>
    </div>
  );
  return (
    <div style={{ marginTop: 8 }}>
      {s.state === 'failed' && <div>{s.message}</div>}
      <button onClick={() => void start()}>🔐 Sign in to Claude</button>
    </div>
  );
}

export function LatestReports({ reports, onOpen, onAll }: { reports: ReportItem[]; onOpen: (id: string) => void; onAll: () => void }) {
  return (
    <div className="card">
      <h2>📄 Latest reports</h2>
      {!reports.length && <div className="empty">Reports appear after your kids finish an app.</div>}
      {reports.slice(0, 3).map((r) => (
        <div className="row clickable" key={r.id} onClick={() => onOpen(r.id)}>
          <div><button className="linkish" onClick={(e) => { e.stopPropagation(); onOpen(r.id); }}><b>{r.finished ? r.what : '(not finished)'}</b></button> · {r.kidName}<br /><span className="muted">{dayOf(r.createdAt)}{r.fiveHourPct !== null ? ` · ≈${r.fiveHourPct < 1 ? '<1' : Math.round(r.fiveHourPct)}% of your 5-hour limit (this app)` : ''}</span></div>
          <Badge r={r} />
        </div>
      ))}
      {!!reports.length && <div style={{ marginTop: 12 }}><button className="linkish" onClick={onAll}>All reports →</button> <span className="muted" style={{ fontSize: 13 }}>· also in your Build With Me\Reports folder</span></div>}
    </div>
  );
}

export function AllReports({ reports, onOpen, onBack }: { reports: ReportItem[]; onOpen: (id: string) => void; onBack: () => void }) {
  return (
    <main>
      <div className="top"><h1>Parent reports</h1><button className="ghost" onClick={onBack}>← Parent home</button></div>
      <div className="card">
        <p className="muted" style={{ margin: '0 0 12px' }}>Every app, newest first. Each one is also saved as a file in the <b>Reports</b> folder inside your Build With Me folder, and opens even when the app isn't running.</p>
        {!reports.length ? <div className="empty">Reports appear after your kids finish an app.</div> : (
          <div className="tablewrap">
            <table className="reports">
              <thead><tr><th>When</th><th>Who</th><th>What was built</th><th>Safety</th><th>App</th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="clickable" onClick={(e) => { if ((e.target as HTMLElement).tagName !== 'A') onOpen(r.id); }}>
                    <td>{dayOf(r.createdAt)}<br /><span className="muted">{timeOf(r.startedAt)}–{timeOf(r.endedAt)}</span></td>
                    <td>{r.kidName} <span className={`pill ${r.group === 'teen' ? 't' : 'k'}`}>{r.group === 'teen' ? 'Teen' : 'Kid'}</span></td>
                    <td><button className="linkish" onClick={(e) => { e.stopPropagation(); onOpen(r.id); }}><b>{r.finished ? r.what : '(not finished)'}</b></button><br /><span className="muted">{r.description}</span></td>
                    <td><Badge r={r} /></td>
                    <td>{r.appPath ? <a href={r.appPath} target="_blank" rel="noopener">Open ↗</a> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

// UI review R3: the report is as tall as its content (one scroll, the page's), with no second
// "Parent report" title around it.
export function ReportView({ id, onBack }: { id: string; onBack: () => void }) {
  const [height, setHeight] = useState(800);
  const fit = (f: HTMLIFrameElement) => { try { const h = f.contentDocument?.documentElement.scrollHeight; if (h) setHeight(h + 8); } catch { /* keep the default */ } };
  return (
    <main>
      <div className="top"><button className="ghost" onClick={onBack}>← Back</button></div>
      <iframe className="reportframe" title="Parent report" style={{ height }} onLoad={(e) => { const f = e.currentTarget; fit(f); window.setTimeout(() => fit(f), 400); }} src={`/api/parent/reports/${encodeURIComponent(id)}/html`} />
    </main>
  );
}
