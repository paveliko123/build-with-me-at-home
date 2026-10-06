// Each theme's emoji (web/src/kid/journey/themes/themes.ts), for the My apps shelf.
import type { ThemeId } from './types.js';

const EMOJI: Record<ThemeId, string> = {
  unicorns: '🦄', princesses: '👑', robots: '🤖', cars: '🏎️', space: '🚀',
  arcade: '👾', music: '🎧', sports: '⚽', nature: '🌿', office: '💼',
};

export const themeEmoji = (theme: ThemeId) => EMOJI[theme] ?? '✨';
