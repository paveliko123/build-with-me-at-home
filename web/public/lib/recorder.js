// Browser recorder: microphone → 16 kHz mono 16-bit PCM → POST chunks to the server while
// the person talks → ends on a real pause (or "I'm done") → returns the transcript.
// Needs a secure page (localhost, or https after the home certificate is installed).

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor('bwm-tap', Tap);`;

export function micSupported() {
  return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.AudioWorkletNode);
}

function downsample(input, fromRate) {
  if (fromRate === 16000) return input;
  const ratio = fromRate / 16000, out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0; for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function toInt16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) { const s = Math.max(-1, Math.min(1, f32[i])); out[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  return out;
}

/**
 * Records one utterance.
 * opts: { pauseMs (silence that ends it, default 1500), maxMs (default 30000), onLevel(0..1), onState(state) }
 * Returns a controller: { done(): ends now, result: Promise<{text, seconds, transcribeMs, waitedMs, heardSpeech, failed}> }
 */
export async function recordUtterance(opts = {}) {
  const pauseMs = opts.pauseMs ?? 1500, maxMs = opts.maxMs ?? 30000;
  const id = 'u' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
  const src = ctx.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(ctx, 'bwm-tap');
  src.connect(tap);

  let pending = [], pendingLen = 0, heardSpeech = false, lastLoud = performance.now(), stopped = false;
  const started = performance.now();
  const uploads = [];
  const flush = () => {
    if (!pendingLen) return;
    const merged = new Float32Array(pendingLen); let o = 0;
    for (const p of pending) { merged.set(p, o); o += p.length; }
    pending = []; pendingLen = 0;
    const pcm = toInt16(downsample(merged, ctx.sampleRate));
    uploads.push(fetch(`/api/speech/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: pcm.buffer }));
  };

  let resolveDone;
  const doneSignal = new Promise((r) => (resolveDone = r));
  tap.port.onmessage = (e) => {
    if (stopped) return;
    const frame = e.data; pending.push(frame); pendingLen += frame.length;
    let sum = 0; for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length), level = Math.min(1, rms * 12);
    opts.onLevel?.(level);
    const now = performance.now();
    if (rms > 0.02) { heardSpeech = true; lastLoud = now; }
    if (pendingLen >= ctx.sampleRate) flush(); // ~1 second per chunk
    if ((heardSpeech && now - lastLoud > pauseMs) || now - started > maxMs) resolveDone();
  };
  opts.onState?.('listening');

  const result = (async () => {
    await doneSignal;
    stopped = true;
    const endedAt = performance.now();
    flush();
    tap.port.onmessage = null; src.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close();
    opts.onState?.('thinking');
    const sent = await Promise.all(uploads.map((u) => u.then((x) => x.ok, () => false)));
    const res = await fetch(`/api/speech/${id}/end`, { method: 'POST' });
    const r = await res.json().catch(() => ({}));
    // heardSpeech: the person really talked, so an empty result is a problem worth saying.
    return { ...r, text: typeof r.text === 'string' ? r.text : '', heardSpeech, failed: !res.ok || sent.includes(false), waitedMs: Math.round(performance.now() - endedAt) };
  })();

  return { done: () => resolveDone(), result };
}
