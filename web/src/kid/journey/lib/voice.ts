// The guide's voice (prd.md > Talking): the device's own speech synthesis, a voice per theme and
// a slower pace for kids, with a ⚙️ menu for the voice and speed. Ported from Build With Me's
// voice.ts without its cloud voice (option B). The browser's online voices (Chrome's Google, Edge's Online) still send the text out.
import type { AgeGroup, GuideReply, ThemeId } from '../types';

const CHARACTER: Record<ThemeId, { pitch: number; rate: number; pick: number }> = {
  unicorns: { pitch: 1.35, rate: 1.0, pick: 1 },
  princesses: { pitch: 1.25, rate: 0.95, pick: 2 },
  robots: { pitch: 0.7, rate: 1.0, pick: 0 },
  cars: { pitch: 1.0, rate: 1.1, pick: 3 },
  space: { pitch: 0.95, rate: 0.95, pick: 4 },
  arcade: { pitch: 1.15, rate: 1.1, pick: 5 },
  music: { pitch: 1.1, rate: 1.0, pick: 6 },
  sports: { pitch: 1.0, rate: 1.1, pick: 7 },
  nature: { pitch: 1.0, rate: 0.92, pick: 8 },
  office: { pitch: 1.0, rate: 1.0, pick: 0 },
};

