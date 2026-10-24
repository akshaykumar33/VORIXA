import { AkhadaAudio } from '../audio/AkhadaAudio';
import { Cpu, DIFFICULTY } from '../fighter/Cpu';
import { Fight, MAX_HP, STEP, blank, type FightEvent, type FightInput } from '../fighter/Fight';
import { ROSTER, type Contender } from '../fighter/Roster';
import { FightRenderer } from '../rendering/fighter/FightRenderer';
import { AkhadaHud } from '../ui/AkhadaHud';

/**
 * Akhada (ADR-0016): fighter select, the fight loop, input from keyboards and gamepads, the
 * announcer, and the results screen, around the pure `Fight` and `Cpu`.
 */

type Screen = 'loading' | 'select' | 'fight' | 'paused' | 'results';
type Mode = 'easy' | 'normal' | 'hard' | 'versus';
const MODES: Mode[] = ['easy', 'normal', 'hard', 'versus'];
const MODE_LABEL: Record<Mode, string> = { easy: 'VS CPU · EASY', normal: 'VS CPU · NORMAL', hard: 'VS CPU · HARD', versus: '2 PLAYERS' };

const KEYS = [
  { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], lp: ['KeyU'], hp: ['KeyI'], lk: ['KeyJ'], hk: ['KeyK'], blast: ['KeyO'], dash: ['KeyL'], super: ['Semicolon'] },
  {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    lp: ['Numpad4'], hp: ['Numpad5'], lk: ['Numpad1'], hk: ['Numpad2'], blast: ['Numpad6'], dash: ['Numpad3'], super: ['Numpad0']
  }
];

/** The announcer's calls, with the Hindi under them. */
const CALLS = {
  fight: ['FIGHT!', 'लड़ो!'],
  ko: ['K.O.', 'चित!'],
  time: ['TIME', 'समय समाप्त'],
  perfect: ['PERFECT', 'बेदाग़']
};

export class AkhadaGame {
  private readonly renderer = new FightRenderer();
  private readonly hud: AkhadaHud;
  private readonly audio = new AkhadaAudio();
  private readonly held = new Set<string>();
  private screen: Screen = 'loading';
  private pick = 0;
  private mode = 1;
  private fight: Fight | null = null;
  private cpu: Cpu | null = null;
  private fighters: [Contender, Contender] = [ROSTER[0], ROSTER[1]];
  private last = 0;
  private acc = 0;
  private resultsIn = 0;

