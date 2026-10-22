import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { skillsDir } from './skillsDir.js';
import { YOUNG_PROFILE_TEMPLATE } from './prompt/youngProfile.js';
import { YOUNG_PRD_TEMPLATE, YOUNG_SCOPE_TEMPLATE, YOUNG_SPEC_TEMPLATE } from './prompt/youngPlans.js';

/** Kids' and teens' own templates, in place of the course ones (adults keep the course's). */
const YOUNG_TEMPLATES: Partial<Record<Stage, string>> = { start: YOUNG_PROFILE_TEMPLATE, idea: YOUNG_SCOPE_TEMPLATE, design: YOUNG_PRD_TEMPLATE, tech: YOUNG_SPEC_TEMPLATE };
import type { DocKind, Profile, Stage } from './types.js';

export const STAGE_ORDER: Stage[] = ['start', 'idea', 'design', 'tech', 'build', 'ship'];

// Stages the guide conversation (guideTurn) runs. Build and Ship have their own functions.
export const GUIDE_STAGES: Stage[] = ['start', 'idea', 'design', 'tech'];

interface StageSource {
  dir: string;
  files: string[];
  doc: DocKind;
}

const SOURCES: Record<string, StageSource> = {
  start: { dir: '1-start', files: ['SKILL.md', 'templates/learner-profile-template.md'], doc: 'learner-profile' },
  idea: { dir: '2-scope', files: ['SKILL.md', 'templates/scope-template.md'], doc: 'scope' },
  design: { dir: '3-prd', files: ['SKILL.md', 'references/prd-guide.md', 'templates/prd-template.md'], doc: 'prd' },
  tech: { dir: '4-spec', files: ['SKILL.md', 'references/spec-patterns.md', 'templates/spec-template.md'], doc: 'spec' },
  // Experienced end only: planning the build (checklist) before the app builds step by step.
  build: { dir: '5-build', files: ['SKILL.md', 'templates/checklist-template.md'], doc: 'checklist' },
};

export function stageDocKind(stage: Stage): DocKind | undefined {
  return SOURCES[stage]?.doc;
}

// Sections about the terminal, git, folders, and the hand-off, which the app does itself, and
// 5-build's coding loop (the app only plans the build here). Cost levers, 2026-10-04.
const SKIPPED_SECTIONS = ['Where Are We', 'The Folder Check', 'Hand Off', 'Git', 'Before You Start'];
const SKIPPED_BUILD_SECTIONS = ['The Loop', 'When to Pause', 'When Implementation Contradicts the Plan', 'Safe Recovery', 'Proportional Verification', 'When the Checklist Is Complete', 'The Learning Wrap-Up'];

/** The course text without the sections listed (each runs to the next heading of its level or above). */
export function withoutSections(markdown: string, titles: string[]): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let skipLevel = 0;
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      if (skipLevel && level <= skipLevel) skipLevel = 0;
      if (!skipLevel && titles.some(t => heading[2].trim().replace(/`/g, '') === t)) { skipLevel = level; continue; }
    }
    if (!skipLevel) out.push(line);
  }
  return out.join('\n');
}

const cache = new Map<string, string>();

/** The stage's instruction text, byte-identical on every call (it heads the cached prompt prefix). */
/** `young`: a kid or teen, whose Start, Idea, Design and Tech plan use their own templates. */
export function stageInstructions(stage: Stage, guided = false, young = false): string {
  const youngTemplate = young ? YOUNG_TEMPLATES[stage] : undefined;
  const key = `${stage}:${guided}:${!!youngTemplate}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const source = SOURCES[stage];
  if (!source) throw new Error(`No instructions for stage ${stage}`);
  const root = join(skillsDir(), source.dir);
  const skipped = stage === 'build' ? [...SKIPPED_SECTIONS, ...SKIPPED_BUILD_SECTIONS] : SKIPPED_SECTIONS;
  const text = source.files
    .filter(file => !(guided && file.startsWith('references/')))
    .map(file => {
      const body = youngTemplate && file.startsWith('templates/')
        ? youngTemplate.trim()
        : readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n').trim();
      return `----- ${source.dir}/${file} -----\n${file === 'SKILL.md' ? withoutSections(body, skipped).trim() : body}`;
    })
    .join('\n\n');
  cache.set(key, text);
  return text;
}

/** Everyone starts at step 1 (Start), matching the six skills; GUIDED levels get a quick version. */
export function firstStage(_profile: Profile): Stage {
  return 'start';
}

export function nextStage(stage: Stage): Stage {
  const i = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[Math.min(i + 1, STAGE_ORDER.length - 1)];
}
