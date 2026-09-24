import type { WeaponId } from '../city/Weapons';

/**
 * The sound of VORIXA City (ADR-0014), synthesised with Web Audio: no recordings to license, and
 * every sound varies a little each time it plays, which recordings do not.
 *
 * - **Gunshots** are layered like real ones: a supersonic *crack* (a bandpassed noise burst), the
 *   *body* of the report (lowpassed noise), a *thump* (a falling sine), and the street's *echo*
 *   (a convolution reverb built from decaying noise with early reflections off the buildings).
 *   Each gun has its own recipe; distant shots lose their top end and arrive quieter.
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

  /** A gunshot at (x, z). `own` is the hero's gun: louder and drier, right at the ear. */
  public gunshot(weapon: WeaponId, x: number, z: number, own: boolean): void {
    const r = GUNS[weapon];
    const v = this.voice(x, z, own ? 0.9 : 0.55, r.echo);
    if (!v) return;
    const { input, at } = v;
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

  /** Magazine out (start) or in and the slide racked (end). */
  public reload(stage: 'start' | 'end'): void {
    const v = this.voice(this.lx, this.lz, 0.45, 0.05);
    if (!v) return;
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
