// The checks every built app must pass before it's saved (ported from Build With Me).

export const MAX_APP_BYTES = 400_000;

const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /<script[^>]*\bsrc\s*=/i, reason: 'loads an outside script (<script src>)' },
  { pattern: /<link[^>]*\bhref\s*=\s*["']?(https?:)?\/\//i, reason: 'links an outside file (<link href>)' },
  { pattern: /@import\s+(url\()?["']?(https?:)?\/\//i, reason: 'imports outside CSS (@import)' },
  { pattern: /\bfetch\s*\(/, reason: 'uses fetch()' },
  { pattern: /XMLHttpRequest|WebSocket|EventSource|sendBeacon/, reason: 'contacts the network' },
  { pattern: /<form[^>]*\baction\s*=\s*["']?(https?:)?\/\//i, reason: 'sends a form to the internet' },
  { pattern: /<(img|audio|video|source|iframe)[^>]*\bsrc\s*=\s*["']?(https?:)?\/\//i, reason: 'loads media from the internet' },
  // Security review round 2 (H3): no password boxes however they're made, no WebRTC (it gets
  // past the page's network rules), no browser credential or payment prompts.
  { pattern: /type\s*=\s*["']?password|\.type\s*=\s*["'`]password|setAttribute\(\s*["'`]type["'`]\s*,\s*["'`]password|text-security/i, reason: 'has a password box (apps never ask for passwords)' },
  { pattern: /RTCPeerConnection|RTCDataChannel/, reason: 'contacts the network (WebRTC)' },
  { pattern: /navigator\.credentials|PaymentRequest/, reason: 'asks for credentials or payment' },
  // Security audit B1: made in code instead of in the page (the page's network rules block
  // these too; this catches them before the kid ever sees a broken app).
  { pattern: /createElement\(\s*["'`]script/i, reason: 'adds a script from code' },
  { pattern: /\.src\s*=\s*["'`](https?:)?\/\//i, reason: 'loads something from the internet' },
  { pattern: /url\(\s*["']?(https?:)?\/\//i, reason: 'loads a picture or font from the internet (CSS url())' },
  { pattern: /\bimport\s*(\(\s*|[^;'"`]*\bfrom\s*)["'`](https?:)?\/\//i, reason: 'imports code from the internet' },
  // Learner request: no way out to a website (the screens' frame rules block it too; this
  // catches it before the kid ever taps a link that does nothing).
  { pattern: /<a\b[^>]*\bhref\s*=\s*["']?(https?:)?\/\//i, reason: 'links to a website' },
  { pattern: /\bwindow\.open\s*\(|\blocation(\.href)?\s*=\s*["'`](https?:)?\/\/|\blocation\.(assign|replace)\s*\(\s*["'`](https?:)?\/\//i, reason: 'opens a website' },
];

/** Strip Markdown fences or stray text around the document. */
export function extractHtml(raw: string): string {
  let text = raw.trim();
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.search(/<!doctype html/i);
  if (start > 0) text = text.slice(start);
  const end = text.toLowerCase().lastIndexOf('</html>');
  if (end >= 0) text = text.slice(0, end + '</html>'.length);
  return text;
}

export function checkApp(html: string): string[] {
  const problems: string[] = [];
  if (!/^<!doctype html/i.test(html)) problems.push('does not start with <!doctype html>');
  if (!/<\/html>\s*$/i.test(html)) problems.push('does not end with </html> (likely cut off)');
  if (Buffer.byteLength(html, 'utf8') > MAX_APP_BYTES) problems.push(`is larger than ${MAX_APP_BYTES / 1000} KB`);
  for (const { pattern, reason } of FORBIDDEN) if (pattern.test(html)) problems.push(reason);
  return problems;
}
