// Compares Whisper model/precision options on this computer for speed and accuracy.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline, env } from '@huggingface/transformers';
import { modelsDir, pcm16ToFloat32 } from '../server/speech.js';

env.cacheDir = modelsDir();
const SENTENCE = 'I want to make an app where my cat flies through space and eats the stars.';
const wav = readFileSync(join(tmpdir(), 'build-with-me-dev', 'e2-sample.wav'));
const data = wav.indexOf(Buffer.from('data')) + 8;
const audio = pcm16ToFloat32(wav.subarray(data));
const words = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean);

import { cpus } from 'node:os';
const T = cpus().length;
const options: Array<[string, 'q8' | 'fp32' | 'q4', boolean, number]> = [
  ['onnx-community/moonshine-tiny-ONNX', 'fp32', false, 0],
  ['onnx-community/moonshine-base-ONNX', 'fp32', false, 0],
  ['onnx-community/moonshine-base-ONNX', 'q8', false, 0],
  ['Xenova/whisper-base.en', 'fp32', false, 0],
];
for (const [model, dtype, chunked, threads] of options) {
  const asr: any = await pipeline('automatic-speech-recognition', model, { dtype, device: 'cpu', ...(threads ? { session_options: { intraOpNumThreads: threads } } : {}) } as any);
  await asr(audio.subarray(0, 16000)); // warm-up
  const times: number[] = []; let text = '';
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    const out = await asr(audio, chunked ? { chunk_length_s: 30 } : {});
    times.push(Date.now() - t); text = out.text.trim();
  }
  const hits = words(SENTENCE).filter((w) => words(text).includes(w)).length;
  console.log(`${model} ${dtype} threads=${threads}: median ${times.sort((a, b) => a - b)[1]} ms · ${hits}/16 words · "${text}"`);
  await asr.dispose?.();
}
