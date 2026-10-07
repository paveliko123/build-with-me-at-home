// Shared shapes for the kid's journey (ported from Build With Me's functions/src/types.ts).
// Keep in sync with web/src/kid/journey/types.ts.

export type Stage = 'start' | 'idea' | 'design' | 'tech' | 'build' | 'ship';

export type DocKind = 'learner-profile' | 'scope' | 'prd' | 'spec' | 'checklist' | 'app-map';

export type ThemeId = 'unicorns' | 'princesses' | 'robots' | 'cars' | 'space' | 'arcade' | 'music' | 'sports' | 'nature' | 'office';

// Kid: under 13, Teen: 13–17 (set by the parent in family.json). Adult only in older data.
export type AgeGroup = 'kid' | 'teen' | 'adult';

export interface Profile {
  ageGroup: AgeGroup;
  age?: number; // sessions from before age groups
  // The profile screen offers 0 (No idea), 2 (So-so), and 4 (Experienced); 1 and 3 are
  // still understood for older sessions.
  experience: 0 | 1 | 2 | 3 | 4;
  theme: ThemeId;
  inputMode: 'talk' | 'type';
}

export interface Card {
  emoji: string;
  label: string;
  detail?: string;
}

export interface StageDoc {
  kind: DocKind;
  markdown: string;
  status: 'draft' | 'approved';
}

// spec.md > Reply Format (prompt/replySchema.ts)
export interface GuideReply {
  say: string;
  question?: string;
  cards?: Card[];
  visualHtml?: string;
  doc?: StageDoc;
  techSummary?: string;
  tooBig?: boolean;
  appEmojis?: string[]; // emojis that fit the app (the icon choice at Ship)
  laterIdea?: string; // waiting chat: the kid's idea as a short change, offered when the app is ready
  stageComplete: boolean;
}

/** spec.md > Model Mix: which Claude model answers, and how hard it thinks (Haiku 4.5 takes no effort). */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export interface ModelChoice {
  model: string;
  effort?: Effort;
}

export interface CallMeta {
  label?: string; // which part made the call (guideTurn, writeStageDoc, generateApp, …)
  model: string;
  promptTokens: number;
  cachedTokens: number; // cache reads
  cacheWriteTokens?: number; // Claude: input tokens written to the prompt cache (billed at 1.25x)
  outputTokens: number;
  thoughtsTokens: number;
  ms: number;
}

/** The age group, including sessions saved before age groups existed. */
export function ageGroupOf(profile: Profile): AgeGroup {
  if (profile.ageGroup) return profile.ageGroup;
  const age = profile.age ?? 18;
  return age < 13 ? 'kid' : age < 18 ? 'teen' : 'adult';
}
