import type { WeaponId } from '../city/Weapons';

/**
 * The sound of VORIXA City (ADR-0014), with Web Audio.
 *
 * - **Gunshots** are real recordings (The Free Firearm Sound Library, CC0; built by
 *   `scripts/assets/build-sounds.mjs`): two takes per gun, picked at random and pitched a hair
 *   either way so a burst never repeats itself, then sent through the street's *echo* (a
 *   convolution reverb built from decaying noise with early reflections off the buildings).
 *   Distant shots lose their top end and arrive quieter. Until the recordings have loaded, a
 *   synthesised shot stands in: a crack, a body and a thump per gun.
 * - **Reloads** are recordings too (the "Gun reload sounds" pack, CC0).
 * - **Cars**: an engine of detuned saws and a sub, its pitch driven by RPM through a simulated
 *   gearbox (so it climbs, shifts and drops), tyre squeal from sideways slip, crashes with a low
 *   boom, a metal crunch and glass.
 * - **The city**: a low traffic bed, a police siren that wails from where the police are,
 *   footsteps, and the small sounds of guns (dry clicks, magazines out and in).
 * - **Story**: pickups, stars, heat rising, a job-complete fanfare, a fail sting.
 *
 * Everything is positioned relative to the listener (the hero), panned left and right by angle
 * and attenuated by distance.
 */

interface GunRecipe {
  crack: number;
  crackHz: number;
  body: number;
  bodyHz: number;
  bodyTime: number;
  thump: number;
  thumpHz: number;
  echo: number;
}

const GUNS: Record<WeaponId, GunRecipe> = {
  pistol: { crack: 0.7, crackHz: 3200, body: 0.6, bodyHz: 1800, bodyTime: 0.09, thump: 0.35, thumpHz: 140, echo: 0.35 },
  smg: { crack: 0.55, crackHz: 3600, body: 0.5, bodyHz: 2200, bodyTime: 0.06, thump: 0.25, thumpHz: 160, echo: 0.28 },
  rifle: { crack: 0.85, crackHz: 2800, body: 0.75, bodyHz: 1500, bodyTime: 0.11, thump: 0.5, thumpHz: 110, echo: 0.45 },
  shotgun: { crack: 0.6, crackHz: 2000, body: 1, bodyHz: 900, bodyTime: 0.2, thump: 0.9, thumpHz: 80, echo: 0.6 },
  sniper: { crack: 1, crackHz: 2400, body: 0.9, bodyHz: 1100, bodyTime: 0.18, thump: 0.8, thumpHz: 70, echo: 0.9 }
};

/** Recorded sounds in public/city/sounds: name → number of takes. */
const RECORDED: Record<string, number> = {
  pistol: 2, police: 2, smg: 2, rifle: 2, shotgun: 2, sniper: 2,
  'reload-pistol': 1, 'reload-rifle': 1, 'reload-shotgun': 1
};

/** Which reload recording each gun uses. */
const RELOAD_OF: Record<WeaponId, string> = {
  pistol: 'reload-pistol', smg: 'reload-rifle', rifle: 'reload-rifle', shotgun: 'reload-shotgun', sniper: 'reload-rifle'
};

/** Gear ratios, as fractions of top speed where each gear tops out. */
const GEARS = [0.18, 0.34, 0.52, 0.72, 1];

