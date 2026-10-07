import { useEffect, useState } from 'react';
import type { AgeGroup } from '../lib/api';

export const EMOJIS = ['🦄', '🚀', '🐱', '🐶', '🦖', '🌈', '⚽', '🎨', '🎸', '🤖', '🦊', '🐼'];
export interface KidDraft { nickname: string; group: AgeGroup | ''; emoji: string }

// Nickname + Kid/Teen + emoji. The age group is only ever set here, by the parent.
// UI review P2: a real form (Enter adds), "Add" can be secondary, and the parent screen can see a
// nickname that was typed but not added yet.
export function KidForm({ initial, submitLabel, onSubmit, onCancel, onDraft, secondary = false }: {
  initial?: KidDraft; submitLabel: string; onSubmit: (k: KidDraft) => Promise<void> | void; onCancel?: () => void;
  onDraft?: (k: KidDraft) => void; secondary?: boolean;
}) {
  const [k, setK] = useState<KidDraft>(initial ?? { nickname: '', group: '', emoji: EMOJIS[0] });
  const [err, setErr] = useState('');
  useEffect(() => { onDraft?.(k); }, [k, onDraft]);
  const submit = async () => {
    if (!k.nickname.trim()) return setErr('Add a nickname (no full names needed).');
    if (!k.group) return setErr('Pick Kid (under 13) or Teen (13–17).');
    setErr('');
    try { await onSubmit(k); setK({ nickname: '', group: '', emoji: EMOJIS[0] }); }
    catch (e) { setErr((e as Error).message); }
  };
  return (
    <form style={{ display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="kidform">
        <input type="text" placeholder="Nickname" maxLength={24} value={k.nickname} onChange={(e) => setK({ ...k, nickname: e.target.value })} aria-label="Nickname" />
        <div className="seg" role="group" aria-label="Age group">
          <button type="button" aria-pressed={k.group === 'kid'} onClick={() => setK({ ...k, group: 'kid' })}>Kid (under 13)</button>
          <button type="button" aria-pressed={k.group === 'teen'} onClick={() => setK({ ...k, group: 'teen' })}>Teen (13–17)</button>
        </div>
      </div>
      <div className="emojis" role="group" aria-label="Emoji">
        {EMOJIS.map((e) => <button key={e} type="button" aria-pressed={k.emoji === e} onClick={() => setK({ ...k, emoji: e })}>{e}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className={secondary ? 'ghost' : 'btn'} type="submit">{submitLabel}</button>
        {onCancel && <button className="ghost" type="button" onClick={onCancel}>Cancel</button>}
      </div>
      <p className="err" role="alert">{err}</p>
    </form>
  );
}
