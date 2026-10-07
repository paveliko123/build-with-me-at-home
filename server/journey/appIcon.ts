// Each app gets its own icon (family trial: every app showed the theme's emoji). The builder
// draws a small SVG in the app's own style, hidden in the page as <svg id="bwm-icon">. It's only
// ever shown as an image (<img>, the tab icon, the report), where no code can run; still, only a
// plain drawing is accepted: no scripts, events, links, outside images or embedded HTML.
// Without a usable drawing, an emoji the guide picked for the idea is used instead.

const ICON = /<svg\b[^>]*\bid\s*=\s*["']bwm-icon["'][^>]*>[\s\S]*?<\/svg>/i;
const UNSAFE = /<\s*(script|foreignObject|iframe|object|embed|image|a|use|animate|set|style)\b|\son[a-z]+\s*=|javascript:|data:|https?:|url\s*\((?!\s*['"]?#)|@import|\bhref\s*=/i;
const MAX = 8000;

/** The app's drawn icon as a standalone SVG file, or null when there's none or it isn't plain. */
export function extractIcon(html: string): string | null {
  const m = html.match(ICON);
  if (!m || m[0].length > MAX || UNSAFE.test(m[0])) return null;
  const open = m[0].match(/^<svg\b[^>]*>/i)![0];
  const viewBox = open.match(/\bviewBox\s*=\s*["']([\d.\s-]+)["']/i)?.[1] ?? '0 0 64 64';
  const inner = m[0].slice(open.length, -'</svg>'.length);
  if (!/<(path|circle|rect|ellipse|polygon|polyline|line|g)\b/i.test(inner)) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="128" height="128">${inner}</svg>`;
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

/** One emoji (a single picture character, with its modifiers), or null. */
export function oneEmoji(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 16) return null;
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)];
  return graphemes.length === 1 && /\p{Extended_Pictographic}/u.test(s) ? s : null;
}

/** A tab icon for an app page: its drawing, or its emoji. */
export function faviconFor(svg: string | null, emoji: string): string {
  if (svg) return svgDataUrl(svg);
  return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`);
}
