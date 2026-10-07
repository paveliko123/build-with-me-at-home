// A wellbeing alert should be hard to miss (safety review): a short chime when a new one arrives
// (if the browser allows sound) and a 💛 in the tab title while one is waiting.
const TITLE = 'Build With Me at Home';

export function chime(): void {
  try {
    const ctx = new AudioContext();
    [0, 0.25].forEach((at, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = i ? 880 : 660;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.25);
    });
    window.setTimeout(() => void ctx.close(), 800);
  } catch { /* no sound: the title and the card still show it */ }
}

export function urgentTitle(count: number): void {
  document.title = count > 0 ? `💛 (${count}) ${TITLE}` : TITLE;
}
