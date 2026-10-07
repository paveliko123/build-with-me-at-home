// The change list after the app is built (ported from Build With Me's changeTurn): each message
// updates one list of changes, and the app is rebuilt only when the kid says they're done
// (then the builder makes the whole list as one version). Both-way safety as in guideTurn.

import { callChanges, CHANGES_SCHEMA, GuideError, type CallMeta, type Turn } from './claude.js';
import { CHANGES_INSTRUCTIONS } from './prompt/changesLayer.js';
import { voiceLine } from './prompt/dial.js';
import { LEAK, LEAK_REPLY, personText, REDIRECT_REPLY, SAFETY_LAYER, WELLBEING_REPLY } from './prompt/safety.js';
import { maskPersonal } from './personal.js';
import { callSafetyCheck, flag } from './safetyCheck.js';
import { withoutEchoedQuestion } from './echo.js';
import { addUsage, thread, type Project } from './project.js';
import { ageGroupOf } from './types.js';
import { TurnError } from './guideTurn.js';

const THREAD = 'changes';
const MAX_ITEMS = 12;
const HISTORY = 12; // recent messages kept as context

/** The changes already built into the app (from the edit versions' notes), so a finished change
 *  never goes back on the list (family trial: after the levels were built, adding a level
 *  counter put the levels on the list again, from the guide's own earlier messages). */
