import { Brawl, STAGE_ONE, STEP, rankFor, type BrawlEvent, type PlayerInput } from '../brawler/Brawler';
import { BrawlerRenderer } from '../rendering/brawler/BrawlerRenderer';

/**
 * Neon Knuckles (ADR-0015): keyboard, loop, screens and sound around the pure `Brawl` sim.
 *
 *   Player 1: W A S D move · J punch (tap for a combo) · K kick · Space jump · L special
 *   Player 2: arrows move · , punch · . kick · / jump · Right Shift special (joins on punch)
 *   Enter starts and restarts · P or Esc pauses
 */

const KEYS = [
  { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], punch: ['KeyJ'], heavy: ['KeyK'], jump: ['Space'], special: ['KeyL'] },
  {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    punch: ['Comma', 'Numpad1'], heavy: ['Period', 'Numpad2'], jump: ['Slash', 'Numpad0'], special: ['ShiftRight', 'Numpad3']
  }
];

type Screen = 'title' | 'play' | 'paused' | 'over' | 'clear';

/** Short synthesised hits: a punch should be heard as much as seen. */
class Sfx {
  private ctx: AudioContext | null = null;

  public unlock(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    void this.ctx.resume();
  }

  private noise(duration: number, from: number, to: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    const amp = ctx.createGain();
    amp.gain.value = gain;
    src.connect(filter).connect(amp).connect(ctx.destination);
    src.start();
  }

  private tone(freq: number, to: number, duration: number, gain: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  public play(events: readonly BrawlEvent[]): void {
    for (const e of events) {
      if (e.type === 'hit') {
        this.noise(e.heavy ? 0.22 : 0.1, e.heavy ? 2400 : 3200, 200, e.heavy ? 0.9 : 0.6);
        this.tone(e.heavy ? 120 : 170, 50, e.heavy ? 0.2 : 0.1, 0.5);
      } else if (e.type === 'whiff') this.noise(0.08, 6000, 1500, 0.15);
      else if (e.type === 'ko') this.tone(320, 60, 0.4, 0.3, 'sawtooth');
      else if (e.type === 'special') {
        this.noise(0.5, 5000, 100, 0.8);
        this.tone(80, 30, 0.6, 0.6, 'square');
      } else if (e.type === 'heal') this.tone(660, 1320, 0.25, 0.2, 'triangle');
      else if (e.type === 'go') this.tone(880, 880, 0.12, 0.15, 'square');
      else if (e.type === 'clear') [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.25, 0.2, 'square'), i * 120));
    }
  }
}

export class BrawlerGame {
  private readonly renderer: BrawlerRenderer;
  private readonly held = new Set<string>();
  private readonly sfx = new Sfx();
  private brawl = new Brawl(STAGE_ONE, Date.now() % 100000);
  private screen: Screen = 'title';
  private last = 0;
  private acc = 0;
  private hiscore = 0;

  public constructor(canvas: HTMLCanvasElement) {
    this.renderer = new BrawlerRenderer(canvas);
    try {
      this.hiscore = Number(localStorage.getItem('vorixa.brawler.hiscore')) || 0;
    } catch {
      this.hiscore = 0;
    }
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash'].includes(e.code)) e.preventDefault();
      this.sfx.unlock();
      this.held.add(e.code);
      this.command(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => {
      this.held.clear();
      if (this.screen === 'play') this.screen = 'paused';
    });
  }

  private command(code: string): void {
    if (code === 'Enter') {
      if (this.screen === 'title' || this.screen === 'over' || this.screen === 'clear') this.begin();
      else if (this.screen === 'paused') this.screen = 'play';
    } else if (code === 'KeyP' || code === 'Escape') {
      if (this.screen === 'play') this.screen = 'paused';
      else if (this.screen === 'paused') this.screen = 'play';
    }
  }

  private begin(): void {
    this.brawl = new Brawl(STAGE_ONE, Date.now() % 100000);
    this.screen = 'play';
    this.renderer.title('NEON KNUCKLES', STAGE_ONE.name);
  }

  private input(slot: number): PlayerInput {
    const k = KEYS[slot];
    const any = (codes: string[]) => codes.some((c) => this.held.has(c));
    return {
      x: (any(k.right) ? 1 : 0) - (any(k.left) ? 1 : 0),
      // Up the screen is away from the camera: deeper into the street.
      z: (any(k.up) ? 1 : 0) - (any(k.down) ? 1 : 0),
      punch: any(k.punch),
      heavy: any(k.heavy),
      jump: any(k.jump),
      special: any(k.special)
    };
  }

  public resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  public start(): void {
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
      this.last = now;
      this.update(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private update(dt: number): void {
    const b = this.brawl;
    if (this.screen === 'play') {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.acc -= STEP;
        b.step([this.input(0), this.input(1)]);
        if (b.events.length) {
          this.renderer.react(b, b.events);
          this.sfx.play(b.events);
        }
      }
      if (b.outcome !== 'playing') {
        this.screen = b.outcome;
        const total = b.players.reduce((s, p) => s + p.score, 0);
        if (total > this.hiscore) {
          this.hiscore = total;
          try {
            localStorage.setItem('vorixa.brawler.hiscore', String(total));
          } catch {
            // Private windows refuse storage; the high score just is not kept.
          }
        }
      }
    }
    this.renderer.render(b, this.screen === 'play' ? dt : 0);
    const total = b.players.reduce((s, p) => s + p.score, 0);
    const best = Math.max(...b.players.map((p) => p.bestCombo));
    if (this.screen === 'title') {
      this.renderer.panel('NEON KNUCKLES', [
        'The Choir runs the rain. Take the street back, one fist at a time.',
        'P1 — W A S D move · J punch (tap for combos) · K kick · SPACE jump · L special',
        'P2 — ARROWS move · , punch · . kick · / jump · RIGHT SHIFT special · press , to join',
        `HIGH SCORE  ${String(this.hiscore).padStart(7, '0')}`,
        'PRESS ENTER TO FIGHT'
      ]);
    } else if (this.screen === 'paused') {
      this.renderer.panel('PAUSED', ['Press ENTER or P to keep fighting']);
    } else if (this.screen === 'over') {
      this.renderer.panel('GAME OVER', [`Score ${total}   ·   Best combo ${best}`, 'The Choir keeps the street tonight.', 'PRESS ENTER TO TRY AGAIN'], '#ff3d5a');
    } else if (this.screen === 'clear') {
      const rank = rankFor(total, b.time, b.players.reduce((s, p) => s + p.damageTaken, 0));
      this.renderer.panel(`RANK ${rank}`, [
        'STAGE CLEAR — Cantor is down. Second Street is yours.',
        `Score ${total}   ·   Time ${Math.round(b.time)} s   ·   Best combo ${best}`,
        `High score ${this.hiscore}`,
        'PRESS ENTER TO PLAY AGAIN'
      ], '#ffd23d');
    }
  }
}
