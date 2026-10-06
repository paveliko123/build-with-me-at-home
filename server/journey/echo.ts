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
