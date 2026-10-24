/**
 * Akhada's music (ADR-0017): a raga played live in Web Audio. Nothing is recorded and nothing is
 * borrowed: a tanpura drone, a plucked string that improvises inside the raga's notes with slides
 * between them, a flute voice for the southern arenas, and a tala on tabla or war drums.
 *
 * A raga here is its notes (semitones above Sa), the way phrases climb and fall, a tala (beats in
 * the cycle and where the strong strokes fall), a tempo and a voice.
 */

export interface RagaDef {
  name: string;
  /** Semitones above Sa, one octave, ascending. */
  notes: number[];
  /** Sa, in Hz. */
  sa: number;
  tempo: number;
  /** One stroke per beat of the cycle: D dha (bass and treble), T ta/na (treble), G ge (bass), . rest. */
  tala: string;
  drums: 'tabla' | 'nagara' | 'mridangam' | 'dholak';
  lead: 'sitar' | 'flute' | 'shehnai';
}

export const RAGAS: Record<string, RagaDef> = {
  // Varanasi at dawn: devotional, the flattened second and sixth.
  bhairav: { name: 'Bhairav', notes: [0, 1, 4, 5, 7, 8, 11], sa: 138.6, tempo: 92, tala: 'D.TT.D.T D.TT.DTT', drums: 'tabla', lead: 'sitar' },
  // Kurukshetra: Malkauns is grave and old; war drums under it.
  malkauns: { name: 'Malkauns', notes: [0, 3, 5, 8, 10], sa: 123.5, tempo: 112, tala: 'DG.DG.D.DGDGD.D.', drums: 'nagara', lead: 'shehnai' },
  // Rameswaram: Hamsadhwani, bright and Carnatic, on the flute with mridangam.
  hamsadhwani: { name: 'Hamsadhwani', notes: [0, 2, 4, 7, 11], sa: 146.8, tempo: 104, tala: 'D.T.TD.TD.T.TDTT', drums: 'mridangam', lead: 'flute' },
  // Jaisalmer: Maand, the desert folk raga, with dholak.
  maand: { name: 'Maand', notes: [0, 2, 4, 5, 7, 9, 11], sa: 130.8, tempo: 98, tala: 'D.TD.TD.D.TD.TDT', drums: 'dholak', lead: 'sitar' }
};

export class Raga {
  private bus: GainNode;
  private drone: { stop: () => void } | null = null;
  private nextBeat = 0;
  private step = 0;
  private degree = 0;
  private phraseLeft = 0;
  private rising = true;
  private seed = 1;
  private def: RagaDef = RAGAS.bhairav;
  public intensity = 0;

  public constructor(private readonly ctx: AudioContext, out: AudioNode) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.5;
    this.bus.connect(out);
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Starts a raga: the drone first, then the tala and the melody on the next update. */
  public play(def: RagaDef): void {
    this.stop();
    this.def = def;
    this.step = 0;
    this.degree = 0;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.drone = this.tanpura(def.sa);
  }

  public stop(): void {
    this.drone?.stop();
    this.drone = null;
  }

  private freq(degree: number): number {
    const n = this.def.notes.length;
    const octave = Math.floor(degree / n);
    const note = this.def.notes[((degree % n) + n) % n];
    return this.def.sa * 2 * Math.pow(2, octave + note / 12);
  }

  // ─── Voices ─────────────────────────────────────────────────────────────────────────────────

