// spec.md > Kid Journey (ported): one conversation turn in the Start → Tech plan stages.
// Ported from Build With Me's functions/src/guideTurn.ts. The turn rules below (approvals,
// "I don't know", plain words, re-asks) are kept as they were tuned in live testing; only the
// storage (Firestore → the project file) and the model calls (API → the parent's Claude Code)
// changed, plus the pass's step for the parent's Active passes card.
import { callDocWriter, callGuide, GuideError, type CallMeta } from './claude.js';
import { buildContents, buildSystemInstruction, stageKickoff, type StoredMessage } from './prompt/buildPrompt.js';
import { AI_DISCLOSURE, PERSONAL_NOTE, personText, REDIRECT_REPLY, WELLBEING_REPLY } from './prompt/safety.js';
import { maskPersonal } from './personal.js';
import { callSafetyCheck, flag, type SafetyResult } from './safetyCheck.js';
import { REPLY_SCHEMA } from './prompt/replySchema.js';
import { withoutEchoedQuestion } from './echo.js';
import { GUIDE_STAGES, nextStage, stageDocKind, STAGE_ORDER } from './stages.js';
import { addUsage, thread, type Project } from './project.js';
import { ageGroupOf, type GuideReply, type Profile, type StageDoc } from './types.js';

const MAX_TEXT = 4000;
const MAX_VISUAL = 20_000;

/** A change request or doubt, which never counts as approval. */
export function isChangeRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /\b(but|change|changes|except|instead|however|not|don'?t|doesn'?t|isn'?t|no\b|add|remove|rename|replace|fix|wrong|missing|should|could you|can you|please|tweak|adjust|make|bigger|smaller|different)\b|\?/.test(t);
}

/** An approval, said any natural way (live testing: "I think it's okay, let's see how it
 * looks", "I like it, let's move to the next stage"), as long as nothing asks for a change. */
export function isApproval(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[’]/g, "'");
  if (!t || t.length > 200 || isChangeRequest(t)) return false;
  return /\b(looks?|sounds?|seems?) (good|great|right|fine|perfect|nice|ok(ay)?|correct)|\b(i )?(like|love) (it|this|that)\b|\b(it|that|this)'?s? (is )?(ok(ay)?|good|fine|great|perfect|right)\b|\b(lgtm|approved?|approve it|go ahead|all good|perfect|ship it|move on|next (stage|step)|ready (for|to)|let'?s (go|move|continue|proceed|build|see)|yes|yep|yeah|sure|ok(ay)?)\b/.test(t);
}

/** "I don't know" and friends, typo-tolerant ("i don;t know", "idk", "dunno", "no idea"). */
export function isDontKnow(text: string): boolean {
  const t = text.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 60) return false;
  return /\b(idk|dunno|no idea|no clue|not sure|unsure|(i )?(dont|do not|dnt|donno) (know|no|knw)|nothing comes to mind)\b/.test(t);
}

// The guide says it wrote or changed the document ("Here is the PRD draft", "I've updated
// the scope"): then the document must actually be on screen.
/** The guide asks the person to review a document (live testing: it sometimes asked without
 * sending one). Then the document must be on screen, whatever words the guide used. */