  public constructor(canvas: HTMLCanvasElement, container: HTMLElement) {
    this.renderer.initialize(canvas);
    this.hud = new AkhadaHud(container);
    window.addEventListener('keydown', (e) => {
      if (/^(Arrow|Space|Numpad|Semicolon)/.test(e.code)) e.preventDefault();
      this.audio.unlock();
      if (!e.repeat) this.command(e.code);
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => {
      this.held.clear();
      if (this.screen === 'fight') this.pause();
    });
    this.renderer.arena.onLightning = (loud) => this.audio.thunder(loud);
  }

  public resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  public async start(): Promise<void> {
    this.hud.loading(0);
    await this.renderer.load((s) => this.hud.loading(s * 0.8));
    await this.renderer.cast(this.fighters[0], this.fighters[1]);
    this.fight = new Fight(this.fighters[0], this.fighters[1]);
    this.showSelect();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
      this.last = now;
      this.update(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // ─── Screens ────────────────────────────────────────────────────────────────────────────────

  private showSelect(): void {
    this.screen = 'select';
    this.hud.select(ROSTER, this.pick, MODES.map((m) => MODE_LABEL[m]), this.mode);
  }

  private command(code: string): void {
    if (this.screen === 'select') {
      if (code === 'KeyA' || code === 'ArrowLeft') this.pick = (this.pick + ROSTER.length - 1) % ROSTER.length;
      else if (code === 'KeyD' || code === 'ArrowRight') this.pick = (this.pick + 1) % ROSTER.length;
      else if (code === 'KeyW' || code === 'ArrowUp') this.mode = (this.mode + MODES.length - 1) % MODES.length;
      else if (code === 'KeyS' || code === 'ArrowDown') this.mode = (this.mode + 1) % MODES.length;
      else if (code === 'Enter' || code === 'Space') return void this.begin();
      this.hud.select(ROSTER, this.pick, MODES.map((m) => MODE_LABEL[m]), this.mode);
    } else if (this.screen === 'fight') {
      if (code === 'Escape') this.pause();
      if (code === 'KeyM') this.audio.toggleMute();
    } else if (this.screen === 'paused') {
      if (code === 'Escape' || code === 'Enter') {
        this.screen = 'fight';
        this.hud.hideScreen();
      } else if (code === 'Backspace') this.showSelect();
    } else if (this.screen === 'results' && this.resultsIn <= 0) {
      if (code === 'Enter') void this.begin();
      else if (code === 'Backspace' || code === 'Escape') this.showSelect();
    }
  }

  private pause(): void {
    this.screen = 'paused';
    this.hud.paused();
  }

  private async begin(): Promise<void> {
    const mine = ROSTER[this.pick];
    // The CPU, or player two, takes someone else at random.
    const others = ROSTER.filter((r) => r.id !== mine.id);
    const theirs = others[Math.floor(Math.random() * others.length)];
    this.fighters = [mine, theirs];
    this.hud.loading(0.9);
    await this.renderer.cast(mine, theirs);
    this.fight = new Fight(mine, theirs);
    const mode = MODES[this.mode];
    this.cpu = mode === 'versus' ? null : new Cpu(1, DIFFICULTY[mode], Date.now() % 100000);
    this.hud.setFighters(mine, theirs);
    this.hud.hideScreen();
    this.screen = 'fight';
    this.held.clear();
    this.acc = 0;
  }

  // ─── Input ──────────────────────────────────────────────────────────────────────────────────

  private input(slot: 0 | 1): FightInput {
    const k = KEYS[slot];
    const any = (codes: string[]) => codes.some((c) => this.held.has(c));
    const i: FightInput = {
      x: (any(k.right) ? 1 : 0) - (any(k.left) ? 1 : 0),
      y: (any(k.up) ? 1 : 0) - (any(k.down) ? 1 : 0),
      lp: any(k.lp), hp: any(k.hp), lk: any(k.lk), hk: any(k.hk),
      blast: any(k.blast), dash: any(k.dash), super: any(k.super)
    };
    // A gamepad per player: X/Y punch, A/B kick, RB blast, LB dash, RT super; stick or d-pad.
    const pad = navigator.getGamepads?.()[slot];
    if (pad) {
      const b = (n: number) => !!pad.buttons[n]?.pressed;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      i.x = i.x || (b(15) || ax > 0.5 ? 1 : b(14) || ax < -0.5 ? -1 : 0);
      i.y = i.y || (b(12) || ay < -0.5 ? 1 : b(13) || ay > 0.5 ? -1 : 0);
      i.lp ||= b(2);
      i.hp ||= b(3);
      i.lk ||= b(0);
      i.hk ||= b(1);
      i.blast ||= b(5);
      i.dash ||= b(4);
      i.super ||= b(7);
    }
    return i;
  }

  // ─── The loop ───────────────────────────────────────────────────────────────────────────────

  private update(dt: number): void {
    const fight = this.fight;
    if (!fight) return;
    let inputs: FightInput[] = [blank(), blank()];
    if (this.screen === 'fight') {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.acc -= STEP;
        inputs = [this.input(0), this.cpu ? this.cpu.think(fight, STEP) : this.input(1)];
        fight.step(inputs);
        if (fight.events.length) this.react(fight, fight.events);
      }
      if (fight.phase === 'over' && this.screen === 'fight') {
        this.resultsIn -= dt;
        if (this.resultsIn <= -2.4) this.showResults(fight);
      }
    }
    const fighting = this.screen === 'fight' || this.screen === 'paused';
    const [a, b] = fight.fighters;
    this.audio.update(this.screen === 'fight' && fight.phase === 'fight', 1 - Math.min(a.hp, b.hp) / MAX_HP);
    this.renderer.render(fight, this.screen === 'paused' ? 0 : dt, [inputs[0].x, inputs[1].x]);
    if (fighting) this.hud.update(fight, dt);
  }

  private react(fight: Fight, events: readonly FightEvent[]): void {
    this.renderer.react(fight, events);
    this.audio.play(events);
    for (const e of events) {
      if (e.type === 'round') {
        this.hud.call(`ROUND ${e.round}`, `राउंड ${e.round}`, 1.6);
        this.say(`Round ${e.round}`);
        this.audio.setRain(e.round === 2);
      } else if (e.type === 'fight') {
        this.hud.call(CALLS.fight[0], CALLS.fight[1], 0.9);
        this.say('Fight!');
      } else if (e.type === 'ko') {
        const winner = fight.fighters[1 - e.slot];
        const perfect = winner.hp === MAX_HP;
        this.hud.call(perfect ? CALLS.perfect[0] : CALLS.ko[0], perfect ? CALLS.perfect[1] : CALLS.ko[1], 2.4);
        this.say(perfect ? 'Perfect!' : 'K. O.');
      } else if (e.type === 'timeup') {
        this.hud.call(CALLS.time[0], CALLS.time[1], 2.4);
        this.say('Time!');
      } else if (e.type === 'match') {
        this.resultsIn = 0;
        const w = this.fighters[e.winner];
        this.say(`${w.name} wins!`);
      }
    }
  }

  private showResults(fight: Fight): void {
    this.screen = 'results';
    const w = fight.winner ?? 0;
    this.hud.results(this.fighters[w], this.fighters[1 - w].name);
    this.audio.setRain(false);
  }

  /** The announcer's voice, in an Indian English voice where the browser has one. */
  private say(text: string): void {
    const speech = window.speechSynthesis;
    if (!speech || this.audio.muted) return;
    const u = new SpeechSynthesisUtterance(text);
    const voice = speech.getVoices().find((v) => v.lang === 'en-IN') ?? speech.getVoices().find((v) => v.lang.startsWith('en'));
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.pitch = 0.7;
    u.volume = 0.9;
    speech.cancel();
    speech.speak(u);
  }
}
