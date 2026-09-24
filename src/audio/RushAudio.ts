import type { FxRecord } from '../rush/RushSim';
import {
  musicEvents,
  bpmFor,
  stepSeconds,
  midiToHz,
  type MusicEvent,
  type MusicLevel
} from './RushMusic';

/**
 * Every sound in Rush, synthesised live with the Web Audio API.
 *
 * No samples: each sound is a few oscillators and a noise buffer shaped by envelopes. That keeps
 * the download at zero bytes, lets every sound vary slightly each time it plays (the cure for the
 * machine-gun effect of one sample repeated), and lets pitch track the game — coins climb in
 * pitch as you chain them, the engine revs with speed, the band speeds up with the car.
 *
 * ## Graph
 *
 *     music ─┐
 *     sfx ───┼─► compressor ─► slow-mo lowpass ─► master ─► speakers
 *     engine ┘
 *
 * The music bus is ducked for a moment on crashes and explosions, so the impact owns the mix.
 *
 * ## Scheduling
 *
 * Music notes are scheduled slightly ahead on the audio clock by a short timer — the standard
 * look-ahead pattern — so timing is sample-accurate however irregular the frame rate is.
 */

const MUTE_KEY = 'vorixa.audio.muted';

const MASTER_LEVEL = 0.8;
const MUSIC_LEVEL = 0.3;
const SFX_LEVEL = 0.75;
const ENGINE_LEVEL = 0.1;

const LOOKAHEAD = 0.12;
const SCHEDULER_INTERVAL_MS = 25;

/** Coins picked up within this window of each other climb in pitch. */
const COIN_CHAIN_WINDOW = 0.6;

const VOICE_LEVEL: Record<MusicEvent['voice'], number> = {
  kick: 0.9,
  snare: 0.45,
  hat: 0.16,
  bass: 0.42,
  arp: 0.13,
  pad: 0.09,
  lead: 0.2
};

