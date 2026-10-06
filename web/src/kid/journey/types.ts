// Shared shapes with the server (server/journey/types.ts). Ported from Build With Me.

export type Stage = 'start' | 'idea' | 'design' | 'tech' | 'build' | 'ship';

export type DocKind = 'learner-profile' | 'scope' | 'prd' | 'spec' | 'checklist' | 'app-map';

export type ThemeId = 'unicorns' | 'princesses' | 'robots' | 'cars' | 'space' | 'arcade' | 'music' | 'sports' | 'nature' | 'office';

// Kid: under 13, Teen: 13–17 (the parent sets it). Adult only in older data.
export type AgeGroup = 'kid' | 'teen' | 'adult';

export interface Profile {
  ageGroup: AgeGroup;
  // 0 = No idea, 2 = So-so, 4 = Experienced.
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

export interface GuideReply {
  say: string;
  question?: string;
  cards?: Card[];
  visualHtml?: string;
  doc?: StageDoc;
  techSummary?: string;
  tooBig?: boolean;
  laterIdea?: string;
  stageComplete: boolean;
}

export interface GuideTurnResult {
  reply: GuideReply;
  stage: Stage;
  stageChanged: boolean;
  planReady?: boolean; // Build stage: the experienced end's checklist is approved
  checklist?: string; // ...and here it is
}

// getSession: what the screen needs to resume after a refresh.
export interface SessionSnapshot {
  cost?: number; // this app's AI cost so far (micro-dollars)
  profile: Profile;
  stage: Stage;
  reply: GuideReply | null;
  lastExchange: { question?: string; answer: string } | null;
  doc: StageDoc | null;
  docs: StageDoc[]; // every document so far, approved ones included
  shipped: boolean;
  checklist: string | null;
  app: { version: number; html: string } | null;
  stepsBuilt: number;
  pendingChanges: string[]; // the change list waiting to be built
  techSummary?: string; // the Tech plan's one-line "Here's how I'll build it!"
}
