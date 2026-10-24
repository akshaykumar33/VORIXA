import type { FightEvent } from '../fighter/Fight';

/**
 * Akhada's sound (ADR-0016), all synthesised: a dhol rhythm under the fight (the deep "dha" and
 * the sharp "na"), punches, kicks, blocks, blasts, thunder and the storm's rain.
 */
export class AkhadaAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private drums: GainNode | null = null;
  private rain: GainNode | null = null;
  private nextBeat = 0;
  private step = 0;
  private tempo = 100;
  public muted = false;

  public unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.drums = this.ctx.createGain();
      this.drums.gain.value = 0.35;
      this.drums.connect(this.master);
    }
    void this.ctx.resume();
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
    return this.muted;
  }

  private noise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private burst(at: number, seconds: number, type: BiquadFilterType, freq: number, gain: number, out: AudioNode = this.master!): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(seconds);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    src.connect(f).connect(g).connect(out);
    src.start(at);
  }

  private tone(at: number, from: number, to: number, seconds: number, gain: number, type: OscillatorType = 'sine', out: AudioNode = this.master!): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + seconds + 0.02);
  }

  /** Keeps the dhol going: schedules beats a little ahead of time. `intensity` 0..1 speeds it up. */
  public update(fighting: boolean, intensity: number): void {
    const ctx = this.ctx;
    if (!ctx || !fighting) return;
    this.tempo = 96 + intensity * 40;
    const sixteenth = 60 / this.tempo / 4;
    if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.05;
    // Keherwa-like: dha . . na | dha . na . | dha . . na | dha na dha na
    const pattern = 'D..ND.N.D..NDNDN';
    while (this.nextBeat < ctx.currentTime + 0.2) {
      const hit = pattern[this.step % pattern.length];
      const at = this.nextBeat;
      if (hit === 'D') {
        this.tone(at, 95, 48, 0.32, 0.9, 'sine', this.drums!);
        this.burst(at, 0.05, 'lowpass', 600, 0.5, this.drums!);
      } else if (hit === 'N') {
        this.burst(at, 0.07, 'bandpass', 2600, 0.7, this.drums!);
        this.tone(at, 420, 380, 0.08, 0.25, 'triangle', this.drums!);
      }
      this.step++;
      this.nextBeat += sixteenth;
    }
  }

  public play(events: readonly FightEvent[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          this.burst(t, e.heavy ? 0.25 : 0.12, 'lowpass', e.heavy ? 1800 : 2600, e.heavy ? 1 : 0.7);
          this.tone(t, e.heavy ? 140 : 190, 45, e.heavy ? 0.25 : 0.12, 0.7);
          break;
        case 'block':
          this.burst(t, 0.08, 'highpass', 3000, 0.4);
          this.tone(t, 900, 700, 0.06, 0.15, 'square');
          break;
        case 'attack':
          this.burst(t, 0.12, 'bandpass', 1400, 0.18);
          break;
        case 'projectile':
          this.tone(t, e.super ? 160 : 320, e.super ? 900 : 640, e.super ? 0.7 : 0.35, 0.3, 'sawtooth');
          this.burst(t, e.super ? 0.8 : 0.3, 'bandpass', 1200, 0.4);
          break;
        case 'clash':
          this.burst(t, 0.5, 'lowpass', 3000, 0.9);
          break;
        case 'knockdown':
          this.tone(t + 0.25, 70, 35, 0.4, 0.9);
          this.burst(t + 0.25, 0.3, 'lowpass', 400, 0.8);
          break;
        case 'ko':
          this.tone(t, 220, 55, 1.2, 0.5, 'sawtooth');
          break;
        case 'fight':
          [0, 0.09, 0.18].forEach((d) => this.tone(t + d, 95, 48, 0.3, 1, 'sine', this.drums!));
          break;
      }
    }
  }

  /** Thunder: a crack and a long low roll. */
  public thunder(loudness: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.burst(ctx.currentTime, 0.3, 'highpass', 1500, 0.4 * loudness);
    this.burst(ctx.currentTime + 0.05, 2.8, 'lowpass', 160, 1.2 * loudness);
  }

  /** A loop of filtered noise for the monsoon. */
  public setRain(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (on && !this.rain) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise(2);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2200;
      f.Q.value = 0.4;
      this.rain = ctx.createGain();
      this.rain.gain.value = 0.12;
      src.connect(f).connect(this.rain).connect(this.master!);
      src.start();
    } else if (this.rain) this.rain.gain.value = on ? 0.12 : 0;
  }
}
