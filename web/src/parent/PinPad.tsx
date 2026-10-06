import { useEffect } from 'react';

// A big PIN pad with dots, also driven by the keyboard (digits, Backspace, Enter).
export function PinPad({ value, onChange, onEnter, max = 8 }: { value: string; onChange: (v: string) => void; onEnter?: () => void; max?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key) && value.length < max) onChange(value + e.key);
      else if (e.key === 'Backspace') onChange(value.slice(0, -1));
      else if (e.key === 'Enter') onEnter?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [value, onChange, onEnter, max]);

  const shown = Math.max(4, value.length);
  return (
    <>
      <div className="dots" aria-label={`${value.length} digits entered`}>
        {Array.from({ length: shown }, (_, i) => <i key={i} className={i < value.length ? 'on' : ''} />)}
      </div>
      <div className="pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => value.length < max && onChange(value + d)}>{d}</button>
        ))}
        <span />
        <button type="button" onClick={() => value.length < max && onChange(value + '0')}>0</button>
        <button type="button" aria-label="Delete" style={{ fontSize: 16 }} onClick={() => onChange(value.slice(0, -1))}>⌫</button>
      </div>
    </>
  );
}

export const RESPONSIBILITY = (
  <>
    <b>You're responsible for how your kids use this.</b>
    <br />
    <span className="muted">
      Build With Me runs on <em>your</em> Claude account. Your kids can only use it with a pass you give them, for as long as you choose.
      You'll get a report after every app they make. Stay nearby, especially with younger kids.
    </span>
  </>
);
