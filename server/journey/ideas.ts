// "💡 Show me ideas" (family trial: kids got stuck and lost interest). Ideas come straight from the
// idea library (ideaLibrary.json, browsable in devpost/idea-library.html): no Claude call, so
// they appear at once. Matched to the age group, and mostly to the mood of the kid's theme, with
// one from elsewhere for variety. Picking one starts the customizing (guideTurn.ts).

import library from './ideaLibrary.json' with { type: 'json' };
import type { AgeGroup } from './types.js';

export interface Idea {
  id: string; emoji: string; title: string; pitch: string; kind: string; ages: ('kid' | 'teen')[]; themes: string[]; size: string;
  howItWorks: string; lookAndFeel: string; makeItYours: string[]; levelUp: string[]; teenTwist?: string; buildNotes: string;
}
export type IdeaCard = Pick<Idea, 'id' | 'emoji' | 'title' | 'pitch'>;

const IDEAS = (library as { ideas: Idea[] }).ideas;

export const ideaById = (id: unknown): Idea | undefined => (typeof id === 'string' ? IDEAS.find((i) => i.id === id) : undefined);

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Three ideas for this kid: two that fit their theme's mood, one from elsewhere. Ideas already
 *  shown (exclude) come back only when everything else has been seen. */
export function pickIdeas(age: AgeGroup, theme: string, exclude: string[] = [], n = 3): IdeaCard[] {
  const group = age === 'kid' ? 'kid' : 'teen';
  const fits = IDEAS.filter((i) => i.ages.includes(group));
  const fresh = fits.filter((i) => !exclude.includes(i.id));
  const pool = fresh.length >= n ? fresh : fits;
  const themed = shuffled(pool.filter((i) => i.themes.includes(theme)));
  const other = shuffled(pool.filter((i) => !i.themes.includes(theme)));
  const picks = [...themed.slice(0, n - 1), ...other.slice(0, 1)];
  for (const i of [...themed, ...other]) if (picks.length < n && !picks.includes(i)) picks.push(i);
  return shuffled(picks.slice(0, n)).map(({ id, emoji, title, pitch }) => ({ id, emoji, title, pitch }));
}

/** What the guide gets when a kid picks an idea: it's their starting point, made theirs by asking
 *  its "make it yours" questions. */
export function ideaNote(idea: Idea, age: AgeGroup): string {
  return [
    '[app] The person tapped "Show me ideas" and picked this idea from the app\'s idea list. It\'s their starting point, not a finished plan: react warmly in one short line, then ask the first "make it yours" question below as your question (with answer cards when the guidance dial allows). Over the next answers ask the others, one at a time, and use only their answers; anything they change or add wins.',
    `Idea: ${idea.title}: ${idea.pitch}`,
    `How it works: ${idea.howItWorks}`,
    `Look ideas: ${idea.lookAndFeel}`,
    ...(age !== 'kid' && idea.teenTwist ? [`For a teen: ${idea.teenTwist}`] : []),
    `Make-it-yours questions:\n${idea.makeItYours.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
  ].join('\n');
}
