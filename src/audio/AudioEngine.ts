/** Where the mute preference lives. A setting that forgets itself is not a setting. */
const MUTE_KEY = 'vorixa.audio.muted';
/** Master level when audible. */
const MASTER_LEVEL = 0.65;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private isUnlocked: boolean = false;

  private muted = false;
  /** True while the tab is hidden. Separate from `muted` so the two cannot clobber each other. */
  private ducked = false;
  private visibilityHandler: (() => void) | null = null;

  /**
   * Time-dilation filter.
   *
   * Slow motion without audio treatment reads as a bug: the world crawls while the soundtrack
   * carries on at full pace, and the brain trusts its ears. Rolling the whole bus off at the top
   * end is what makes dilation feel like an effect rather than a frame-rate problem.
   */
  private dilationFilter: BiquadFilterNode | null = null;

  // Speed wind procedural synth
  private windNoiseSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  public initialize(): void {
    if (typeof window === 'undefined') return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      this.ctx = new AudioContextClass();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-24, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();

      // Everything runs through the dilation filter before the master, so a single node treats
      // the whole mix rather than each voice having to know about slow motion.
      this.dilationFilter = this.ctx.createBiquadFilter();
      this.dilationFilter.type = 'lowpass';
      this.dilationFilter.frequency.setValueAtTime(20000, this.ctx.currentTime);
      this.dilationFilter.Q.setValueAtTime(0.7, this.ctx.currentTime);

      this.compressor.connect(this.dilationFilter);
      this.dilationFilter.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.muted = this.loadMutePreference();
      this.applyMasterLevel(0);
      this.watchVisibility();
    } catch {
      this.ctx = null;
    }
  }

  private loadMutePreference(): boolean {
    try {
      return window.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // Private browsing and blocked storage both throw here. A missing preference is not worth
      // failing audio over.
      return false;
    }
  }

  /**
   * Suspends audio while the tab is hidden.
   *
   * A game left in a background tab otherwise keeps its wind loop running indefinitely, which is
   * both rude and a steady drain. Suspending the context stops the audio thread outright rather
   * than merely turning the volume down.
   */
  private watchVisibility(): void {
    if (typeof document === 'undefined' || this.visibilityHandler) return;
    this.visibilityHandler = () => {
      this.ducked = document.hidden;
      if (!this.ctx) return;
      if (document.hidden) {
        void this.ctx.suspend();
      } else if (this.isUnlocked) {
        void this.ctx.resume();
      }
      this.applyMasterLevel(0.05);
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /** Ramps rather than steps: an instant gain change on a running signal is an audible click. */
  private applyMasterLevel(rampSeconds: number): void {
    if (!this.ctx || !this.masterGain) return;
    const target = this.muted || this.ducked ? 0 : MASTER_LEVEL;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(target, now + Math.max(rampSeconds, 0.001));
  }

  public get isMuted(): boolean {
    return this.muted;
  }

  /** @returns the new muted state, so callers can update a label without re-reading. */
  public toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyMasterLevel(0.08);
    try {
      window.localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Preference simply will not persist. Not worth surfacing to the player mid-run.
    }
    return this.muted;
  }

  /**
   * Rolls the mix off during time dilation.
   *
   * @param amount 0 for normal, 1 for fully dilated.
   */
  public setDilation(amount: number): void {
    if (!this.ctx || !this.dilationFilter) return;
    const clamped = amount < 0 ? 0 : amount > 1 ? 1 : amount;
    // Exponential in frequency, because pitch perception is logarithmic — a linear sweep spends
    // most of its travel in a range the ear barely registers.
    const cutoff = 20000 * Math.pow(420 / 20000, clamped);
    const now = this.ctx.currentTime;
    this.dilationFilter.frequency.cancelScheduledValues(now);
    this.dilationFilter.frequency.setTargetAtTime(cutoff, now, 0.08);
  }

  /** Releases the visibility listener. */
  public dispose(): void {
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  public async unlock(): Promise<boolean> {
    if (!this.ctx) this.initialize();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
        this.isUnlocked = true;
        this.setupSpeedWind();
        this.playAmbientDrone();
        return true;
      } catch {
        return false;
      }
    }
    if (this.ctx) {
      this.isUnlocked = true;
      this.setupSpeedWind();
      this.playAmbientDrone();
    }
    return true;
  }

  private setupSpeedWind(): void {
    if (!this.ctx || !this.compressor || this.windNoiseSource) return;

    try {
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      this.windNoiseSource = this.ctx.createBufferSource();
      this.windNoiseSource.buffer = noiseBuffer;
      this.windNoiseSource.loop = true;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.setValueAtTime(400, this.ctx.currentTime);
      this.windFilter.Q.setValueAtTime(1.4, this.ctx.currentTime);

      this.windGain = this.ctx.createGain();
      this.windGain.gain.setValueAtTime(0, this.ctx.currentTime);

      this.windNoiseSource.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.compressor);

      this.windNoiseSource.start();
    } catch {
      // Non-blocking fallback
    }
  }

  /**
   * Modulates continuous wind noise based on velocity.
   * Zero-allocation in tick/render loops.
   */
  public setSpeedWind(normalizedSpeed: number): void {
    if (!this.ctx || !this.windFilter || !this.windGain || this.ctx.state !== 'running') return;

    const t = this.ctx.currentTime;
    const clamped = Math.max(0, Math.min(normalizedSpeed, 2.0));
    const targetFreq = 380 + clamped * 1650;
    const targetGain = Math.max(0, (clamped - 0.2) * 0.18);

    this.windFilter.frequency.setValueAtTime(targetFreq, t);
    this.windGain.gain.setValueAtTime(targetGain, t);
  }

  public playBoost(): void {
    if (!this.ctx || !this.compressor || this.ctx.state !== 'running') return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const oscSub = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(920, t + 0.28);

      oscSub.type = 'sine';
      oscSub.frequency.setValueAtTime(130, t);
      oscSub.frequency.exponentialRampToValueAtTime(460, t + 0.28);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, t);
      filter.frequency.exponentialRampToValueAtTime(3200, t + 0.22);
      filter.Q.setValueAtTime(4, t);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

      osc.connect(filter);
      oscSub.connect(filter);
      filter.connect(gain);
      gain.connect(this.compressor);

      osc.start(t);
      oscSub.start(t);
      osc.stop(t + 0.32);
      oscSub.stop(t + 0.32);
    } catch {
      // Audio fallback
    }
  }

  public playJumpPad(): void {
    if (!this.ctx || !this.compressor || this.ctx.state !== 'running') return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const oscHarmonic = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(1320, t + 0.24);

      oscHarmonic.type = 'sine';
      oscHarmonic.frequency.setValueAtTime(880, t);
      oscHarmonic.frequency.exponentialRampToValueAtTime(1760, t + 0.2);

      gain.gain.setValueAtTime(0.32, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);

      osc.connect(gain);
      oscHarmonic.connect(gain);
      gain.connect(this.compressor);

      osc.start(t);
      oscHarmonic.start(t);
      osc.stop(t + 0.26);
      oscHarmonic.stop(t + 0.26);
    } catch {
      // Audio fallback
    }
  }

  public playHazard(): void {
    if (!this.ctx || !this.compressor || this.ctx.state !== 'running') return;

    try {
      const t = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(110, t);
      osc1.frequency.linearRampToValueAtTime(75, t + 0.18);

      osc2.type = 'square';
      osc2.frequency.setValueAtTime(82.4, t);
      osc2.frequency.linearRampToValueAtTime(60, t + 0.18);

      gain.gain.setValueAtTime(0.38, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.compressor);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 0.2);
      osc2.stop(t + 0.2);
    } catch {
      // Audio fallback
    }
  }

  public playCheckpointChime(): void {
    if (!this.ctx || !this.compressor || this.ctx.state !== 'running') return;

    try {
      const notes = [659.25, 830.61, 987.77, 1318.51]; // E5, G#5, B5, E6
      const t0 = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        if (!this.ctx || !this.compressor) return;
        const t = t0 + idx * 0.045;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

        osc.connect(gain);
        gain.connect(this.compressor);

        osc.start(t);
        osc.stop(t + 0.25);
      });
    } catch {
      // Audio fallback
    }
  }

  public playSoundEffect(freq: number = 440, duration: number = 0.15, type: OscillatorType = 'sine'): void {
    if (!this.ctx || !this.compressor || this.ctx.state !== 'running') return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, this.ctx.currentTime + duration);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.compressor);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {
      // Audio fallback
    }
  }

  private playAmbientDrone(): void {
    if (!this.ctx || !this.compressor) return;

    try {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(55, this.ctx.currentTime); // A1 note

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(110, this.ctx.currentTime); // A2 note

      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.compressor);

      osc1.start();
      osc2.start();
    } catch {
      // Audio fallback
    }
  }

  public getUnlocked(): boolean {
    return this.isUnlocked;
  }
}