export const REVIEW_ASK = /\b(look|looks|seem|seems) (good|right|accurate|ok(ay)?)|would you (like to )?(change|adjust|tweak|edit)|anything (you'?d like )?to (change|adjust|tweak)|before we (move|lock|go)|capture (your|the|it)|ready to approve|review (it|the|this|your)/i;

export const DOC_CLAIM = /\b(here('s| is| are) (the |your |a |an |my )?([\w-]+ ){0,3}(draft|scope|prd|spec|plan|checklist|document|version|profile)|i('ve| have) (now )?(updated|revised|written|drafted|rewritten|changed|added|put together)|(updated|revised) (the |your )?(draft|document|scope|prd|spec|checklist|plan)|draft (is )?(below|ready|on (the|your) screen)|take a look at the (draft|document)|^\s*(drafted|updated)[.!])/i;

/** Enforce the dial and size limits on whatever Gemini sent back. */
/** "You choose": the guide picks for them instead of asking again. */
export function isChooseForMe(text: string): boolean {
  const t = text.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  return t.length <= 60 && /\b(you (choose|pick|decide)|surprise me|whatever you (think|want|like)|up to you|your call)\b/.test(t);
}

/** A reply that points at options to pick from ("which of these two styles…"). */
export const OPTIONS_REF = /\bwhich of (these|those|the two|the three)\b|\b(these|those|both) (two |three )?(options|styles|choices|ideas|looks|vibes|directions|designs)\b/i;

/** A reply that points at a picture on screen ("take a look at these new styles"). */
export const PICTURE_REF = /\b(take a look|look at (these|this|the) (new |two |brand new )*(looks?|styles?|designs?|pictures?)|here they are|here are (the |two |some |your )[\w ,'-]{0,40}\b(looks|styles|designs)|(these|two) (brand )?new (looks|styles|designs))\b/i;

/** Unsure answers that earn answer cards at the So-so level ("maybe", "hmm"). */
export function isUnsure(text: string): boolean {
  const t = text.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  if (isChooseForMe(text)) return false;
  return isDontKnow(text) || (t.length <= 40 && /\b(maybe|hmm+|whatever|anything|no preference|either|any)\b/.test(t));
}

// File and skill names never reach the person (final QA: "Source: scope.md > The Unique
// Kernel", "Ready for 5-build"); at plain levels the course terms become plain words too.
const FILE_NAMES: [RegExp, string | ((m: string) => string)][] = [
  [/^[ \t]*(?:[*_]{1,2})?Sources?(?:[*_]{1,2})?:(?:[*_]{1,2})?[ \t].*(?:\.md|>).*\n?/gim, ''],
  [/`?\blearner-profile\.md\b`?/gi, 'your profile'],
  [/`?\bscope\.md\b`?/gi, 'the Idea plan'],
  [/`?\bprd\.md\b`?/gi, 'the Design plan'],
  [/`?\bspec\.md\b`?/gi, 'the Tech plan'],
  [/`?\bchecklist\.md\b`?/gi, 'the build checklist'],
  [/(the (?:Idea|Design|Tech) plan)\s*>\s*/g, '$1, '],
  [/\bready for [1-6]-(?:start|scope|prd|spec|build|ship)\b/gi, 'Ready to build'],
  [/\b[1-6]-(?:start|scope|prd|spec|build|ship)\b/gi, 'the next step'],
];
const PLAIN_TERMS: [RegExp, string][] = [
  [/\bThe Unique Kernel\b|\bUnique Kernel\b/g, 'What makes it special'],
  [/\bThe POC Boundary\b|\bPOC Boundary\b/g, "What we're leaving out for now"],
  [/\bThe Core Loop\b|\bCore Loop\b/g, 'How it works'],
  [/\bAcceptance criteria\b/gi, "How we'll know it works"],
  [/\bPRD\b|\bproduct requirements document\b/gi, 'Design plan'],
  [/\bproof of concept\b|\bPOC\b/gi, 'first version'],
];

/** Kids at any level and the So-so level get plain words. */
export function plainLevel(profile: Profile): boolean {
  return profile.experience <= 2 || ageGroupOf(profile) === 'kid';
}

export function scrubText(text: string, plain: boolean): string {
  let out = text;
  for (const [re, to] of plain ? [...FILE_NAMES, ...PLAIN_TERMS] : FILE_NAMES) out = out.replace(re, to as any);
  return out;
}

/** Documents sometimes arrive wrapped in a fence or with front matter ("doc: scope"). */
export function cleanMarkdown(markdown: string): string {
  // The document writer sometimes answers with a whole guide reply as JSON (final QA, Q2):
  // keep only the document inside it.
  const fenced = markdown.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  if (fenced.startsWith('{')) {
    try {
      const parsed = JSON.parse(fenced);
      const inner = parsed?.doc?.markdown ?? parsed?.doc?.content ?? parsed?.markdown ?? parsed?.content;
      if (typeof inner === 'string' && inner.trim()) markdown = inner;
    } catch {
      // Cut-off JSON (final QA, Q8): pull the "markdown" string out by hand.
      const raw = fenced.match(/"(?:markdown|content)"\s*:\s*"((?:[^"\\]|\\.)*)/)?.[1];
      if (raw) {
        try { markdown = JSON.parse(`"${raw.replace(/\\$/, '')}"`); } catch { markdown = raw.replace(/\\n/g, '\n').replace(/\\"/g, '"'); }
      }
    }
  }
  return markdown
    .replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '')
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/^(?:(?:doc|kind|status):[^\n]*\n)+/i, '')
    .trim();
}

