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

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// C:\Users\name\..., C:/Users/name/..., /Users/name/..., /home/name/...
const USER_PATH = /(?:[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\s"'<>`]+|\/(?:Users|home)\/[^\s"'<>`]+)/g;

export function scrubText(text: string): string {
  return text.replace(EMAIL, '[hidden]').replace(USER_PATH, '[hidden]');
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
