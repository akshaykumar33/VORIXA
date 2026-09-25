---
name: sound-designer
description: Web Audio API sound synthesis, spatial audio landscapes, interactive UI micro-sounds, audio-reactive canvas visuals, and polite audio architecture.
---

# Sound Designer Skill

Use this skill when implementing audio systems, UI sound effects, generative soundscapes, spatial 3D audio, and audio-reactive visuals for interactive web applications.

---

## 1. Architectural Philosophy: The Polite Audio System

Sound elevates an interface from flat pixels to a tactile physical device. However, intrusive audio ruins user trust. Always follow the **Polite Audio Rules**:
1. **Single User Gesture Unlock**: Never ask for two separate clicks to play audio. Unlock on the first meaningful interaction (e.g. click to start, pointer lock, or start scroll).
2. **Background Tab Ducking**: Immediately suspend or mute audio when the browser tab loses visibility.
3. **Persistent Mute Control**: Always provide a prominent, accessible mute toggle that persists across reloads via `localStorage`.
4. **Zero-Asset Synthesis**: Prioritize procedural Web Audio oscillators and filters over multi-megabyte MP3/WAV files for instant load times and tiny bundle footprints.

---

## 2. Core Web Audio Master Bus Architecture

```typescript
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private isMuted: boolean = false;

  public initialize(): void {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    
    // Master Compressor prevents clipping and smooths loudness
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-24, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.6, this.ctx.currentTime);

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Mute when user switches tabs
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.ctx?.suspend();
      else if (!this.isMuted) this.ctx?.resume();
    });
  }

  public async unlock(): Promise<boolean> {
    if (!this.ctx) this.initialize();
    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }
    return this.ctx?.state === 'running';
  }
}
```

---

## 3. Procedural UI Micro-Sound Recipes

### A. Subtle Magnetic Hover Click (Wood/Plastic feel)
A very short (30ms) decaying sine wave giving physical feedback to interactive elements:
```typescript
export function playHoverClick(ctx: AudioContext, destination: AudioNode): void {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, t);
  osc.frequency.exponentialRampToValueAtTime(350, t + 0.035);

  gain.gain.setValueAtTime(0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

  osc.connect(gain);
  gain.connect(destination);

  osc.start(t);
  osc.stop(t + 0.04);
}
```

### B. Action Confirmation Chime (Harmonic Tri-Tone)
An elegant, shimmering completion arpeggio:
```typescript
export function playChime(ctx: AudioContext, destination: AudioNode, frequencies = [523.25, 659.25, 783.99]): void {
  const t0 = ctx.currentTime;
  frequencies.forEach((freq, index) => {
    const t = t0 + index * 0.04;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(t);
    osc.stop(t + 0.36);
  });
}
```

---

## 4. Audio-Reactive Visual Hookup

Connect an `AnalyserNode` to extract real-time frequency bins and drive shader uniforms or canvas scales:

```typescript
export function createAudioAnalyser(ctx: AudioContext, source: AudioNode): { analyser: AnalyserNode; getAverageFrequency: () => number } {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  return {
    analyser,
    getAverageFrequency: () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      return sum / dataArray.length; // Normalized 0-255
    }
  };
}
```
In your render loop, pass `getAverageFrequency() / 255` into shader uniform `uAudioPulse` to make visuals pulsate to the beat!
