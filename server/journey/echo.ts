// Learner testing (2026-10-05): the guide often ended "say" with the very question it also put
// on the question card ("…Ready to build?" + "Ready to build?"), so it was shown and read aloud
// twice. The repeat at the end of "say" is dropped; the question card keeps it.
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export function withoutEchoedQuestion(say: string, question?: string): string {
  const q = question ? norm(question) : '';
  if (!q || !say) return say;
  // Try each sentence or dash boundary, from the last one back.
  const cuts = [0, ...[...say.matchAll(/[.!?…]\s+|\s*[—–]\s*/g)].map(m => m.index! + m[0].length)].reverse();
  for (const at of cuts) {
    if (norm(say.slice(at)) !== q) continue;
    const head = say.slice(0, at).replace(/[\s—–,;:]+$/, '');
    return head && !/[.!?…]$/.test(head) ? `${head}.` : head;
  }
  return say;
}

// Learner tests (2026-10-25, owner yes D-10): "…Which one sounds more fun?" + "Which idea sounds
// more fun to you?", and "Pick the one…" above answer cards, were shown and read aloud as two
// asks. With a question card on screen, a last sentence of "say" that asks again is dropped.
export function withoutSecondAsk(say: string, question?: string, hasCards = false): string {
  if (!question || !say) return say;
  const sentences = say.match(/[^.!?…]+[.!?…]*(\s+|$)/g) ?? [say];
  const last = sentences[sentences.length - 1].trim();
  // Real runs after D-10: drafts still ended "Take a look and see if it matches…" or "Have a read."
  const asks = /\?$/.test(last) || /^(take a look|have a (look|read)|look it over)\b/i.test(last)
    || (hasCards && /^(pick|choose|tap|tell me)\b/i.test(last));
  return asks ? sentences.slice(0, -1).join('').trim() : say;
}
