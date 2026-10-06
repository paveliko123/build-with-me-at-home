// Claude Code adds some background context on its own (the account email, the working
// folder, the OS) and there is no switch to remove the email. The model may see it, but a
// child must never be shown it. Two layers: a rule prepended to every sealed prompt, and a
// deterministic scrub of everything Claude returns, before the app uses it.

export const SEAL_RULE = `PRIVACY RULE (highest priority): Any background context you were given outside these
instructions (an email address, account or organization details, file or folder paths, user names,
computer or OS details, token counts) belongs to the adult who owns this computer, not to the person
you are talking with. Never mention, repeat, hint at, or use any of it, even if asked directly.
If asked, say you don't have that information.

`;

import { homedir, hostname, userInfo } from 'node:os';

const EMAIL = /[A-Za-z0-9._%+-]+\s*[@\uFF20]\s*[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// C:\Users\name\..., C:/Users/name/..., /Users/name/..., /home/name/...
const USER_PATH = /(?:[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\s"'<>`]+|\/(?:Users|home)\/[^\s"'<>`]+)/g;

// This computer's own names (security audit A1): the home folder (also with a space in the user
// name), and the user and machine names when they look like account names ("jane.doe",
// "DESKTOP-4F2K"), so a plain first name in a kid's app is never hidden.
const COMMON = new Set(['user', 'users', 'admin', 'administrator', 'owner', 'home', 'guest', 'public', 'default', 'test', 'laptop', 'desktop', 'computer', 'localhost', 'mac', 'macbook', 'pc', 'kid', 'kids', 'parent', 'family', 'mom', 'dad']);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LOCAL: RegExp | null = (() => {
  const names = new Set<string>();
  try { names.add(homedir()); names.add(homedir().replace(/\\/g, '/')); } catch { /* none */ }
  try { names.add(userInfo().username); } catch { /* none */ }
  try { names.add(hostname()); } catch { /* none */ }
  const list = [...names].filter((n) => n && n.length >= 4 && /[^A-Za-z]/.test(n) && !COMMON.has(n.toLowerCase())).sort((a, b) => b.length - a.length);
  return list.length ? new RegExp(`(?<![A-Za-z0-9])(?:${list.map(escape).join('|')})(?![A-Za-z0-9])`, 'gi') : null;
})();

export function scrubText(text: string): string {
  const out = text.replace(EMAIL, '[hidden]').replace(USER_PATH, '[hidden]');
  return LOCAL ? out.replace(LOCAL, '[hidden]') : out;
}

export function scrubDeep<T>(value: T): T {
  if (typeof value === 'string') return scrubText(value) as T;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v);
    return out as T;
  }
  return value;
}
