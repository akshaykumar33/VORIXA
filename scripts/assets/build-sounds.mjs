// Builds VORIXA City's recorded sounds (ADR-0014) from CC0 recordings in assets-src/sounds:
//
//   The Free Firearm Sound Library (OpenGameArt, CC0) — real gunshots, 96 kHz / 24-bit stereo
//   takes of several shots each; and the "Gun reload sounds" pack (OpenGameArt, CC0).
//
// For each gun it finds individual shots by their onsets, cuts each with a natural fade, mixes to
// mono, resamples to 48 kHz, normalises, and writes 16-bit WAVs to public/city/sounds. Two takes
// per gun, so repeated shots do not sound like a loop. No ffmpeg: plain Node.
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'assets-src/sounds';
const LIB = path.join(SRC, 'firearms/Prepared SFX Library');
const OUT = 'public/city/sounds';
fs.mkdirSync(OUT, { recursive: true });

function readWav(file) {
  const b = fs.readFileSync(file);
  let o = 12;
  let fmt = null;
  let data = null;
  while (o < b.length - 8) {
    const id = b.toString('ascii', o, o + 4);
    const size = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(o + 8), channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === 'data') {
      data = b.subarray(o + 8, o + 8 + size);
      break;
    }
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error(`not a wav: ${file}`);
  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.length / (bytes * fmt.channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const at = (i * fmt.channels + c) * bytes;
      let v;
      if (fmt.format === 3) v = data.readFloatLE(at);
      else if (fmt.bits === 16) v = data.readInt16LE(at) / 32768;
      else if (fmt.bits === 24) v = ((data[at] | (data[at + 1] << 8) | (data[at + 2] << 16)) << 8 >> 8) / 8388608;
      else if (fmt.bits === 32) v = data.readInt32LE(at) / 2147483648;
      else v = (data[at] - 128) / 128;
      sum += v;
    }
    mono[i] = sum / fmt.channels;
  }
  return { rate: fmt.rate, samples: mono };
}

/** Resamples by averaging (downsampling by an integer factor) or nearest-sample stretch. */
function resample(samples, from, to) {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  if (Number.isInteger(ratio)) {
    for (let i = 0; i < out.length; i++) {
      let s = 0;
      for (let k = 0; k < ratio; k++) s += samples[i * ratio + k];
      out[i] = s / ratio;
    }
  } else {
    for (let i = 0; i < out.length; i++) {
      const x = i * ratio;
      const i0 = Math.floor(x);
      const t = x - i0;
      out[i] = samples[i0] * (1 - t) + (samples[i0 + 1] ?? 0) * t;
    }
  }
  return out;
}

/** Sample indices where a shot starts: the signal jumps above a share of the peak after quiet. */
function onsets(samples, rate, minGap) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const threshold = peak * 0.35;
  const found = [];
  let last = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > threshold && i - last > minGap * rate) {
      found.push(Math.max(0, i - Math.floor(0.004 * rate)));
      last = i;
    } else if (Math.abs(samples[i]) > threshold) last = i;
  }
  return found;
}

function cut(samples, rate, start, seconds) {
  const n = Math.min(samples.length - start, Math.floor(seconds * rate));
  const out = samples.slice(start, start + n);
  // A short fade in (no click) and a long, natural fade out over the last 45%.
  const fadeIn = Math.floor(0.002 * rate);
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
  const fadeFrom = Math.floor(n * 0.55);
  for (let i = fadeFrom; i < n; i++) out[i] *= Math.pow(1 - (i - fadeFrom) / (n - fadeFrom), 2);
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < n; i++) out[i] *= gain;
  return out;
}

function writeWav(file, samples, rate) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(file, b);
  return b.length;
}

const RATE = 48000;
/** Game gun → recording, and how long a shot rings (with its echo in the recording). */
const GUNS = [
  { id: 'pistol', dir: 'Walther PPQ', seconds: 0.9 },
  { id: 'police', dir: '1911', seconds: 0.9 },
  { id: 'smg', dir: 'Carl Gustav M45', seconds: 0.55 },
  { id: 'rifle', dir: 'AR-15', seconds: 1.0 },
  { id: 'shotgun', dir: 'Mossberg', seconds: 1.4 },
  { id: 'sniper', dir: 'Tikka', seconds: 1.8 }
];

let total = 0;
for (const g of GUNS) {
  const files = fs.readdirSync(path.join(LIB, g.dir)).filter((f) => f.toLowerCase().endsWith('.wav'));
  let made = 0;
  for (const f of files) {
    if (made >= 2) break;
    const { rate, samples } = readWav(path.join(LIB, g.dir, f));
    const mono = resample(samples, rate, RATE);
    const starts = onsets(mono, RATE, g.seconds * 0.8);
    for (const s of starts) {
      if (made >= 2) break;
      if (s + g.seconds * RATE * 0.6 > mono.length) continue;
      const shot = cut(mono, RATE, s, g.seconds);
      total += writeWav(path.join(OUT, `${g.id}-${made + 1}.wav`), shot, RATE);
      made++;
    }
  }
  console.log(`${g.id}: ${made} takes from ${g.dir}`);
}

// Reloads: the whole recordings, trimmed of silence, mono 48 kHz.
for (const [src, out, seconds] of [
  ['gunreload1.wav', 'reload-pistol', 1.4],
  ['assaultriflereload1_0.wav', 'reload-rifle', 1.8],
  ['shotguncock_0.wav', 'reload-shotgun', 0.9]
]) {
  const { rate, samples } = readWav(path.join(SRC, src));
  const mono = resample(samples, rate, RATE);
  const start = onsets(mono, RATE, 5)[0] ?? 0;
  total += writeWav(path.join(OUT, `${out}.wav`), cut(mono, RATE, Math.max(0, start - Math.floor(0.02 * RATE)), seconds), RATE);
  console.log(`${out}: from ${src}`);
}
console.log(`wrote ${(total / 1e6).toFixed(2)} MB to ${OUT}`);