function cleanReply(reply: GuideReply, profile: Profile, probeFirst: boolean, unsure = true): GuideReply {
  const clean: GuideReply = {
    say: String(reply.say ?? '').slice(0, MAX_TEXT),
    stageComplete: reply.stageComplete === true,
  };
  if (reply.question) {
    clean.question = String(reply.question).slice(0, 600);
    clean.say = withoutEchoedQuestion(clean.say, clean.question);
  } else {
    // Sometimes the question lands at the end of "say"; move it onto the big card.
    const match = clean.say.match(/^([\s\S]*?[.!…])\s+([^.!?…]*\?)\s*$/);
    if (match) {
      clean.say = match[1].trim();
      clean.question = match[2].trim();
    } else if (/\?\s*$/.test(clean.say) && !/[.!…]/.test(clean.say)) {
      clean.question = clean.say;
      clean.say = '';
    }
  }
  // prd.md > Idea: the first idea question is open-ended; cards only come after.
  // So-so level: cards are an optional helper, only when the person seems unsure.
  if (!probeFirst && (profile.experience <= 1 || (profile.experience === 2 && unsure)) && Array.isArray(reply.cards) && reply.cards.length) {
    clean.cards = reply.cards.slice(0, profile.experience === 2 ? 2 : 4).map(c => ({
      emoji: String(c.emoji ?? '').slice(0, 16),
      label: String(c.label ?? '').slice(0, 80),
      ...(c.detail ? { detail: String(c.detail).slice(0, 200) } : {}),
    }));
  }
  if (reply.visualHtml && reply.visualHtml.length <= MAX_VISUAL) clean.visualHtml = reply.visualHtml;
  else if (reply.visualHtml) console.warn(JSON.stringify({ event: 'visual-too-big', length: reply.visualHtml.length }));
  if (reply.doc?.markdown) clean.doc = { ...reply.doc, markdown: scrubText(cleanMarkdown(reply.doc.markdown), plainLevel(profile)) };
  clean.say = scrubText(clean.say, plainLevel(profile));
  if (clean.question) clean.question = scrubText(clean.question, plainLevel(profile));
  if (reply.techSummary) clean.techSummary = String(reply.techSummary).slice(0, 300);
  if (reply.tooBig) clean.tooBig = true;
  return clean;
}


export interface GuideTurnResult {
  reply: GuideReply;
  stage: Project['stage'];
  stageChanged: boolean;
  planReady?: boolean;
  checklist?: string;
}

