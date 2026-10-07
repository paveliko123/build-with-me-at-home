// spec.md > Safety: what an app or a picture can show a person, as plain words for the safety check.

/** The app's words for the safety check: everything the app can show, and nothing else. The
 *  page's text, the words in its drawings, every quoted string in its scripts and event handlers
 *  (messages, names, word lists live there), attribute text people see, words drawn by styles
 *  (`content:`), and the "changed:" note. Code, styles and markup are left out, so a big app stays
 *  one or two pieces; the check reads all the pieces. Safety review 2: one-word strings (a hangman
 *  app's words), emoji, single-quoted attributes and spelled-out characters (&#107;) count too. */
export function appWords(html: string): string {
  const note = html.match(/<!--\s*changed:\s*([\s\S]*?)-->/i)?.[1] ?? '';
  const handlers = (html.match(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi) ?? []).map((h) => decode(h.replace(/^[^=]+=\s*/, '').slice(1, -1)));
  const scripts = [...(html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? []), ...handlers].join('\n');
  const quoted = scripts.match(/"(?:[^"\\\n]|\\.)+"|'(?:[^'\\\n]|\\.)+'|`(?:[^`\\]|\\.)+`/g) ?? [];
  const strings = quoted.map((q) => unescapeJs(q.slice(1, -1).replace(/\$\{[^}]*\}/g, ' '))).filter((q) => SHOWABLE.test(q));
  const styles = [...(html.match(/<style[\s\S]*?<\/style>/gi) ?? []), ...(html.match(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi) ?? [])].join('\n');
  const drawn = (styles.match(/content\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/gi) ?? []).map((c) => c.replace(/^content\s*:\s*/i, '').slice(1, -1));
  const shownAttrs = (html.match(/\s(?:title|alt|placeholder|aria-label|aria-description|value|label|content|data-[\w-]+)\s*=\s*("[^"]*"|'[^']*')/gi) ?? []).map((a) => a.replace(/^[^=]+=\s*/, '').slice(1, -1));
  const page = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Drawings: only their words (text, titles), so nothing harmful hides in a picture (audit B2).
    .replace(/<svg[\s\S]*?<\/svg>/gi, (svg) => ` ${(svg.match(/<(text|tspan|title|desc)\b[^>]*>[\s\S]*?<\/\1>/gi) ?? []).join(' ')} `)
    .replace(/<[^>]+>/g, ' ');
  return decode([note, page, ...shownAttrs, ...drawn, ...strings].join(' ')).replace(/\s+/g, ' ').trim();
}

/** Letters or emoji: something a person could read on screen. */
const SHOWABLE = /[\p{L}\p{Extended_Pictographic}]/u;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** Spelled-out characters (&#107; &#x6b; &amp;) as the screen shows them. */
export function decode(text: string): string {
  return text.replace(/&#(\d{1,7});|&#x([0-9a-f]{1,6});|&([a-z]+);/gi, (_m, dec, hex, name) => {
    if (name) return NAMED[name.toLowerCase()] ?? ' ';
    const code = dec ? Number(dec) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
  });
}
/** Escapes in a script string ("k", "\x6b") as the screen shows them. */
function unescapeJs(text: string): string {
  return text.replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi, (_m, a, b, c) => {
    const code = parseInt(a ?? b ?? c, 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
  });
}