  /** A tanpura: Pa, Sa, Sa, low Sa, plucked in turn forever, each a buzzing sawtooth through a resonant filter. */
  private tanpura(sa: number): { stop: () => void } {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.16;
    out.connect(this.bus);
    const strings = [sa * 1.5, sa * 2, sa * 2, sa];
    let i = 0;
    let alive = true;
    const pluck = () => {
      if (!alive) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = strings[i++ % strings.length];
      // The jivari buzz: a band that sweeps as the string rings.
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 6;
      f.frequency.setValueAtTime(o.frequency.value * 6, t);
      f.frequency.exponentialRampToValueAtTime(o.frequency.value * 2, t + 3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.6, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
      o.connect(f).connect(g).connect(out);
      o.start(t);
      o.stop(t + 3.7);
      setTimeout(pluck, 900);
    };
    pluck();
    return {
      stop: () => {
        alive = false;
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      }
    };
  }

  /** A plucked string (Karplus-Strong), with an optional slide (meend) up to the next note. */
  private sitar(at: number, from: number, to: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    const n = Math.max(2, Math.round(ctx.sampleRate / from));
    const length = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const d = buffer.getChannelData(0);
    const line = new Float32Array(n);
    for (let i = 0; i < n; i++) line[i] = Math.random() * 2 - 1;
    let p = 0;
    for (let i = 0; i < length; i++) {
      const next = (p + 1) % n;
      // Averaging with a slight bias keeps the bright, buzzing attack of a sitar.
      const v = line[p] * 0.55 + line[next] * 0.448;
      line[p] = v;
      d[i] = v;
      p = next;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // The slide: playback rate glides from the plucked note to the target.
    src.playbackRate.setValueAtTime(1, at);
    if (to !== from) src.playbackRate.exponentialRampToValueAtTime(to / from, at + Math.min(dur * 0.6, 0.35));
    const g = ctx.createGain();
    g.gain.value = gain;
    const tone = ctx.createBiquadFilter();
    tone.type = 'peaking';
    tone.frequency.value = 2600;
    tone.gain.value = 6;
    src.connect(tone).connect(g).connect(this.bus);
    src.start(at);
  }

  /** A breathy flute (bansuri) or a reedy shehnai: an oscillator with vibrato and breath. */
  private wind(at: number, from: number, to: number, dur: number, gain: number, reed: boolean): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = reed ? 'sawtooth' : 'sine';
    o.frequency.setValueAtTime(from, at);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(to, at + dur * 0.4);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.value = from * 0.012;
    vib.connect(depth).connect(o.frequency);
    const shape = ctx.createBiquadFilter();
    shape.type = reed ? 'bandpass' : 'lowpass';
    shape.frequency.value = reed ? 1400 : 2400;
    shape.Q.value = reed ? 2 : 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.06);
    g.gain.setValueAtTime(gain, at + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(shape).connect(g).connect(this.bus);
    o.start(at);
    vib.start(at);
    o.stop(at + dur + 0.05);
    vib.stop(at + dur + 0.05);
  }

  private drum(at: number, kind: 'bass' | 'treble', style: RagaDef['drums'], accent: boolean): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.connect(this.bus);
    if (kind === 'bass') {
      // The bayan's ge, the nagara's boom: a low tone that bends down.
      const o = ctx.createOscillator();
      const low = style === 'nagara' ? 60 : style === 'dholak' ? 90 : 75;
      o.frequency.setValueAtTime(low * 1.6, at);
      o.frequency.exponentialRampToValueAtTime(low, at + 0.12);
      g.gain.setValueAtTime(style === 'nagara' ? 1.1 : 0.7, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + (style === 'nagara' ? 0.6 : 0.35));
      o.connect(g);
      o.start(at);
      o.stop(at + 0.7);
    } else {
      // The dayan's na: a ringing pitched tap; mridangam and dholak are drier.
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = this.def.sa * (style === 'mridangam' ? 4 : 3);
      const ring = style === 'tabla' ? 0.22 : 0.09;
      g.gain.setValueAtTime(accent ? 0.42 : 0.26, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + ring);
      o.connect(g);
      o.start(at);
      o.stop(at + ring + 0.02);
      const n = ctx.createBufferSource();
      const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      n.buffer = b;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3000;
      n.connect(hp).connect(g);
      n.start(at);
    }
  }

  // ─── The performance ────────────────────────────────────────────────────────────────────────

  /** Schedules the next beats a little ahead. Call every frame while the fight is on. */
  public update(): void {
    if (!this.drone) return;
    const ctx = this.ctx;
    const tempo = this.def.tempo * (1 + this.intensity * 0.35);
    const beat = 60 / tempo / 2;
    if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.05;
    while (this.nextBeat < ctx.currentTime + 0.25) {
      const at = this.nextBeat;
      const stroke = this.def.tala[this.step % this.def.tala.length];
      const sam = this.step % this.def.tala.length === 0;
      if (stroke === 'D' || stroke === 'G') this.drum(at, 'bass', this.def.drums, sam);
      if (stroke === 'D' || stroke === 'T') this.drum(at, 'treble', this.def.drums, sam);
      // The melody: a phrase climbs or falls a note at a time, sometimes leaping or holding,
      // returning to Sa on the sam (the cycle's first beat).
      if (this.step % 2 === 0) this.phrase(at, beat * 2, sam);
      this.step++;
      this.nextBeat += beat;
    }
  }

  private phrase(at: number, length: number, sam: boolean): void {
    if (this.phraseLeft <= 0) {
      this.phraseLeft = 3 + Math.floor(this.random() * 5);
      this.rising = this.random() < (this.degree < 2 ? 0.85 : this.degree > 8 ? 0.15 : 0.55);
    }
    this.phraseLeft--;
    if (this.random() < 0.18 && !sam) return; // A breath.
    const from = this.degree;
    if (sam) this.degree = this.random() < 0.5 ? 0 : this.def.notes.length;
    else this.degree += this.random() < 0.15 ? (this.rising ? 2 : -2) : this.rising ? 1 : -1;
    this.degree = Math.max(-2, Math.min(12, this.degree));
    const slide = this.random() < 0.3;
    const a = this.freq(slide ? from : this.degree);
    const b = this.freq(this.degree);
    const hold = length * (this.random() < 0.25 ? 2 : 1);
    if (this.def.lead === 'sitar') this.sitar(at, a, b, Math.max(0.5, hold * 1.6), 0.5);
    else this.wind(at, a, b, hold * 0.95, this.def.lead === 'flute' ? 0.16 : 0.07, this.def.lead === 'shehnai');
  }

  /** The shankh: a conch blown long, the call to battle. */
  public conch(): void {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(this.def.sa * 1.5, at);
    o.frequency.linearRampToValueAtTime(this.def.sa * 1.58, at + 0.4);
    o.frequency.linearRampToValueAtTime(this.def.sa * 1.5, at + 1.6);
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 820;
    formant.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.9, at + 0.35);
    g.gain.setValueAtTime(0.9, at + 1.3);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 2);
    o.connect(formant).connect(g).connect(this.bus);
    o.start(at);
    o.stop(at + 2.1);
  }

  /** A temple bell: inharmonic partials, a long ring. */
  public bell(): void {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    for (const [ratio, gain, decay] of [[1, 0.5, 3.5], [2.76, 0.25, 2], [5.4, 0.12, 1.2], [8.93, 0.06, 0.7]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = this.def.sa * 4 * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      o.connect(g).connect(this.bus);
      o.start(at);
      o.stop(at + decay + 0.05);
    }
  }
}
