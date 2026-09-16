export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private isUnlocked: boolean = false;

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
      this.masterGain.gain.setValueAtTime(0.6, this.ctx.currentTime);

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
        this.playAmbientDrone();
        return true;
      } catch {
        return false;
      }
    }
    this.isUnlocked = true;
    return true;
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

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);

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
