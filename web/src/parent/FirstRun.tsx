import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PinPad, RESPONSIBILITY } from './PinPad';
import { KidForm, type KidDraft } from './KidForm';

type Step = 'claude' | 'note' | 'pin' | 'pin2' | 'kids';
const STEP_NO: Record<Step, number> = { claude: 1, note: 2, pin: 3, pin2: 3, kids: 4 };

/** First-run step 1 (UI review P1): Claude Code found and signed in, with the exact fix if not. */
function ClaudeCheck({ onNext }: { onNext: () => void }) {
  const [state, setState] = useState<{ found: boolean; signedIn: boolean } | null>(null);
  const check = (fresh = false) => { setState(null); api<{ found: boolean; signedIn: boolean }>(`/api/parent/claude-check${fresh ? '?fresh=1' : ''}`).then(setState).catch(() => setState({ found: false, signedIn: false })); };
  useEffect(() => { check(); }, []);
  return (
    <>
      <p><b>First, Claude Code.</b> Build With Me runs on your own Claude Code sign-in.</p>
      <div className="card" style={{ textAlign: 'left' }}>
        {!state ? <span className="muted">Checking…</span>
          : !state.found ? <span><span className="pill bad">Not found</span> In Claude Code, run <code>/build-with-me:setup</code>.</span>
          : !state.signedIn ? <span><span className="pill bad">Signed out</span> Run <code>claude</code>, then <code>/login</code>.</span>
          : <span className="pill ok">✓ Claude Code is signed in</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
        <button className="ghost" onClick={() => check(true)}>Check again</button>
        <button className="btn" style={{ width: 200 }} disabled={!state?.signedIn} onClick={onNext}>Next</button>
      </div>
      {state && !state.signedIn && <p className="muted" style={{ fontSize: 14 }}>Setup continues once Claude Code is ready. Fix it, then tap Check again.</p>}
    </>
  );
}

// prd.md > First-Run Setup: the Claude Code check, the note, create the PIN (twice), add at least
// one kid. newPinOnly: after /build-with-me:reset-pin the kids already exist, so only a new PIN.
export function FirstRun({ onDone, newPinOnly = false }: { onDone: () => void; newPinOnly?: boolean }) {
  const [step, setStep] = useState<Step>(newPinOnly ? 'pin' : 'claude');
  const [draft, setDraft] = useState<KidDraft | null>(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [kids, setKids] = useState<KidDraft[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    if (busy) return; // Enter on the button and on the page arrive together (UI review P5)
    // A nickname typed but not added yet still counts (UI review P2: it was silently dropped).
    let all = kids;
    if (draft?.nickname.trim()) {
      if (!draft.group) { setErr(`Pick Kid or Teen for ${draft.nickname.trim()}, or clear the name.`); return; }
      all = [...kids, draft];
    }
    if (!newPinOnly && !all.length) { setErr('Add at least one kid.'); return; }
    setBusy(true); setErr('');
    try { await api('/api/parent/setup', { body: { pin, kids: all } }); onDone(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const afterPin = () => (newPinOnly ? finish() : setStep('kids'));

  return (
    <div className="pinwrap" style={{ maxWidth: step === 'kids' ? 620 : 440 }}>
      <div className="logo">🛠️✨</div>
      <h1>{newPinOnly ? 'Choose a new PIN' : 'Welcome to Build With Me at Home'}</h1>
      <p className="muted">{newPinOnly ? 'Your PIN was reset. Your kids, apps and reports are unchanged.' : 'A quick, one-time setup.'}</p>
      {!newPinOnly && <p className="muted" style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', marginTop: 4 }}>Step {STEP_NO[step]} of 4</p>}

      {step === 'claude' && <ClaudeCheck onNext={() => setStep('note')} />}

      {step === 'note' && (
        <>
          <div className="resp">{RESPONSIBILITY}</div>
          <button className="btn" style={{ width: 240, marginTop: 16 }} onClick={() => setStep('pin')}>I understand. Next</button>
        </>
      )}

      {step === 'pin' && (
        <>
          <p><b>Create your parent PIN</b> (4 to 8 digits). Only grown-ups should know it.</p>
          <PinPad value={pin} onChange={setPin} onEnter={() => pin.length >= 4 && setStep('pin2')} />
          <button className="btn" style={{ width: 240, marginTop: 16 }} disabled={pin.length < 4} onClick={() => setStep('pin2')}>Next</button>
        </>
      )}

      {step === 'pin2' && (
        <>
          <p><b>Enter it again</b> to make sure.</p>
          <PinPad value={pin2} onChange={setPin2} onEnter={() => pin2.length >= 4 && (pin2 === pin ? afterPin() : (setErr('The PINs don’t match. Try again.'), setPin2('')))} />
          <p className="err" role="alert">{err}</p>
          <button className="btn" style={{ width: 240 }} disabled={pin2.length < 4} onClick={() => {
            if (pin2 === pin) { setErr(''); afterPin(); } else { setErr('The PINs don’t match. Try again.'); setPin2(''); }
          }}>{newPinOnly ? 'Save new PIN' : 'Next'}</button>
          <p><button className="ghost" onClick={() => { setPin(''); setPin2(''); setErr(''); setStep('pin'); }}>Start the PIN over</button></p>
        </>
      )}

      {step === 'kids' && (
        <div style={{ textAlign: 'left' }}>
          <p style={{ marginTop: 12 }}><b>Add your kids.</b> A nickname is enough. Their age group sets how the helper guides them, and only you can change it.</p>
          <div className="card" style={{ marginBottom: 12 }}>
            {kids.length === 0 && <div className="empty">No kids added yet.</div>}
            {kids.map((k, i) => (
              <div className="row" key={i}>
                <div>{k.emoji} <b>{k.nickname}</b> <span className={`pill ${k.group === 'teen' ? 't' : 'k'}`}>{k.group === 'teen' ? 'Teen' : 'Kid'}</span></div>
                <button className="ghost" onClick={() => setKids(kids.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
          </div>
          <KidForm submitLabel="Add" secondary onDraft={setDraft} onSubmit={(k) => setKids([...kids, k])} />
          <p className="err" role="alert">{err}</p>
          <button className="btn" disabled={(!kids.length && !draft?.nickname.trim()) || busy} onClick={finish}>{busy ? 'Saving…' : 'Finish setup'}</button>
        </div>
      )}
    </div>
  );
}