export class TurnError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** One turn. The project is changed in place; the caller saves it (also after an error). */
export async function guideTurn(project: Project, rawText?: string): Promise<GuideTurnResult> {
  const typed = typeof rawText === 'string' ? personText(rawText.trim().slice(0, MAX_TEXT)) : '';
  // spec.md > Safety: obvious personal details are hidden before anything is saved or sent.
  const instant = maskPersonal(typed);
  let text = instant.text;
  const session = project;
  const metas: (CallMeta | undefined)[] = [];
  try {
    const stage = session.stage;
    // In the Build stage the guide either plans the build (experienced end, until the
    // checklist is approved) or keeps the person company while the app builds.
    const planningBuild = stage === 'build' && session.profile.experience >= 3 && session.docs.checklist?.status !== 'approved';
    const waiting = stage === 'build' && !planningBuild;
    if (!GUIDE_STAGES.includes(stage) && stage !== 'build') throw new TurnError(409, `The guide doesn't run in the ${stage} stage.`);
    const threadName = waiting ? 'build-wait' : stage;

    // This conversation so far, oldest first.
    const history = thread(session, threadName);
    const messages: StoredMessage[] = history.map(d => ({ role: d.role, text: d.text }));
    let seq = session.messages.reduce((n, m) => Math.max(n, m.seq + 1), 0);
    const newMessages: StoredMessage[] = [];
    if (messages.length === 0) newMessages.push({ role: 'user', text: stageKickoff(stage, waiting) });
    else if (waiting && !text) newMessages.push({ role: 'user', text: '[app] The app is being built again (a new step or a change). Say one short friendly line about it and ask one new question (ideas for later).' });
    if (text) newMessages.push({ role: 'user', text });
    if (newMessages.length === 0) throw new TurnError(400, 'text is required after the stage has started.');

    const approvedDocs = STAGE_ORDER
      .map(s => stageDocKind(s))
      .filter((kind): kind is NonNullable<typeof kind> => !!kind && kind !== stageDocKind(stage))
      .map(kind => session.docs[kind])
      .filter((d): d is StageDoc & { updatedAt: number } => d?.status === 'approved')
      .map(({ kind, markdown, status }) => ({ kind, markdown, status }));

    const systemInstruction = buildSystemInstruction(session.profile, stage, approvedDocs, waiting);
    const kind = waiting ? undefined : stageDocKind(stage);
    const stored = kind ? session.docs[kind] : undefined;
    const lastGuide = [...messages].reverse().find(m => m.role === 'model');
    const lastReply: Partial<GuideReply> = lastGuide ? JSON.parse(lastGuide.text) : {};
    const cardsAllowed = session.profile.experience <= 2;
    const dontKnow = !!text && isDontKnow(text);

    // Who approves (prd.md > The Kid's Journey): Teens approve the Idea and Design plans
    // (slider 2); kids never see plans, and the guide approves them when the stage is done.
    const needsPerson = !!kind && (session.profile.experience >= 3 || (session.profile.experience === 2 && (stage === 'idea' || stage === 'design')));
    // A clear "looks good" approves the draft the person is looking at (the skills' rule):
    // only a draft saved in an EARLIER turn, so nothing is ever approved unseen.
    const reviewAsked = !!lastReply.doc
      || /looks? (good|right)|approve|change anything|would you change|anything to (change|adjust)/i.test(`${lastReply.question ?? ''} ${lastReply.say ?? ''}`);
    let personApproved = needsPerson && stored?.status === 'draft' && reviewAsked && isApproval(text);

    // Keep young and supported stages short: after enough answers, ask the guide to wrap up.
    // Never right after "I don't know": that's when the person needs ideas, not a finished plan.
    const answers = messages.filter(m => m.role === 'user').length + (text ? 1 : 0) - 1;
    const wrapAfter = waiting || personApproved ? Infinity : session.profile.experience <= 1 ? (stage === 'start' ? 2 : 4) : session.profile.experience === 2 ? 6 : 10;
    const nudge = answers >= wrapAfter && !dontKnow
      ? [{ role: 'user' as const, text: '[app] The person has answered enough for this stage. Unless something essential is truly missing, finish the stage in THIS reply: include the complete document in "doc" and set "stageComplete": true. Use only what the person actually chose; never invent their ideas. (Idea stage: if you haven\'t yet recapped the idea in one line and heard them agree, do that recap with "Sound good?" instead.)' }]
      : [];
    // Long chats send only the opening and the latest 40 messages.
    let from = messages.length - 40;
    if (from > 1 && messages[from].role === 'user') from++;
    const recent = from > 1 ? [messages[0], ...messages.slice(from)] : messages;
    // A hidden personal detail: the guide kindly says it isn't needed (and never repeats it).
    const note = (masked: boolean) => (masked ? [{ role: 'user' as const, text: PERSONAL_NOTE }] : []);
    let contents = buildContents([...recent, ...newMessages, ...nudge, ...note(instant.kinds.length > 0)]);
    if (instant.kinds.length) flag(session, 'input', { verdict: 'personal', category: instant.kinds.join(', ') }, text);
    const probeFirst = stage === 'idea' && messages.length === 0;
    const age = ageGroupOf(session.profile);
    // After a redirect, an open question (repeating a yes/no one like "Sound good?" read oddly).
    const sameQuestion = lastReply.question && !/^(sound|sounds|does that|is that|ready|ok|okay)\b/i.test(lastReply.question.trim()) && lastReply.question.trim().split(/\s+/).length > 3
      ? lastReply.question
      : 'What would you like to make instead?';
    // No answer from the guide twice is treated like a refusal: the kind redirect, same question.
    const askGuide = async (): Promise<{ reply: GuideReply; meta: CallMeta[] }> => {
      try {
        return await callGuide(systemInstruction, contents);
      } catch (err) {
        if (!(err instanceof GuideError)) throw err;
        console.warn(JSON.stringify({ event: 'refusal', fn: 'guideTurn', project: session.id, stage }));
        flag(session, 'input', { verdict: 'unsuitable', category: 'refused' }, text);
        return { reply: { say: REDIRECT_REPLY, question: sameQuestion, stageComplete: false }, meta: (err as any).metas ?? [] };
      }
    };
    // The kid's words are checked at the same time as the guide answers (no extra wait).
    const [inputCheck, firstAnswer] = await Promise.all([
      text ? callSafetyCheck(text, 'input', age, { system: systemInstruction, turns: contents, schema: REPLY_SCHEMA }) : Promise.resolve<SafetyResult>({ verdict: 'ok' }),
      askGuide(),
    ]);
    let raw = firstAnswer.reply;
    metas.push(...firstAnswer.meta, inputCheck.meta);
    const blocked = inputCheck.verdict === 'unsuitable' || inputCheck.verdict === 'wellbeing';
    if (blocked) {
      // Never answered, never built: a kind redirect (or, if they may be hurting, a grown-up).
      flag(session, 'input', inputCheck, text);
      raw = { say: inputCheck.verdict === 'wellbeing' ? WELLBEING_REPLY : REDIRECT_REPLY, question: sameQuestion, stageComplete: false };
      const mine = newMessages.find(m => m.role === 'user' && m.text === text);
      if (mine) mine.text = '(A message that was left out because it was not suitable.)';
      text = '';
    } else if (inputCheck.verdict === 'personal') {
      // A detail the instant mask missed: keep only the masked words, and ask again with them.
      flag(session, 'input', inputCheck, inputCheck.masked ?? '');
      const mine = newMessages.find(m => m.role === 'user' && m.text === text);
      text = inputCheck.masked && inputCheck.masked.trim() ? personText(inputCheck.masked) : '(A message with a personal detail, left out.)';
      if (mine) mine.text = text;
      contents = buildContents([...recent, ...newMessages, ...nudge, ...note(true)]);
      const again = await askGuide();
      raw = again.reply;
      metas.push(...again.meta);
    }
    let reply = cleanReply(raw, session.profile, probeFirst, !!text && isUnsure(text));
    // The guide judged the draft approved and the person asked for no change: that's an
    // approval too (live testing: four natural approvals in a row were refused).
    if (!personApproved && needsPerson && stored?.status === 'draft' && reviewAsked && !!text && reply.stageComplete && !isChangeRequest(text)) personApproved = true;
    const asksSuggestion = !!text && (dontKnow || isChooseForMe(text) || /what (do|would) you (suggest|recommend|think)|your (suggestion|recommendation)/i.test(text));
    const jumpsToDraft = reply.stageComplete || !!reply.doc || DOC_CLAIM.test(reply.say) || REVIEW_ASK.test(reply.question ?? '');

    // Ask once more (rare) when the reply would leave the person stuck or decide for them.
    const problem = waiting || personApproved || blocked ? null
      : cardsAllowed && (dontKnow || (session.profile.experience === 2 && !!text && isUnsure(text))) && (stage === 'idea' || stage === 'design') && (reply.stageComplete || !reply.cards?.length)
        ? "[app] The person just said they don't know or sounded unsure. Don't finish the stage and don't decide for them: offer 2 answer cards that point in clearly different directions, and ask which one they like."
        : session.profile.experience >= 3 && asksSuggestion && jumpsToDraft && stored?.status !== 'draft'
          ? "[app] The person asked for your suggestion on the current question. Don't write the document yet: recommend one option for this question with a one-sentence reason, and ask whether that works for them."
        : !reply.visualHtml && PICTURE_REF.test(reply.say)
          ? '[app] Your reply tells the person to look at a picture, but no picture came through. Send the reply again with the picture in "visualHtml" (self-contained, under 6 KB).'
        : cardsAllowed && !reply.cards?.length && OPTIONS_REF.test(`${reply.say} ${reply.question ?? ''}`)
          ? '[app] Your reply asks the person to pick between options, but none are on screen. Send the reply again with those options as 2 or 3 answer cards.'
        : !reply.question && !reply.stageComplete
          ? '[app] That reply has no question, so the person has nothing to answer. Send the reply again with your one question in the "question" field.'
          : null;
    if (problem) {
      try {
        const retry = await callGuide(systemInstruction, [...contents, { role: 'model', text: JSON.stringify(raw) }, { role: 'user', text: problem }]);
        raw = retry.reply;
        reply = cleanReply(raw, session.profile, probeFirst, !!text && isUnsure(text));
        metas.push(...retry.meta);
      } catch (err) {
        if (!(err instanceof GuideError)) throw err; // keep the first reply
        metas.push(...((err as any).metas ?? []));
      }
    }
    if (waiting) { reply.stageComplete = false; delete reply.doc; }
    // prd.md > The Kid's Journey: the very first reply says the helper is an AI, not a person.
    if (stage === 'start' && messages.length === 0 && !/\bAI\b/.test(reply.say)) reply.say = `${AI_DISCLOSURE[ageGroupOf(session.profile) === 'kid' ? 'kid' : 'teen']} ${reply.say}`.trim();
    // Asked to change a draft, the guide sometimes sent the same document: a change to a
    // draft always gets a freshly written document.
    const changesDraft = !!kind && stored?.status === 'draft' && !!text && isChangeRequest(text) && !personApproved;
    if (changesDraft && reply.doc && reply.doc.markdown.trim() === stored!.markdown.trim()) delete reply.doc;

    if (personApproved) {
      // Approve exactly what was shown, never a document sent in the same breath.
      reply.doc = { kind: kind!, markdown: stored!.markdown, status: 'approved' };
      reply.stageComplete = true;
    } else if (kind && !reply.doc) {
      // The guide finished the stage, said it wrote or updated the document, or asked for a
      // review, without sending it. Write it in a dedicated call so the person sees exactly
      // what they are approving.
      const claimed = DOC_CLAIM.test(`${reply.say} ${reply.question ?? ''}`);
      const reviewWithoutDraft = REVIEW_ASK.test(reply.question ?? '') && (stored?.status !== 'draft' || (!!text && isChangeRequest(text)));
      if ((reply.stageComplete && !stored) || claimed || reviewWithoutDraft || changesDraft) {
        const ask = [...contents, { role: 'model' as const, text: JSON.stringify(reply) }, {
          role: 'user' as const,
          text: `[app] Now write the complete "${kind}" document for this stage, following the stage's template, using everything decided in this conversation (including any changes the person just asked for). Reply with JSON whose only field "markdown" holds the whole document.`,
        }];
        const written = await callDocWriter(systemInstruction, ask);
        metas.push(written.meta);
        const markdown = scrubText(cleanMarkdown(written.text), plainLevel(session.profile));
        if (markdown) reply.doc = { kind, markdown, status: 'draft' };
      }
    }

    if (needsPerson && !personApproved) {
      if (reply.doc) reply.doc.status = 'draft';
      reply.stageComplete = false;
      if (!reply.question && (reply.doc || stored?.status === 'draft')) reply.question = 'Does this look right, or would you change anything?';
      // Never claim an approval that didn't happen, or a finished stage while it stays open.
      reply.say = reply.say.split(/(?<=[.!?…])\s+/).filter(s => !/\b(is|it's|now|officially|all|been) approved\b|\bapproved!|\blocked (it |this )?in\b|\b(completed|finished|wrapped up|done with) (the )?\w+( \w+)? stage\b|^next (is|up)\b|\bwe'?re (moving|heading) (on )?(to|into)\b/i.test(s)).join(' ');
    }
    // A reply that doesn't finish the stage always leaves the person something to answer.
    if (!waiting && !reply.stageComplete && !reply.question) {
      console.log(JSON.stringify({ event: 'no-question', stage, fields: Object.keys(raw ?? {}), sayChars: String((raw as any)?.say ?? '').length }));
      reply.question = reply.cards?.length ? 'Which one do you like best?'
        : kind && !reply.doc && stored?.status !== 'draft' && answers >= 3 ? 'Shall I write up the draft now?'
        : kind && !reply.doc && stored?.status !== 'draft' ? 'What would you like it to be like?'
        : kind && (reply.doc || stored?.status === 'draft') ? 'Does this look right, or would you change anything?'
        : 'What would you like to do next?';
    }
    const selfApprove = !needsPerson && reply.stageComplete;
    if (selfApprove && reply.doc) reply.doc.status = 'approved';

    // prd.md > Safety: the guide's own words are checked before they're shown.
    if (!blocked) {
      const shown = [reply.say, reply.question, ...(reply.cards ?? []).map(c => `${c.label} ${c.detail ?? ''}`), reply.techSummary].filter(Boolean).join('\n');
      const outputCheck = await callSafetyCheck(shown, 'output', age, { system: systemInstruction, turns: [...contents, { role: 'model', text: JSON.stringify(raw) }], schema: REPLY_SCHEMA });
      metas.push(outputCheck.meta);
      if (outputCheck.verdict === 'unsuitable') {
        flag(session, 'output', outputCheck, shown);
        reply = { say: REDIRECT_REPLY, question: sameQuestion, stageComplete: false };
      }
    }

    // Save the turn: new user messages, then the guide's reply as the person saw it.
    const now = Date.now();
    for (const m of [...newMessages, { role: 'model' as const, text: JSON.stringify(reply) }]) {
      session.messages.push({ thread: threadName, role: m.role === 'user' ? 'user' : 'model', text: m.text, seq: seq++, at: now });
    }
    if (reply.doc && kind) session.docs[kind] = { ...reply.doc, markdown: String(reply.doc.markdown ?? '').slice(0, 30_000), kind, updatedAt: now };
    else if (selfApprove && stored && kind) stored.status = 'approved';
    const docApproved = needsPerson
      ? personApproved
      : reply.doc?.status === 'approved' || stored?.status === 'approved' || (selfApprove && !!stored);
    let newStage = stage;
    const planReady = stage === 'build' && (planningBuild ? docApproved : true);
    if (reply.stageComplete && docApproved && GUIDE_STAGES.includes(stage)) {
      newStage = nextStage(stage);
      session.stage = newStage;
      session.timeline.push({ at: now, stage: newStage });
    }

    const checklist = planningBuild && planReady ? (reply.doc?.markdown ?? stored?.markdown) : undefined;
    return { reply, stage: newStage, stageChanged: newStage !== stage, planReady: planningBuild ? planReady : undefined, checklist };
  } finally {
    addUsage(session, metas);
  }
}
