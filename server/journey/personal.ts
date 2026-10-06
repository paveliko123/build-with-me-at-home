// spec.md > Kid Safety Check: the instant mask. Obvious personal details in what a kid types or
// says are replaced before anything is saved or sent to a model. Patterns only (no AI); the Haiku
// check in safetyCheck.ts catches what these miss.

export type PersonalKind = 'name' | 'school' | 'email' | 'phone' | 'address';

const WORD = "[A-Z][\\p{L}'’-]+";
const RULES: { kind: PersonalKind; pattern: RegExp; to: string | ((...m: string[]) => string) }[] = [
  { kind: 'email', pattern: /[\w.+-]+@[\w-]+(\.[\w-]+)+/g, to: '[email]' },
  // 8 or more digits with phone punctuation ("2+2=4" and scores stay).
  { kind: 'phone', pattern: /(?<![\w.])\+?\d(?:[\s().-]*\d){7,}(?![\w.])/g, to: '[phone]' },
  { kind: 'address', pattern: new RegExp(`\\b\\d{1,5}\\s+(?:${WORD}\\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Close|Crescent)\\b\\.?`, 'gu'), to: '[address]' },
  { kind: 'address', pattern: /\b(I live (?:at|on|in))\s+[^.,!?\n]{3,60}/gi, to: (_m, lead) => `${lead} [address]` },
  // Only a school someone goes to: an app called "Monster School" keeps its name.
  { kind: 'school', pattern: /\b(I go to|I'm at|I am at|I attend)\s+[^.,!?\n]{2,40}?\s(?:school|academy|elementary|primary|middle|high)\b/gi, to: (_m, lead) => `${lead} [school]` },
  { kind: 'school', pattern: /\b(my school is( called)?)\s+[^.,!?\n]{2,40}/gi, to: (_m, lead) => `${lead} [school]` },
  // The word after "my name is" is a name in any case ("my name is sam"); a capitalised second
  // word is the surname. No i flag, so "and" after a name is never taken for a surname.
  { kind: 'name', pattern: new RegExp(`\\b([Mm]y name is|[Mm]y name's|[Mm]y full name is|I'm called|I am called)\\s+([\\p{L}'’-]+)(?:\\s+(${WORD}))?`, 'gu'), to: (_m, lead) => `${lead} [name]` },
];

/** The text with obvious personal details hidden, and which kinds were found. */
export function maskPersonal(text: string): { text: string; kinds: PersonalKind[] } {
  let out = text;
  const kinds = new Set<PersonalKind>();
  for (const rule of RULES) {
    out = out.replace(rule.pattern, (...m) => {
      kinds.add(rule.kind);
      return typeof rule.to === 'string' ? rule.to : rule.to(...(m as string[]));
    });
  }
  return { text: out, kinds: [...kinds] };
}
