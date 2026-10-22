// spec.md > Prompt Builder: assembles the layers in a fixed, stable-first order so each
// prompt starts with the previous one (spec.md > Context and Token Budget).
import type { Turn } from '../claude.js';
import { WRAPPER_LAYER } from './wrapperLayer.js';
import { SAFETY_LAYER } from './safety.js';
import { dialLayer } from './dial.js';
import { stageInstructions } from '../stages.js';
import { WAITING_INSTRUCTIONS } from './waitingLayer.js';
import { ageGroupOf, type Profile, type Stage, type StageDoc } from '../types.js';

const THEME_HINTS: Record<string, string> = {
  unicorns: 'unicorns, rainbows, sparkles',
  princesses: 'castles, crowns, royal gardens',
  robots: 'robots, gears, blinking lights',
  cars: 'race cars, roads, garages',
  space: 'rockets, planets, stars',
  arcade: 'neon arcade: glowing colors, pixel art, high scores',
  music: 'music: notes, instruments, rhythm',
  sports: 'sports: balls, scoreboards, trophies',
  nature: 'nature: plants, animals, sunshine',
  office: 'a calm, tidy, professional workspace',
};

const STAGE_NAMES: Record<Stage, string> = {
  start: 'Start (document: learner profile)',
  idea: 'Idea (document: scope)',
  design: 'Design (document: PRD)',
  tech: 'Tech plan (document: spec)',
  build: 'Build (document: build checklist)',
  ship: 'Ship',
};

export interface StoredMessage {
  role: 'user' | 'model';
  text: string;
}

export function buildSystemInstruction(profile: Profile, stage: Stage, approvedDocs: StageDoc[], waiting = false): string {
  const docs = approvedDocs.length
    ? approvedDocs.map(d => `----- ${d.kind} (approved) -----\n${d.markdown.trim()}`).join('\n\n')
    : '(none yet)';
  return [
    WRAPPER_LAYER,
    SAFETY_LAYER,
    `# STAGE INSTRUCTIONS\n\nCurrent stage: ${STAGE_NAMES[stage]}.\n\n${waiting ? WAITING_INSTRUCTIONS : stageInstructions(stage, profile.experience <= 1, ageGroupOf(profile) !== 'adult')}`,
    dialLayer(profile),
    `# THEME\n\nThe person chose the "${profile.theme}" theme (${THEME_HINTS[profile.theme] ?? profile.theme}). It is only Build With Me's own look and your personality (a playful word now and then), not a topic: it says nothing about what their app is about. Never suggest app ideas, examples, cards, or picture content from it, and never assume their app is about it; use their own words and interests instead.`,
    `# APPROVED DOCUMENTS\n\n${docs}`,
  ].join('\n\n');
}

/** Messages oldest first; new ones are only ever appended. */
export function buildContents(messages: StoredMessage[]): Turn[] {
  return messages.map(m => ({ role: m.role, text: m.text }));
}

export function stageKickoff(stage: Stage, waiting = false): string {
  if (waiting) return '[app] The app is being built right now. Start the waiting chat.';
  return `[app] The person has just arrived at the ${STAGE_NAMES[stage]} stage. Begin.`;
}