function browserVoice(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function voiceSupported(): boolean {
  return browserVoice();
}

/** The ⚙️ menu: the theme's own voice, or one of this device's voices in its language. */
export function deviceVoices(): { name: string; label: string }[] {
  if (!browserVoice()) return [{ name: '', label: 'Theme voice' }];
  const lang = (navigator.language || 'en-US').slice(0, 2).toLowerCase();
  const all = window.speechSynthesis.getVoices();
  const local = all.filter(v => v.lang.toLowerCase().startsWith(lang));
  return [{ name: '', label: 'Theme voice' }, ...(local.length ? local : all).map(v => ({ name: v.name, label: v.name.replace(/^(Microsoft|Google)\s+/, '').replace(/\s+-\s+.*$/, '') }))];
}
let voiceName = '';
export function setVoiceName(name: string) { voiceName = name; }

/** What the guide says aloud for a reply: its words, question, and cards. */
export function replySpeech(reply: GuideReply): string {
  const cards = reply.cards?.length ? ` You can pick ${reply.cards.map(c => c.label.replace(/[.!?…]+$/, '')).join(', or ')}.` : '';
  return `${reply.say} ${reply.question ?? ''}${cards}`;
}

/** Markdown, emoji, and links read badly aloud: strip them to plain sentences. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\b([\w-]+)\.(html|md|js|css)\b/gi, '$1 $2')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>|~()[\]]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickVoice(theme: ThemeId): SpeechSynthesisVoice | undefined {
  const all = window.speechSynthesis.getVoices();
  if (voiceName) { const chosen = all.find(v => v.name === voiceName); if (chosen) return chosen; }
  const lang = (navigator.language || 'en-US').toLowerCase();
  const local = all.filter(v => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
  const pool = local.length ? local : all;
  if (!pool.length) return undefined;
  // Natural-sounding voices first, when the device has them.
  const nice = pool.filter(v => /natural|neural|google|premium|enhanced/i.test(v.name));
  const list = nice.length >= 2 ? nice : pool;
  return list[CHARACTER[theme].pick % list.length];
}

// Talking speed: a default for the age group, changeable in the ⚙️ menu.
export const SPEEDS = [0.85, 1, 1.2, 1.4, 1.7];
export function defaultSpeed(ageGroup: AgeGroup): number {
  return ageGroup === 'kid' ? 0.85 : ageGroup === 'teen' ? 1.2 : 1.4;
}
let speed = 1;
export function setVoiceSpeed(value: number) { speed = value; }

let generation = 0;
let lastCancel = 0;

/** Stop talking right away (the person tapped the mic, muted, or moved on). */
export function stopSpeaking() {
  generation++;
  if (browserVoice() && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
    window.speechSynthesis.cancel();
    lastCancel = Date.now();
  }
}

/**
 * Say the text, one sentence at a time (long utterances get cut off in some browsers).
 * onDone fires once, after the last sentence or if speaking is stopped or fails.
 */
export function speak(text: string, theme: ThemeId, _ageGroup: AgeGroup, onDone?: () => void) {
  stopSpeaking();
  const clean = speakable(text);
  if (!voiceSupported() || !clean) { onDone?.(); return; }
  const mine = generation;
  // Speaking right after a cancel clips the first word in some browsers: wait a moment.
  const wait = Math.max(0, 250 - (Date.now() - lastCancel));
  window.setTimeout(() => { if (mine === generation) say(clean, theme, mine, onDone); }, wait);
}

function say(clean: string, theme: ThemeId, mine: number, onDone?: () => void) {
  const sentences = clean.match(/[^.!?…]+[.!?…]*\s*/g)?.map(s => s.trim()).filter(Boolean) ?? [clean];
  const character = CHARACTER[theme];
  const voice = pickVoice(theme);
  let finished = false;
  const done = () => { if (!finished) { finished = true; onDone?.(); } };
  // A silent warm-up wakes the audio output first, so the reply's first word isn't swallowed.
  wakeOutput();
  const warmUp = new SpeechSynthesisUtterance('.');
  warmUp.volume = 0;
  if (voice) warmUp.voice = voice;
  // Learner tests (2026-10-06, 2026-10-22): the first word was still cut on the laptop, so the
  // sentences start once the warm-up has finished and at least half a second has passed (or
  // after 1.5 seconds if the warm-up never reports back).
  let started = false;
  const begin = () => {
    if (started || mine !== generation) return;
    started = true;
    queue();
    // Safety net: some browsers never fire onend, so also finish once nothing is speaking.
    window.setTimeout(() => { poll = window.setInterval(check, 700); }, 300);
  };
  const readyAt = Date.now() + LEAD_IN_MS;
  const afterWarmUp = () => window.setTimeout(begin, Math.max(0, readyAt - Date.now()));
  warmUp.onend = afterWarmUp;
  warmUp.onerror = afterWarmUp;
  window.speechSynthesis.speak(warmUp);
  window.setTimeout(begin, WARM_UP_MAX_MS);
  const queue = () => sentences.forEach((sentence, i) => {
    const u = new SpeechSynthesisUtterance(sentence);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? navigator.language ?? 'en-US';
    u.pitch = character.pitch;
    u.rate = Math.min(2, character.rate * speed);
    if (i === sentences.length - 1) u.onend = () => { if (mine === generation) done(); };
    u.onerror = () => { if (mine === generation) done(); };
    window.speechSynthesis.speak(u);
  });
  let poll = 0;
  const check = () => {
    if (mine !== generation || finished) { window.clearInterval(poll); return; }
    if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) { window.clearInterval(poll); done(); }
  };
}
const LEAD_IN_MS = 500;
const WARM_UP_MAX_MS = 1500;

let wakeContext: AudioContext | null = null;
/** A barely audible blip wakes speakers that sleep when idle (some laptops, Bluetooth headphones),
 *  which otherwise swallow the first word. Does nothing where audio isn't allowed yet. */
function wakeOutput() {
  try {
    wakeContext ??= new AudioContext();
    void wakeContext.resume();
    const tone = wakeContext.createOscillator(), level = wakeContext.createGain();
    level.gain.value = 0.003;
    tone.frequency.value = 220;
    tone.connect(level).connect(wakeContext.destination);
    tone.start();
    tone.stop(wakeContext.currentTime + 0.3);
  } catch { /* the warm-up and the wait still run */ }
}

// Build With Me's Build screen waited for its cloud voice before showing a line; the device voice
// starts at once, so these are no-ops kept for the ported screens.
export const voiceReady = (_text: string): Promise<void> => Promise.resolve();
export function warmVoice() { /* nothing to warm up */ }