export class CityAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private muted = false;
  private readonly samples = new Map<string, AudioBuffer[]>();

  // Listener.
  private lx = 0;
  private lz = 0;
  private lyaw = 0;

  // Engine.
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private engineOsc: OscillatorNode[] = [];
  private squealGain!: GainNode;
  private squealFilter!: BiquadFilterNode;

  // Siren and ambience.
  private sirenGain!: GainNode;
  private sirenOsc!: OscillatorNode;
  private sirenPan!: StereoPannerNode;
  private sirenPhase = 0;
  private bedGain!: GainNode;
  /** Rushing air while gliding: bandpassed noise, louder and brighter with speed. */
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;

  public get isMuted(): boolean {
    return this.muted;
  }

  /** Browsers only allow audio after a gesture; call from any input handler. */
  public async unlock(): Promise<void> {
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  private build(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);

    // White noise, reused by every noise voice.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const n = this.noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;

    // The street's echo: a stereo impulse of decaying noise, with a few hard early reflections
    // (the facades across the road) before the diffuse tail.
    const len = Math.floor(ctx.sampleRate * 2.2);
    const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * 0.6;
      for (const [t, g] of [[0.045, 0.7], [0.09, 0.5], [0.16, 0.35], [0.27, 0.22]]) {
        const at = Math.floor((t + ch * 0.007) * ctx.sampleRate);
        for (let k = 0; k < 60; k++) d[at + k] += (Math.random() * 2 - 1) * g * (1 - k / 60);
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    this.reverbSend.connect(this.reverb).connect(this.master);

    // Engine: three detuned saws and a square sub through a lowpass, silent until driving.
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineFilter.Q.value = 3;
    this.engineFilter.connect(this.engineGain).connect(this.sfx);
    for (const [type, detune, level] of [['sawtooth', -7, 0.35], ['sawtooth', 5, 0.35], ['sawtooth', 12, 0.2], ['square', -1200, 0.4]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(this.engineFilter);
      o.start();
      this.engineOsc.push(o);
    }
    // Tyres: bandpassed noise, faded by slip.
    const squeal = ctx.createBufferSource();
    squeal.buffer = this.noise;
    squeal.loop = true;
    this.squealFilter = ctx.createBiquadFilter();
    this.squealFilter.type = 'bandpass';
    this.squealFilter.frequency.value = 2400;
    this.squealFilter.Q.value = 8;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    squeal.connect(this.squealFilter).connect(this.squealGain).connect(this.sfx);
    squeal.start();

    // Siren: one oscillator swept in the classic wail.
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenPan = ctx.createStereoPanner();
    this.sirenOsc.connect(this.sirenGain).connect(this.sirenPan).connect(this.sfx);
    this.sirenPan.connect(this.reverbSend);
    this.sirenOsc.start();

    // The city: a low bed of distant traffic (lowpassed noise with a slow swell).
    const bed = ctx.createBufferSource();
    bed.buffer = this.noise;
    bed.loop = true;
    const bedFilter = ctx.createBiquadFilter();
    bedFilter.type = 'lowpass';
    bedFilter.frequency.value = 320;
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0.05;
    bed.connect(bedFilter).connect(this.bedGain).connect(this.master);
    bed.start();

    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.sfx);
    wind.start();
    void this.loadRecordings(ctx);
  }

  /** Fetches and decodes the recordings; any that fail simply leave the synthesised stand-in. */
  private async loadRecordings(ctx: AudioContext): Promise<void> {
    for (const [name, takes] of Object.entries(RECORDED)) {
      const buffers: AudioBuffer[] = [];
      for (let t = 1; t <= takes; t++) {
        const file = takes > 1 ? `${name}-${t}` : name;
        try {
          const res = await fetch(`/city/sounds/${file}.wav`);
          if (!res.ok) continue;
          buffers.push(await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          // Keep going: one missing take is not worth silence.
        }
      }
      if (buffers.length) this.samples.set(name, buffers);
    }
  }

  /** Plays a recording into a voice chain; false if it has not loaded. */
  private sample(name: string, dest: AudioNode, at: number, level: number, pitch = 1): boolean {
    const takes = this.samples.get(name);
    if (!takes || !this.ctx) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = takes[Math.floor(Math.random() * takes.length)];
    src.playbackRate.value = pitch * (0.97 + Math.random() * 0.06);
    const g = this.ctx.createGain();
    g.gain.value = level;
    src.connect(g).connect(dest);
    src.start(at);
    return true;
  }

  // ─── Positioning ──────────────────────────────────────────────────────────────────────────

  public setListener(x: number, z: number, yaw: number): void {
    this.lx = x;
    this.lz = z;
    this.lyaw = yaw;
  }

  /** Pan (-1..1) and gain (0..1) for a sound at (x, z), and a lowpass for distance. */
  private place(x: number, z: number): { pan: number; gain: number; cutoff: number } {
    const dx = x - this.lx;
    const dz = z - this.lz;
    const d = Math.hypot(dx, dz);
    // The camera's right is (cos yaw, -sin yaw).
    const right = d > 0.01 ? (dx * Math.cos(this.lyaw) - dz * Math.sin(this.lyaw)) / d : 0;
    return { pan: Math.max(-0.9, Math.min(0.9, right * 0.9)), gain: 1 / (1 + d * 0.045), cutoff: 16000 / (1 + d * 0.03) };
  }

  /** A voice chain: source → filter → gain → pan → sfx (+ reverb send). */
  private voice(x: number, z: number, level: number, echo: number): { input: AudioNode; out: GainNode; ctx: AudioContext; at: number } | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return null;
    const p = this.place(x, z);
    const distance = ctx.createBiquadFilter();
    distance.type = 'lowpass';
    distance.frequency.value = p.cutoff;
    const out = ctx.createGain();
    out.gain.value = level * p.gain;
    const pan = ctx.createStereoPanner();
    pan.pan.value = p.pan;
    distance.connect(out).connect(pan).connect(this.sfx);
    if (echo > 0) {
      const send = ctx.createGain();
      send.gain.value = echo * (0.5 + (1 - p.gain) * 0.8);
      pan.connect(send).connect(this.reverbSend);
    }
    return { input: distance, out, ctx, at: ctx.currentTime };
  }

  private burst(dest: AudioNode, at: number, length: number, type: BiquadFilterType, hz: number, q: number, level: number, attack = 0.001): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz * (0.92 + Math.random() * 0.16);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    src.connect(f).connect(g).connect(dest);
    src.start(at, Math.random() * 1.5);
    src.stop(at + length + 0.05);
  }

  private tone(dest: AudioNode, at: number, type: OscillatorType, from: number, to: number, length: number, level: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + length);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + length + 0.02);
  }

  // ─── Guns ─────────────────────────────────────────────────────────────────────────────────

  /**
   * A gunshot at (x, z). `own` is the hero's gun: louder and drier, right at the ear.
   * @param recording Which recording to use when it differs from the gun (police pistols).
   */
  public gunshot(weapon: WeaponId, x: number, z: number, own: boolean, recording: string = weapon): void {
    const r = GUNS[weapon];
    const v = this.voice(x, z, own ? 0.9 : 0.55, r.echo * 0.6);
    if (!v) return;
    const { input, at } = v;
    if (this.sample(recording, input, at, own ? 1 : 0.85)) return;
    this.burst(input, at, 0.05, 'bandpass', r.crackHz, 0.9, r.crack);
    this.burst(input, at + 0.002, r.bodyTime, 'lowpass', r.bodyHz, 0.7, r.body);
    this.tone(input, at, 'sine', r.thumpHz, 35, r.bodyTime * 1.4, r.thump);
    if (weapon === 'shotgun' || weapon === 'sniper') this.burst(input, at + 0.01, 0.35, 'lowpass', 400, 0.5, 0.4);
  }

  public dryClick(): void {
    const v = this.voice(this.lx, this.lz, 0.5, 0);
    if (!v) return;
    this.burst(v.input, v.at, 0.02, 'highpass', 4000, 1, 0.8);
  }

  /** Magazine out (start) or in and the slide racked (end). The recording covers both. */
  public reload(stage: 'start' | 'end', weapon: WeaponId = 'rifle'): void {
    const v = this.voice(this.lx, this.lz, 0.45, 0.05);
    if (!v) return;
    if (this.samples.has(RELOAD_OF[weapon])) {
      if (stage === 'start') this.sample(RELOAD_OF[weapon], v.input, v.at, 1.4);
      return;
    }
    if (stage === 'start') {
      this.burst(v.input, v.at, 0.04, 'bandpass', 1800, 4, 0.8);
      this.burst(v.input, v.at + 0.08, 0.05, 'bandpass', 900, 3, 0.5);
    } else {
      this.burst(v.input, v.at, 0.03, 'bandpass', 2200, 5, 0.9);
      this.burst(v.input, v.at + 0.16, 0.06, 'bandpass', 3000, 3, 1);
      this.burst(v.input, v.at + 0.2, 0.05, 'bandpass', 1400, 3, 0.7);
    }
  }

  public impact(x: number, z: number, flesh: boolean): void {
    const v = this.voice(x, z, flesh ? 0.35 : 0.3, 0.1);
    if (!v) return;
    if (flesh) this.burst(v.input, v.at, 0.07, 'lowpass', 600, 1, 0.9);
    else {
      this.burst(v.input, v.at, 0.03, 'bandpass', 4500, 2, 0.8);
      this.tone(v.input, v.at, 'triangle', 1800 + Math.random() * 900, 900, 0.12, 0.12);
    }
  }

  public footstep(x: number, z: number, running: boolean): void {
    const v = this.voice(x, z, running ? 0.22 : 0.14, 0.02);
    if (!v) return;
    this.burst(v.input, v.at, 0.05, 'bandpass', 700 + Math.random() * 300, 1.4, 0.9, 0.004);
  }

  // ─── Cars ─────────────────────────────────────────────────────────────────────────────────

  /**
   * The driven car's engine and tyres, per frame. Null when on foot.
   * @param speedT 0 at rest … 1 at top speed.
   */
  public setEngine(car: { speedT: number; throttle: number; slip: number } | null): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (!car) {
      this.engineGain.gain.setTargetAtTime(0, t, 0.2);
      this.squealGain.gain.setTargetAtTime(0, t, 0.1);
      return;
    }
    // Gearbox: pick the gear for the speed; RPM runs from 0.3 to 1 within each gear.
    let gear = GEARS.findIndex((top) => car.speedT <= top);
    if (gear < 0) gear = GEARS.length - 1;
    const low = gear === 0 ? 0 : GEARS[gear - 1];
    const rpm = 0.3 + 0.7 * Math.min(1, (car.speedT - low) / (GEARS[gear] - low));
    const hz = 38 + rpm * 110 + car.throttle * 8;
    for (const o of this.engineOsc) o.frequency.setTargetAtTime(hz, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(400 + rpm * 1600 + car.throttle * 900, t, 0.06);
    this.engineGain.gain.setTargetAtTime(0.1 + car.throttle * 0.1 + rpm * 0.06, t, 0.08);
    const squeal = Math.max(0, Math.min(1, (Math.abs(car.slip) - 3) / 6));
    this.squealGain.gain.setTargetAtTime(squeal * 0.2, t, 0.05);
    this.squealFilter.frequency.setTargetAtTime(2000 + squeal * 1200, t, 0.1);
  }

  public crash(x: number, z: number, impact: number): void {
    const k = Math.min(1, impact / 18);
    const v = this.voice(x, z, 0.5 + k * 0.5, 0.4);
    if (!v) return;
    this.tone(v.input, v.at, 'sine', 90, 30, 0.35, 0.9 * k + 0.2);
    this.burst(v.input, v.at, 0.25 + k * 0.2, 'bandpass', 1200, 0.8, 0.8);
    this.burst(v.input, v.at + 0.03, 0.4, 'highpass', 5000, 0.5, 0.35 * k);
  }

  public explosion(x: number, z: number): void {
    const v = this.voice(x, z, 1, 0.9);
    if (!v) return;
    this.tone(v.input, v.at, 'sine', 70, 22, 0.9, 1);
    this.burst(v.input, v.at, 1.1, 'lowpass', 700, 0.6, 1);
  }

  /** Wind while gliding, 0 (none) to 1 (diving flat out). */
  public setWind(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.windGain || !this.windFilter) return;
    const t = ctx.currentTime;
    this.windGain.gain.setTargetAtTime(level * 0.32, t, 0.25);
    this.windFilter.frequency.setTargetAtTime(350 + level * 1400, t, 0.25);
  }

  /** The glider's canopy catching air (open), or being gathered in (closed). */
  public glider(open: boolean): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const at = ctx.currentTime;
    this.burst(this.sfx, at, open ? 0.45 : 0.25, 'lowpass', open ? 420 : 900, 0.8, open ? 0.7 : 0.3, 0.01);
    if (open) this.burst(this.sfx, at + 0.05, 0.3, 'bandpass', 1400, 1.5, 0.2, 0.02);
  }

  /**
   * Cantor on the radio: a click as the channel opens, a garbled, band-limited voice under the
   * subtitles for as long as the line runs (syllables of filtered noise at speaking pace), hiss,
   * and a click as it closes. No recording of a voice, so this stands in for one.
   */
  public radio(seconds: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const at = ctx.currentTime;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1500;
    band.Q.value = 0.8;
    const out = ctx.createGain();
    out.gain.value = 0.9;
    band.connect(out).connect(this.sfx);
    this.burst(band, at, 0.06, 'highpass', 3000, 0.7, 0.5);
    this.burst(band, at, seconds, 'highpass', 2500, 0.5, 0.05, 0.05);
    let t = at + 0.12;
    const end = at + seconds - 0.3;
    while (t < end) {
      const length = 0.07 + Math.random() * 0.13;
      this.burst(band, t, length, 'bandpass', 500 + Math.random() * 900, 4, 0.18 + Math.random() * 0.12, 0.015);
      // Gaps between words, longer between phrases.
      t += length + (Math.random() < 0.18 ? 0.25 + Math.random() * 0.2 : 0.02 + Math.random() * 0.05);
    }
    this.burst(band, end + 0.25, 0.08, 'highpass', 3000, 0.7, 0.45);
  }

  /** A wolf's howl: a rising, wavering note that falls away. */
  public howl(x: number, z: number): void {
    const v = this.voice(x, z, 0.55, 0.9);
    if (!v) return;
    const ctx = v.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const at = v.at;
    o.frequency.setValueAtTime(330, at);
    o.frequency.linearRampToValueAtTime(620, at + 0.6);
    o.frequency.linearRampToValueAtTime(590, at + 1.6);
    o.frequency.exponentialRampToValueAtTime(380, at + 2.3);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.value = 9;
    wobble.connect(depth).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.22, at + 0.4);
    g.gain.setValueAtTime(0.22, at + 1.5);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 2.4);
    o.connect(g).connect(v.input);
    o.start(at);
    wobble.start(at);
    o.stop(at + 2.5);
    wobble.stop(at + 2.5);
  }

  /** A snarl and a bite. */
  public bite(x: number, z: number): void {
    const v = this.voice(x, z, 0.8, 0.1);
    if (!v) return;
    this.burst(v.input, v.at, 0.35, 'bandpass', 320, 3, 0.6, 0.02);
    this.burst(v.input, v.at + 0.28, 0.08, 'highpass', 1800, 0.8, 0.5);
  }

  /** Gas escaping a holed propane tank, until it goes. */
  public hiss(x: number, z: number, seconds: number): void {
    const v = this.voice(x, z, 0.5, 0.1);
    if (!v) return;
    this.burst(v.input, v.at, seconds, 'highpass', 5200, 0.7, 0.35, 0.05);
  }

  /** An outpost's alarm: a klaxon, rising and falling, a few times over. */
  public alarm(x: number, z: number): void {
    const v = this.voice(x, z, 0.8, 0.5);
    if (!v) return;
    for (let i = 0; i < 4; i++) {
      this.tone(v.input, v.at + i * 0.9, 'sawtooth', 420, 780, 0.45, 0.22);
      this.tone(v.input, v.at + i * 0.9 + 0.45, 'sawtooth', 780, 420, 0.45, 0.22);
    }
  }

  // ─── The city ─────────────────────────────────────────────────────────────────────────────

  /** The siren, from where the nearest police officer is (null: no police). */
  public setSiren(source: { x: number; z: number } | null, dt: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (!source) {
      this.sirenGain.gain.setTargetAtTime(0, t, 0.4);
      return;
    }
    this.sirenPhase += dt * 0.55;
    const wail = 0.5 - 0.5 * Math.cos(this.sirenPhase * Math.PI * 2);
    this.sirenOsc.frequency.setTargetAtTime(620 + wail * 520, t, 0.03);
    const p = this.place(source.x, source.z);
    this.sirenPan.pan.setTargetAtTime(p.pan, t, 0.1);
    this.sirenGain.gain.setTargetAtTime(0.09 * p.gain + 0.01, t, 0.2);
  }

  // ─── Story ────────────────────────────────────────────────────────────────────────────────

  public cue(kind: 'pickup' | 'star' | 'heat' | 'complete' | 'fail' | 'hit' | 'kill' | 'objective'): void {
    const v = this.voice(this.lx, this.lz, 0.35, kind === 'complete' ? 0.3 : 0.08);
    if (!v) return;
    const { input, at } = v;
    const note = (midi: number, when: number, len: number, level: number, type: OscillatorType = 'triangle') => {
      const hz = 440 * Math.pow(2, (midi - 69) / 12);
      this.tone(input, at + when, type, hz, hz * 0.999, len, level);
    };
    switch (kind) {
      case 'pickup':
        note(76, 0, 0.08, 0.5);
        note(83, 0.06, 0.12, 0.5);
        break;
      case 'star':
        [84, 88, 91, 96].forEach((m, i) => note(m, i * 0.06, 0.18, 0.45, 'sine'));
        break;
      case 'heat':
        note(62, 0, 0.14, 0.5, 'square');
        note(58, 0.16, 0.2, 0.5, 'square');
        break;
      case 'complete':
        [60, 64, 67, 72, 76, 79].forEach((m, i) => note(m, i * 0.09, 0.4, 0.4));
        note(84, 0.6, 0.9, 0.45, 'sine');
        break;
      case 'fail':
        [64, 60, 55].forEach((m, i) => note(m, i * 0.18, 0.35, 0.45, 'sawtooth'));
        break;
      case 'hit':
        note(96, 0, 0.04, 0.3, 'square');
        break;
      case 'kill':
        note(91, 0, 0.05, 0.35, 'square');
        note(98, 0.05, 0.1, 0.35, 'square');
        break;
      case 'objective':
        note(72, 0, 0.12, 0.35, 'sine');
        note(79, 0.1, 0.2, 0.35, 'sine');
        break;
    }
  }
}