export class RushAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private slowmoFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;

  private engineOscA!: OscillatorNode;
  private engineOscB!: OscillatorNode;
  private engineFilter!: BiquadFilterNode;
  private engineGain!: GainNode;

  private muted = loadMuted();
  private musicLevel: MusicLevel | null = 'title';
  private bpm = bpmFor(0);
  private step = 0;
  private nextStepTime = 0;
  private scheduler: number | null = null;
  private readonly events: MusicEvent[] = [];

  private coinChain = 0;
  private lastCoinAt = -Infinity;

  public get isMuted(): boolean {
    return this.muted;
  }

  /** Must be called from a user gesture; browsers refuse to start audio otherwise. */
  public async unlock(): Promise<void> {
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // The next gesture will try again; there is nothing useful to tell the player.
      }
    }
  }

  private build(): void {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;

    this.slowmoFilter = ctx.createBiquadFilter();
    this.slowmoFilter.type = 'lowpass';
    this.slowmoFilter.frequency.value = 20000;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_LEVEL;

    compressor.connect(this.slowmoFilter).connect(this.master).connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = MUSIC_LEVEL;
    this.musicBus.connect(compressor);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = SFX_LEVEL;
    this.sfxBus.connect(compressor);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.buildEngine(compressor);

    // A backgrounded tab throttles timers; rather than let the band pile up and burst on
    // return, the whole context sleeps while hidden.
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });

    this.nextStepTime = ctx.currentTime + 0.1;
    this.scheduler = window.setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
  }

  /** Two detuned saws through a lowpass: a buzzy toy engine rather than a realistic one. */
  private buildEngine(destination: AudioNode): void {
    const ctx = this.ctx!;
    this.engineOscA = ctx.createOscillator();
    this.engineOscA.type = 'sawtooth';
    this.engineOscB = ctx.createOscillator();
    this.engineOscB.type = 'square';
    this.engineOscB.detune.value = -1200 + 8;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 4;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOscA.connect(this.engineFilter);
    this.engineOscB.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(destination);
    this.engineOscA.start();
    this.engineOscB.start();
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_LEVEL, this.ctx.currentTime, 0.03);
    try {
      window.localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // The preference simply will not persist.
    }
    return this.muted;
  }

  /** Silences everything while paused; the music resumes on the beat it left. */
  public setPaused(paused: boolean): void {
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend();
    else if (!document.hidden) void this.ctx.resume();
  }

  /** 0 = normal time, 1 = full slow motion. Muffles the whole mix, which is what sells it. */
  public setSlowmo(amount: number): void {
    if (!this.ctx) return;
    const a = amount < 0 ? 0 : amount > 1 ? 1 : amount;
    this.slowmoFilter.frequency.setTargetAtTime(20000 * Math.pow(600 / 20000, a), this.ctx.currentTime, 0.06);
  }

  /**
   * Per-frame state: engine pitch, music level and tempo.
   * @param speedT 0 at start speed, 1 at top speed.
   * @param level The music level, or null to let the band stop (game over).
   */
  public update(speed: number, speedT: number, nitro: boolean, level: MusicLevel | null): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Engine note rises with speed; nitro adds a roar by opening the filter and the level.
    const base = 38 + speed * 1.5 + (nitro ? 18 : 0);
    this.engineOscA.frequency.setTargetAtTime(base, t, 0.08);
    this.engineOscB.frequency.setTargetAtTime(base, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(nitro ? 2200 : 500 + speed * 14, t, 0.1);
    const moving = speed > 1 ? 1 : speed;
    this.engineGain.gain.setTargetAtTime(ENGINE_LEVEL * moving * (nitro ? 1.6 : 1), t, 0.1);

    this.bpm = bpmFor(speedT);
    this.musicLevel = level;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // After a stall, rejoin the beat rather than firing every missed note at once.
    if (this.nextStepTime < ctx.currentTime - 0.2) this.nextStepTime = ctx.currentTime + 0.05;
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD) {
      if (this.musicLevel) {
        const n = musicEvents(this.step, this.musicLevel, this.events);
        const stepLength = stepSeconds(this.bpm);
        for (let i = 0; i < n; i++) this.playNote(this.events[i], this.nextStepTime, stepLength);
      }
      this.step++;
      this.nextStepTime += stepSeconds(this.bpm);
    }
  }

  private playNote(e: MusicEvent, when: number, stepLength: number): void {
    const level = VOICE_LEVEL[e.voice] * e.gain;
    const bus = this.musicBus;
    switch (e.voice) {
      case 'kick':
        this.sweep('sine', 150, 42, when, 0.14, level, bus);
        break;
      case 'snare':
        this.noiseHit(when, 0.12, level, 'highpass', 1400, bus);
        this.sweep('triangle', 220, 160, when, 0.06, level * 0.6, bus);
        break;
      case 'hat':
        this.noiseHit(when, 0.035, level, 'highpass', 7500, bus);
        break;
      case 'bass':
        this.tone('square', midiToHz(e.midi), when, stepLength * e.length * 0.9, level, bus, 700);
        break;
      case 'arp':
        this.tone('square', midiToHz(e.midi), when, stepLength * 0.8, level, bus, 3200);
        break;
      case 'pad':
        this.tone('sawtooth', midiToHz(e.midi), when, stepLength * e.length, level, bus, 900, 0.25);
        break;
      case 'lead':
        this.tone('triangle', midiToHz(e.midi), when, stepLength * e.length * 0.85, level, bus, 5000, 0.01, 5);
        break;
    }
  }

  // ─── Building blocks ────────────────────────────────────────────────────────────────────────

  /** A pitched note with an attack/release envelope and an optional lowpass and vibrato. */
  private tone(
    type: OscillatorType,
    hz: number,
    when: number,
    duration: number,
    level: number,
    destination: AudioNode,
    cutoff = 20000,
    attack = 0.005,
    vibratoHz = 0,
    pan = 0
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(level, when + attack);
    gain.gain.setTargetAtTime(0, when + Math.max(duration - 0.02, attack), 0.03);
    let node: AudioNode = osc;
    if (cutoff < 20000) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      node = node.connect(filter);
    }
    if (vibratoHz > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = vibratoHz;
      const depth = ctx.createGain();
      depth.gain.value = hz * 0.012;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(when);
      lfo.stop(when + duration + 0.2);
    }
    node.connect(gain);
    this.route(gain, destination, pan);
    osc.start(when);
    osc.stop(when + duration + 0.2);
  }

  /** A pitch sweep: kicks, pews, boings, thumps. */
  private sweep(
    type: OscillatorType,
    fromHz: number,
    toHz: number,
    when: number,
    duration: number,
    level: number,
    destination: AudioNode,
    pan = 0
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(toHz, 1), when + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    this.route(gain, destination, pan);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  /** Filtered noise: hats, snares, explosions, crunches, whooshes. */
  private noiseHit(
    when: number,
    duration: number,
    level: number,
    filterType: BiquadFilterType,
    cutoff: number,
    destination: AudioNode,
    pan = 0,
    sweepTo = 0
  ): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    // A random start point, so no two noise hits are the same slice.
    const offset = Math.random() * 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(cutoff, when);
    if (sweepTo > 0) filter.frequency.exponentialRampToValueAtTime(sweepTo, when + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter).connect(gain);
    this.route(gain, destination, pan);
    source.start(when, offset, duration + 0.05);
  }

  private route(node: AudioNode, destination: AudioNode, pan: number): void {
    if (pan !== 0) {
      const panner = this.ctx!.createStereoPanner();
      panner.pan.value = pan < -1 ? -1 : pan > 1 ? 1 : pan;
      node.connect(panner).connect(destination);
    } else {
      node.connect(destination);
    }
  }

  /** Pulls the music down briefly so an impact owns the mix. */
  private duck(depth: number, seconds: number): void {
    const t = this.ctx!.currentTime;
    const g = this.musicBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(MUSIC_LEVEL * (1 - depth), t + 0.02);
    g.setTargetAtTime(MUSIC_LEVEL, t + 0.05, seconds);
  }

  // ─── Effects ────────────────────────────────────────────────────────────────────────────────

  /** One sound per simulation effect, panned toward where it happened. */
  public play(fx: FxRecord): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const pan = fx.x / 7;
    const out = this.sfxBus;
    // A few cents of random detune per play: repeated sounds stop sounding like a recording.
    const vary = 1 + (Math.random() - 0.5) * 0.06;

    switch (fx.type) {
      case 'coin': {
        this.coinChain = now - this.lastCoinAt < COIN_CHAIN_WINDOW ? Math.min(this.coinChain + 1, 12) : 0;
        this.lastCoinAt = now;
        // Climbs a major scale as the chain grows — the sound of a streak.
        const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21];
        const base = midiToHz(83 + scale[this.coinChain]);
        this.tone('square', base, now, 0.05, 0.12, out, 6000, 0.002, 0, pan);
        this.tone('square', base * 1.335, now + 0.05, 0.09, 0.12, out, 6000, 0.002, 0, pan);
        break;
      }
      case 'fire':
        this.sweep('square', 1300 * vary, 260, now, 0.07, 0.07, out, pan);
        break;
      case 'hit':
        this.noiseHit(now, 0.05, 0.25, 'bandpass', 2600 * vary, out, pan);
        break;
      case 'smash':
        // Wood: a hollow knock plus a crunchy band of noise.
        this.sweep('triangle', 190 * vary, 70, now, 0.14, 0.5, out, pan);
        this.noiseHit(now, 0.18, 0.45, 'bandpass', 900 * vary, out, pan, 300);
        break;
      case 'explode':
        this.explosion(now, 1, pan);
        this.duck(0.5, 0.25);
        break;
      case 'crash':
        this.explosion(now, 1.4, pan);
        // A metallic clang: two inharmonic squares, the cartoon "bonk".
        this.tone('square', 523 * vary, now, 0.18, 0.12, out, 3000, 0.002, 0, pan);
        this.tone('square', 741 * vary, now, 0.14, 0.09, out, 3000, 0.002, 0, pan);
        this.duck(0.8, 0.5);
        break;
      case 'jump':
        this.sweep('triangle', 260 * vary, 720, now, 0.16, 0.35, out, pan);
        break;
      case 'ramp':
        this.tone('triangle', 300, now, 0.45, 0.35, out, 20000, 0.005, 9, pan);
        this.sweep('triangle', 300, 1100, now, 0.4, 0.3, out, pan);
        this.noiseHit(now, 0.4, 0.2, 'bandpass', 600, out, pan, 3000);
        break;
      case 'land':
        if (fx.amount > 6) this.sweep('sine', 120, 45, now, 0.12, Math.min(fx.amount / 16, 1) * 0.6, out, pan);
        break;
      case 'pickup': {
        // A bright major arpeggio; hearts get a warmer, lower one.
        const root = fx.amount === 1 ? 67 : 72;
        [0, 4, 7, 12].forEach((interval, i) =>
          this.tone('square', midiToHz(root + interval), now + i * 0.06, 0.1, 0.12, out, 5000, 0.003, 0, pan)
        );
        break;
      }
      case 'enemyFire':
        // A descending "bwow" — a warning, not an attack yet.
        this.sweep('sawtooth', 700 * vary, 180, now, 0.25, 0.14, out, pan);
        break;
      case 'itemGet':
        // The roulette: a fast climbing flutter.
        for (let i = 0; i < 6; i++) this.tone('square', midiToHz(76 + (i % 3) * 4 + i), now + i * 0.04, 0.04, 0.09, out, 6000, 0.002, 0, pan);
        break;
      case 'itemUse':
        this.sweep('sawtooth', 220, 880, now, 0.25, 0.12, out, pan);
        break;
      case 'shieldPop':
        this.noiseHit(now, 0.2, 0.35, 'highpass', 3000, out, pan);
        this.sweep('sine', 1400, 300, now, 0.25, 0.2, out, pan);
        break;
      case 'lightning':
        this.noiseHit(now, 0.6, 0.6, 'lowpass', 8000, out, 0, 400);
        this.sweep('sawtooth', 1800, 60, now, 0.5, 0.2, out);
        this.duck(0.7, 0.4);
        break;
      case 'nearMiss':
        this.noiseHit(now, 0.22, 0.3, 'bandpass', 2400 * vary, out, pan, 500);
        this.sweep('sine', 900 * vary, 1500, now, 0.12, 0.12, out, pan);
        break;
      case 'jumpOver':
        this.sweep('square', 600, 1200, now, 0.12, 0.1, out, pan);
        break;
      case 'flip':
        [0, 4, 7, 12, 16].forEach((interval, i) =>
          this.tone('square', midiToHz(72 + interval), now + i * 0.045, 0.08, 0.12, out, 6000, 0.002, 0, pan)
        );
        break;
      case 'sloppyLanding':
        this.sweep('sine', 110, 40, now, 0.25, 0.7, out, pan);
        this.tone('square', 196, now + 0.05, 0.25, 0.1, out, 1500, 0.005, 7, pan);
        break;
      case 'takedown':
        this.explosion(now, 1.3, pan);
        this.tone('square', 784, now + 0.08, 0.1, 0.12, out, 5000, 0.002, 0, pan);
        this.tone('square', 1047, now + 0.16, 0.18, 0.12, out, 5000, 0.002, 0, pan);
        this.duck(0.6, 0.35);
        break;
      case 'gameOver': {
        // The sad trombone: four falling notes, the last one wobbling.
        this.musicLevel = null;
        const notes = [67, 66, 65, 64];
        notes.forEach((midi, i) =>
          this.tone('sawtooth', midiToHz(midi - 12), now + 0.35 + i * 0.32, i === 3 ? 0.9 : 0.28, 0.2, out, 1400, 0.02, i === 3 ? 6 : 0)
        );
        break;
      }
    }
  }

  /** Nitro ignition: a rising whoosh. */
  public nitro(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.noiseHit(ctx.currentTime, 0.5, 0.35, 'bandpass', 400, this.sfxBus, 0, 4000);
    this.sweep('sawtooth', 90, 260, ctx.currentTime, 0.4, 0.12, this.sfxBus);
  }

  /** Slow motion starting: a reversed-feeling swell. */
  public slowmoStart(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.sweep('sine', 900, 220, ctx.currentTime, 0.5, 0.25, this.sfxBus);
  }

  /** The race begins: a quick rising "ready, go!" chime. */
  public go(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    [72, 76, 79, 84].forEach((midi, i) =>
      this.tone('square', midiToHz(midi), ctx.currentTime + i * 0.07, 0.12, 0.13, this.sfxBus, 5000)
    );
  }

  /** A soft whoosh for a lane change, so steering has a sound even when nothing is hit. */
  public swerve(direction: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.noiseHit(ctx.currentTime, 0.14, 0.12, 'bandpass', 1800, this.sfxBus, direction * 0.6, 700);
  }

  private explosion(now: number, size: number, pan: number): void {
    const out = this.sfxBus;
    this.sweep('sine', 130, 34, now, 0.35 * size, 0.8, out, pan);
    this.noiseHit(now, 0.45 * size, 0.6, 'lowpass', 4000, out, pan, 180);
  }

  public dispose(): void {
    if (this.scheduler !== null) window.clearInterval(this.scheduler);
    void this.ctx?.close();
  }
}

function loadMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
