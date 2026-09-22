export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private isUnlocked: boolean = false;

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
      this.masterGain.gain.setValueAtTime(0.65, this.ctx.currentTime);

      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
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
