// spec.md > Themes: colors, a motif set, a waiting animation, and microcopy per theme.
import type { CSSProperties } from 'react';
import type { ThemeId } from '../types';

export interface Theme {
  id: ThemeId;
  name: string;
  emoji: string;
  motifs: string[]; // decorations that float around waits and headers
  animation: 'bounce' | 'orbit' | 'drive' | 'hop' | 'twinkle' | 'type';
  thinking: string; // shown while the guide is replying
  building: string; // shown while the app is being built
  colors: { bg: string; surface: string; surface2: string; ink: string; muted: string; accent: string; accentSoft: string; line: string };
}

export const THEMES: Theme[] = [
  {
    id: 'unicorns', name: 'Unicorns', emoji: '🦄', motifs: ['✨', '🌈', '⭐', '💖'], animation: 'hop',
    thinking: 'Sprinkling some magic on that…', building: 'Mixing rainbow sparkles into your app…',
    colors: { bg: '#fdf4ff', surface: '#ffffff', surface2: '#fae8ff', ink: '#3b0764', muted: '#86198f', accent: '#c026d3', accentSoft: '#f5d0fe', line: '#f0abfc' },
  },
  {
    id: 'princesses', name: 'Princesses', emoji: '👑', motifs: ['🏰', '💎', '🌸', '✨'], animation: 'twinkle',
    thinking: 'Consulting the royal planners…', building: 'The royal builders are hard at work…',
    colors: { bg: '#fff1f2', surface: '#ffffff', surface2: '#ffe4e6', ink: '#4c0519', muted: '#9f1239', accent: '#e11d48', accentSoft: '#fecdd3', line: '#fda4af' },
  },
  {
    id: 'robots', name: 'Robots', emoji: '🤖', motifs: ['⚙️', '🔩', '💡', '🔋'], animation: 'bounce',
    thinking: 'Beep boop, thinking…', building: 'Robots are bolting your app together…',
    colors: { bg: '#ecfeff', surface: '#ffffff', surface2: '#cffafe', ink: '#083344', muted: '#0e7490', accent: '#0e7490', accentSoft: '#a5f3fc', line: '#67e8f9' },
  },
  {
    id: 'cars', name: 'Cars', emoji: '🏎️', motifs: ['🏁', '🛞', '⛽', '🚦'], animation: 'drive',
    thinking: 'Revving up an answer…', building: 'Racing to build your app…',
    colors: { bg: '#fff7ed', surface: '#ffffff', surface2: '#ffedd5', ink: '#431407', muted: '#9a3412', accent: '#c2410c', accentSoft: '#fed7aa', line: '#fdba74' },
  },
  {
    id: 'space', name: 'Space', emoji: '🚀', motifs: ['🪐', '⭐', '🌙', '☄️'], animation: 'orbit',
    thinking: 'Checking with mission control…', building: 'Launching your app into orbit…',
    colors: { bg: '#eef2ff', surface: '#ffffff', surface2: '#e0e7ff', ink: '#1e1b4b', muted: '#4338ca', accent: '#4f46e5', accentSoft: '#c7d2fe', line: '#a5b4fc' },
  },
  {
    id: 'arcade', name: 'Neon Arcade', emoji: '👾', motifs: ['🕹️', '⭐', '💥', '🎮'], animation: 'hop',
    thinking: 'Loading the next level…', building: 'Powering up your app…',
    colors: { bg: '#0d0821', surface: '#170f33', surface2: '#231750', ink: '#f5f3ff', muted: '#c4b5fd', accent: '#c81e68', accentSoft: '#3d1d63', line: '#4c2a85' },
  },
  {
    id: 'music', name: 'Music', emoji: '🎧', motifs: ['🎵', '🎸', '🥁', '🎹'], animation: 'bounce',
    thinking: 'Finding the right notes…', building: 'Mixing your app track by track…',
    colors: { bg: '#fffbeb', surface: '#ffffff', surface2: '#fef3c7', ink: '#3b2205', muted: '#92400e', accent: '#b45309', accentSoft: '#fde68a', line: '#fcd34d' },
  },
  {
    id: 'sports', name: 'Sports', emoji: '⚽', motifs: ['🏀', '🏆', '⏱️', '🎾'], animation: 'bounce',
    thinking: 'Huddling up on that…', building: 'Your app is in training…',
    colors: { bg: '#f0fdf4', surface: '#ffffff', surface2: '#dcfce7', ink: '#052e16', muted: '#166534', accent: '#15803d', accentSoft: '#bbf7d0', line: '#86efac' },
  },
  {
    id: 'nature', name: 'Nature', emoji: '🌿', motifs: ['🌻', '🦋', '🍃', '🌲'], animation: 'twinkle',
    thinking: 'Letting that idea grow…', building: 'Growing your app…',
    colors: { bg: '#f7f7ee', surface: '#ffffff', surface2: '#ecefdc', ink: '#1f2a14', muted: '#4d6b2f', accent: '#55803a', accentSoft: '#dbe8c8', line: '#c5d6a8' },
  },
  {
    id: 'office', name: 'Office', emoji: '💼', motifs: ['📎', '📊', '☕', '🗂️'], animation: 'type',
    thinking: 'Thinking it through…', building: 'Building your app…',
    colors: { bg: '#f7f6f3', surface: '#ffffff', surface2: '#efede8', ink: '#1f1d1a', muted: '#6b655c', accent: '#2f6f5e', accentSoft: '#dcebe5', line: '#e2dcd2' },
  },
];

// The welcome and profile screens start neutral; the chosen theme takes over from there.
export const DEFAULT_THEME: ThemeId = 'office';

export function themeById(id: ThemeId): Theme {
  return THEMES.find(t => t.id === id) ?? THEMES[0];
}

export function themeStyle(id: ThemeId): CSSProperties {
  const c = themeById(id).colors;
  return {
    '--t-bg': c.bg, '--t-surface': c.surface, '--t-surface-2': c.surface2, '--t-ink': c.ink,
    '--t-muted': c.muted, '--t-accent': c.accent, '--t-accent-soft': c.accentSoft, '--t-line': c.line,
  } as CSSProperties;
}