export function builtChanges(p: Project): string[] {
  return (p.versions ?? []).filter((v) => v.mode === 'edit')
    .flatMap((v) => String(v.note ?? '').split('\n'))
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export interface ChangeResult { changes: string[]; ready: boolean; ship?: boolean; reply: { say: string; question?: string } | null }

export async function changeTurn(p: Project, input: { text?: string; remove?: number; chatQuestion?: string }): Promise<ChangeResult> {
  if (p.stage !== 'build' || p.shipped) throw new TurnError(409, 'Changes happen in the Build stage.');
  let list = p.pendingChanges ?? [];

  // The ✕ next to an item: no guide call needed.
  if (Number.isInteger(input.remove)) {
    list = list.filter((_, i) => i !== input.remove);
    p.pendingChanges = list;
    return { changes: list, ready: false, reply: null };
  }
  const instant = maskPersonal(personText(String(input.text ?? '').trim().slice(0, 1000)));
  let text = instant.text;
  if (!text) throw new TurnError(400, 'text is required.');
  if (instant.kinds.length) flag(p, 'input', { verdict: 'personal', category: instant.kinds.join(', ') }, text);
  const metas: (CallMeta | undefined)[] = [];
  try {
    const past: Turn[] = thread(p, THREAD).slice(-HISTORY).map((m) => ({ role: m.role, text: m.text }));
    let seq = p.messages.reduce((n, m) => Math.max(n, m.seq + 1), 0);
    const docs = (['scope', 'prd'] as const)
      .map((k) => p.docs[k])
      .filter((d) => d?.status === 'approved')
      .map((d) => `----- ${d!.kind} (approved) -----\n${d!.markdown.trim()}`)
      .join('\n\n');
    const system = [SAFETY_LAYER, CHANGES_INSTRUCTIONS, `# WHO YOU'RE TALKING TO\n\n${voiceLine(p.profile)}`, `# THE PLAN\n\n${docs || '(not available)'}`].join('\n\n');
    // The waiting chat's last question counts only if the guide really asked it.
    const chatQuestion = personText(String(input.chatQuestion ?? '').replace(/["\n]/g, ' ').trim().slice(0, 300));
    const flat = (t: string) => t.replace(/["\n]/g, ' ').replace(/\s+/g, ' ').trim();
    const guideText = (raw: string) => { try { const r = JSON.parse(raw); return `${r.say ?? ''} ${r.question ?? ''}`; } catch { return raw; } };
    const guideAsked = !!chatQuestion && thread(p, 'build-wait').slice(-4).some((m) => m.role === 'model' && flat(guideText(m.text)).includes(flat(chatQuestion)));
    const asked = chatQuestion && guideAsked ? `\n\n[app] During the build the guide just asked this chat question: "${chatQuestion}". If the message only answers it (an opinion, a fact, or chat), it is not a change. If it asks for something to be in the app, even something the chat just talked about ("give Biscuit a pirate hat"), add it to the list.` : '';
    // Already built: listed so the guide doesn't put them back (its earlier messages still show them).
    const built = builtChanges(p).slice(-12);
    const builtNote = built.length ? `\n\n[app] Already built into the app (done, NOT on the list; never add these again unless the person asks for one again in this message):\n${built.map((c) => `- ${c}`).join('\n')}` : '';
    const askFor = (said: string) => `[app] Current change list (this is the whole list now; anything from earlier messages that isn't here was built or removed):\n${list.length ? list.map((c, i) => `${i + 1}. ${c}`).join('\n') : '(empty)'}${builtNote}${asked}\n\nThe person said: "${said}"`;
    let ask = askFor(text);

    const listChanges = async () => {
      try { return await callChanges(system, [...past, { role: 'user', text: ask }]); }
      catch (err) { if (err instanceof GuideError) return err; throw err; }
    };
    // Checked at the same time as the list is updated: an unsuitable change never reaches the builder.
    const [check, first] = await Promise.all([callSafetyCheck(text, 'input', ageGroupOf(p.profile), { system, turns: [...past, { role: 'user', text: ask }], schema: CHANGES_SCHEMA }), listChanges()]);
    metas.push(check.meta, ...(first instanceof GuideError ? ((first as any).metas ?? []) : [first.meta]));
    let called = first;
    if (check.verdict === 'unsuitable' || check.verdict === 'wellbeing' || called instanceof GuideError) {
      flag(p, 'input', called instanceof GuideError && check.verdict === 'ok' ? { verdict: 'unsuitable', category: 'refused' } : check, text);
      return { changes: list, ready: false, ship: false, reply: { say: check.verdict === 'wellbeing' ? WELLBEING_REPLY : REDIRECT_REPLY } };
    }
    if (check.verdict === 'personal') {
      flag(p, 'input', check, check.masked ?? '');
      text = check.masked?.trim() ? personText(check.masked) : '(a message with a personal detail, left out)';
      ask = askFor(text);
      called = await listChanges();
      if (called instanceof GuideError) return { changes: list, ready: false, ship: false, reply: { say: REDIRECT_REPLY } };
      metas.push(called.meta);
    }
    const { result } = called;
    const builtSet = new Set(built.map(norm));
    const onList = new Set(list.map(norm));
    const changes = (Array.isArray(result.changes) ? result.changes : list)
      .map((c) => String(c).replace(/\s+/g, ' ').trim().slice(0, 200))
      .filter(Boolean)
      // A built change that wasn't on the list comes back only if the person's words ask for it again.
      .filter((c) => !builtSet.has(norm(c)) || onList.has(norm(c)) || norm(text).includes(norm(c)))
      .slice(0, MAX_ITEMS);
    const ready = result.ready === true && changes.length > 0;
    const ship = result.ship === true && changes.length === 0;
    const question = result.question && !ready && !ship ? String(result.question).slice(0, 300) : undefined;
    const reply = { say: LEAK.test(String(result.say ?? '')) ? LEAK_REPLY : withoutEchoedQuestion(String(result.say ?? '').slice(0, 600), question), ...(question ? { question } : {}) };

    const now = Date.now();
    p.messages.push({ thread: THREAD, role: 'user', text: ask, seq: seq++, at: now });
    p.messages.push({ thread: THREAD, role: 'model', text: JSON.stringify({ ...reply, changes, ready, ship }), seq: seq++, at: now });
    p.pendingChanges = changes;
    return { changes, ready, ship, reply };
  } finally {
    addUsage(p, metas);
  }
}
