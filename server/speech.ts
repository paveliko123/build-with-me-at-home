// Speech-to-text on this computer (Transformers.js). Default model: Moonshine base (MIT), whose
// cost scales with how long the person spoke. Whisper always processes a padded 30-second
// window, so it was ~2x slower for short kid sentences (scripts/whisper-bench.ts). Browsers
// send 16 kHz mono 16-bit PCM chunks; when the utterance ends we transcribe it. No audio is
// ever written to disk.
// Docs: https://huggingface.co/docs/transformers.js, https://huggingface.co/onnx-community/moonshine-base-ONNX

import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { pluginDataDir } from './paths.js';

const MODEL = process.env.BWM_SPEECH_MODEL || 'onnx-community/moonshine-base-ONNX';
const IS_WHISPER = /whisper/i.test(MODEL);
const SAMPLE_RATE = 16_000;
const MAX_SECONDS = 60;

type Transcriber = (audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text: string } | Array<{ text: string }>>;
let transcriberPromise: Promise<Transcriber> | null = null;

export function modelsDir(): string {
  const dir = join(pluginDataDir(), 'models');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Loads (and on first use downloads) the speech model. Safe to call many times. */
export function loadSpeech(): Promise<Transcriber> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = modelsDir();
      env.allowRemoteModels = process.env.BWM_OFFLINE !== '1';
      const asr = await pipeline('automatic-speech-recognition', MODEL, { dtype: IS_WHISPER ? 'q8' : 'fp32', device: 'cpu' });
      return asr as unknown as Transcriber;
    })();
    transcriberPromise.catch(() => (transcriberPromise = null));
  }
  return transcriberPromise;
}

interface Utterance { chunks: Buffer[]; bytes: number; started: number; lastChunk: number }
const utterances = new Map<string, Utterance>();

// Forget utterances that were abandoned (tab closed mid-sentence).
setInterval(() => {
  const now = Date.now();
  for (const [id, u] of utterances) if (now - u.lastChunk > 2 * 60_000) utterances.delete(id);
}, 60_000).unref();

/** Adds a chunk of 16 kHz mono Int16 little-endian PCM to an utterance. */
export function addChunk(id: string, pcm: Buffer): { seconds: number } {
  let u = utterances.get(id);
  if (!u) { u = { chunks: [], bytes: 0, started: Date.now(), lastChunk: Date.now() }; utterances.set(id, u); }
  if (u.bytes / 2 / SAMPLE_RATE < MAX_SECONDS) { u.chunks.push(pcm); u.bytes += pcm.length; }
  u.lastChunk = Date.now();
  return { seconds: u.bytes / 2 / SAMPLE_RATE };
}

export function pcm16ToFloat32(pcm: Buffer): Float32Array {
  const samples = new Float32Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
  return samples;
}

export interface Transcript { text: string; seconds: number; transcribeMs: number }

/** A quiet recording (a headset mic with echo cancellation, a kid far from the tablet) comes
 *  back as nothing, so it's turned up first: the loudest moment to 0.9, at most 40 times. */
export function normalize(audio: Float32Array): { audio: Float32Array; peak: number; gain: number } {
  let peak = 0;
  for (let i = 0; i < audio.length; i++) { const v = Math.abs(audio[i]); if (v > peak) peak = v; }
  const gain = peak > 0 ? Math.min(40, 0.9 / peak) : 1;
  if (gain <= 1.05) return { audio, peak, gain: 1 };
  const out = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) out[i] = audio[i] * gain;
  return { audio: out, peak, gain };
}

export async function transcribeFloat32(audio: Float32Array): Promise<Transcript> {
  const asr = await loadSpeech();
  const t0 = Date.now();
  const out = await asr(audio, IS_WHISPER ? { chunk_length_s: 30 } : {});
  const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim();
  return { text: cleanTranscript(text), seconds: audio.length / SAMPLE_RATE, transcribeMs: Date.now() - t0 };
}

/** Ends an utterance and returns its text. */
export async function finishUtterance(id: string): Promise<Transcript> {
  const u = utterances.get(id);
  utterances.delete(id);
  if (!u || u.bytes < SAMPLE_RATE * 2 * 0.3) { // < 0.3 s: nothing said
    console.log(JSON.stringify({ event: 'speech', result: u ? 'too-short' : 'no-audio', seconds: u ? +(u.bytes / 2 / SAMPLE_RATE).toFixed(1) : 0 }));
    return { text: '', seconds: 0, transcribeMs: 0 };
  }
  const { audio, peak, gain } = normalize(pcm16ToFloat32(Buffer.concat(u.chunks)));
  try {
    const t = await transcribeFloat32(audio);
    // Never the words (they're the kid's): only enough to tell why a recording came back empty.
    console.log(JSON.stringify({ event: 'speech', result: t.text ? 'ok' : 'empty', seconds: +t.seconds.toFixed(1), peak: +peak.toFixed(3), gain: +gain.toFixed(1), chars: t.text.length, ms: t.transcribeMs }));
    return t;
  } catch (e) {
    console.error(JSON.stringify({ event: 'speech', result: 'error', error: String((e as Error)?.message ?? e).slice(0, 200) }));
    throw e;
  }
}

// Speech models sometimes emit bracketed sound notes or a lone "you" on silence.
function cleanTranscript(t: string): string {
  const s = t.replace(/\[[^\]]*\]|\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  return /^(you\.?|thank you\.?)$/i.test(s) ? '' : s;
}
