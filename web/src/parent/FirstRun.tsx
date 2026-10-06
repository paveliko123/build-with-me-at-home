import { useState } from 'react';
import { api } from '../lib/api';
import { PinPad, RESPONSIBILITY } from './PinPad';
import { KidForm, type KidDraft } from './KidForm';

// prd.md > First-Run Setup: the note, create the PIN (twice), add at least one kid.
// newPinOnly: after /build-with-me:reset-pin the kids already exist, so only a new PIN is set.
export function FirstRun({ onDone, newPinOnly = false }: { onDone: () => void; newPinOnly?: boolean }) {
  const [step, setStep] = useState<'note' | 'pin' | 'pin2' | 'kids'>(newPinOnly ? 'pin' : 'note');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [kids, setKids] = useState<KidDraft[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true); setErr('');
    try { await api('/api/parent/setup', { body: { pin, kids } }); onDone(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const afterPin = () => (newPinOnly ? finish() : setStep('kids'));

  return (
    <div className="pinwrap" style={{ maxWidth: step === 'kids' ? 620 : 440 }}>
      <div className="logo">🛠️✨</div>
      <h1>{newPinOnly ? 'Choose a new PIN' : 'Welcome to Build With Me'}</h1>
      <p className="muted">{newPinOnly ? 'Your PIN was reset. Your kids, apps and reports are unchanged.' : 'A quick, one-time setup.'}</p>

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
          <p><b>Add your kids.</b> A nickname is enough. Their age group sets how the helper guides them, and only you can change it.</p>
          <div className="card" style={{ marginBottom: 12 }}>
            {kids.length === 0 && <div className="empty">No kids added yet.</div>}
            {kids.map((k, i) => (
              <div className="row" key={i}>
                <div>{k.emoji} <b>{k.nickname}</b> <span className={`pill ${k.group === 'teen' ? 't' : 'k'}`}>{k.group === 'teen' ? 'Teen' : 'Kid'}</span></div>
                <button className="ghost" onClick={() => setKids(kids.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
          </div>
          <KidForm submitLabel="Add" onSubmit={(k) => setKids([...kids, k])} />
          <p className="err" role="alert">{err}</p>
          <button className="btn" disabled={!kids.length || busy} onClick={finish}>{busy ? 'Saving…' : 'Finish setup'}</button>
        </div>
      )}
    </div>
  );
}
