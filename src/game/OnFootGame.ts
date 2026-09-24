import { InputEngine } from '../input/InputEngine';
import { InputAction } from '../input/ActionTypes';
import { FaceTracker } from '../input/FaceTracker';
import { HandTracker } from '../input/HandTracker';
import { RushAudio } from '../audio/RushAudio';
import { loadCalibration, normalizeGaze } from '../rush/Calibration';
import type { FxRecord, FxType } from '../rush/RushSim';
import { PlatformSim, MAX_HEARTS, type PlatformFx, type PlatformFxType } from '../platformer/PlatformSim';
import { PlatformControls, type PlatformSources } from '../platformer/PlatformControls';
import { loadLevel } from '../platformer/Levels';
import { PlatformRenderer } from '../rendering/platformer/PlatformRenderer';
import { OnFootHUD, type ChipStatus } from '../ui/OnFootHUD';

/**
 * Runs On Foot (ADR-0012): the driver's side-scrolling adventure. Same shape as `RushGame`:
 * input resolved once per frame, the simulation stepped at a fixed 120 Hz, and effects fanned out
 * to picture, sound and HUD per tick so none are lost when several ticks run in one frame.
 */

const TICK = 1 / 120;
const MAX_FRAME = 0.1;
/** The results card waits for the flag or the fall to play out. */
const RESULT_DELAY = 1.6;
const BEST_KEY = 'vorixa.onfoot.best';

/** On Foot's effects voiced with Rush's synth, so the two modes sound like one game. */
const SOUND_OF: Partial<Record<PlatformFxType, FxType>> = {
  jump: 'jump',
  land: 'land',
  coin: 'coin',
  blockCoin: 'coin',
  starCoin: 'itemGet',
  bump: 'hit',
  heart: 'pickup',
  stomp: 'smash',
  hurt: 'crash',
  pit: 'crash',
  fire: 'fire',
  enemyFire: 'enemyFire',
  enemyKilled: 'explode',
  checkpoint: 'itemGet',
  flag: 'takedown',
  gameOver: 'gameOver'
};

type Screen = 'title' | 'playing' | 'paused' | 'result';

export class OnFootGame {
  private readonly input = new InputEngine();
  private readonly face = new FaceTracker();
  private readonly hand = new HandTracker();
  private readonly audio = new RushAudio();
  private readonly controls = new PlatformControls();
  private readonly hud: OnFootHUD;
  private sim: PlatformSim;

  private screen: Screen = 'title';
  private running = false;
  private lastTime = -1;
  private accumulator = 0;
  private endedFor = 0;
  private gazeEnabled = false;
  private handEnabled = false;
  private readonly calibration = loadCalibration();
  private readonly calibratedGaze = { present: false, gazeX: 0 };
  private best = loadBest();
  private readonly sound: FxRecord = { type: 'coin', x: 0, y: 0, z: 0, amount: 0 };
  private readonly sources: PlatformSources = {
    leftHeld: false,
    rightHeld: false,
    jumpPressed: false,
    jumpHeld: false,
    fireHeld: false,
    gaze: null,
    face: null,
    hand: null
  };

  public constructor(private readonly renderer: PlatformRenderer, container: HTMLElement) {
    this.sim = new PlatformSim(loadLevel(0));
    this.renderer.load(this.sim.level, this.sim);
    this.hud = new OnFootHUD(container);
    this.hud.onStart = () => this.begin();
    this.hud.onResume = () => this.setPaused(false);
    this.hud.onRestart = () => this.restart();
    this.hud.onBackToCar = () => backToCar();
    this.hud.onToggleGaze = () => void this.toggleGaze();
    this.hud.onToggleHand = () => void this.toggleHand();
    this.hud.showTitle(true);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'playing') this.setPaused(true);
    });
    // Escape on the title or the results goes back to the road (P, the other pause key, does not).
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && (this.screen === 'title' || this.screen === 'result')) backToCar();
    });
    const unlock = () => void this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(nowMs: number): void {
    if (!this.running) return;
    const now = nowMs / 1000;
    const dt = this.lastTime < 0 ? 0 : Math.max(0, Math.min(now - this.lastTime, MAX_FRAME));
    this.lastTime = now;

    this.handleMetaKeys();
    const gaze = this.gazeEnabled && this.face.isRunning ? this.face.update() : null;
    const hand = this.handEnabled && this.hand.isRunning ? this.hand.update() : null;

    const src = this.sources;
    src.leftHeld = this.input.isPressed(InputAction.STRAFE_LEFT);
    src.rightHeld = this.input.isPressed(InputAction.STRAFE_RIGHT);
    src.jumpPressed = this.input.isJustPressed(InputAction.JUMP) || this.input.isJustPressed(InputAction.MOVE_FORWARD);
    // A tap shorter than a frame still counts as held for that frame, so a quick click fires.
    src.jumpHeld = src.jumpPressed || this.input.isPressed(InputAction.JUMP) || this.input.isPressed(InputAction.MOVE_FORWARD);
    src.fireHeld = this.input.isJustPressed(InputAction.FIRE) || this.input.isPressed(InputAction.FIRE);
    if (gaze) {
      this.calibratedGaze.present = gaze.present;
      this.calibratedGaze.gazeX = normalizeGaze(gaze.gazeX, this.calibration);
    }
    src.gaze = gaze ? this.calibratedGaze : null;
    src.face = gaze?.present ? this.face.commands : null;
    src.hand = hand;
    const intent = this.controls.resolve(src, dt);

    if (this.screen === 'title') {
      // A jump from any device starts the level, so a hands-free player can begin hands-free.
      if (intent.jumpPressed || this.input.isJustPressed(InputAction.CONFIRM)) this.begin();
    } else if (this.screen === 'result') {
      if (this.input.isJustPressed(InputAction.CONFIRM)) this.restart();
    }

    if (this.screen === 'playing') {
      this.accumulator += dt;
      let first = true;
      while (this.accumulator >= TICK) {
        this.sim.update(intent, TICK);
        this.consumeEffects();
        if (first) {
          // A press belongs to the first tick of the frame; repeating it would buffer a second jump.
          intent.jumpPressed = false;
          first = false;
        }
        this.accumulator -= TICK;
      }
      if (this.sim.phase !== 'playing') {
        this.endedFor += dt;
        if (this.endedFor >= RESULT_DELAY) this.finish();
      }
    }

    this.audio.update(0, 0, false, this.screen === 'playing' ? 'run' : 'title');
    document.body.classList.toggle('playing', this.screen === 'playing');
    this.renderer.render(this.sim, this.screen === 'paused' ? 0 : dt);
    const s = this.sim;
    this.hud.update(s.score, s.coins, s.elapsed, s.starCoins, s.hearts, MAX_HEARTS);
    this.hud.setDevices(
      deviceStatus(this.gazeEnabled, this.face.status, gaze?.present ?? false),
      deviceStatus(this.handEnabled, this.hand.status, hand?.present ?? false)
    );
    this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  private handleMetaKeys(): void {
    const i = this.input;
    if (i.isJustPressed(InputAction.GAZE_TOGGLE)) void this.toggleGaze();
    if (i.isJustPressed(InputAction.GESTURE_TOGGLE)) void this.toggleHand();
    if (i.isJustPressed(InputAction.MUTE_TOGGLE)) this.audio.toggleMute();
    if (i.isJustPressed(InputAction.RESTART) && this.screen !== 'title') this.restart();
    if (i.isJustPressed(InputAction.PAUSE)) {
      if (this.screen === 'playing') this.setPaused(true);
      else if (this.screen === 'paused') this.setPaused(false);
    }
  }

  private consumeEffects(): void {
    const sim = this.sim;
    for (let i = 0; i < sim.fxCount; i++) {
      const fx = sim.fx[i];
      this.renderer.effect(fx);
      this.voice(fx);
      switch (fx.type) {
        case 'hurt':
        case 'pit':
          this.hud.hurt();
          break;
        case 'starCoin':
          this.hud.showBanner(`Star coin ${fx.amount + 1} of 3`);
          break;
        case 'checkpoint':
          this.hud.showBanner('Checkpoint');
          break;
        case 'flag':
          this.hud.showBanner('Level clear!');
          break;
        case 'stomp':
        case 'enemyKilled':
        case 'blockCoin':
          this.popupAt(fx, fx.type === 'blockCoin' ? '+100' : '+200');
          break;
      }
    }
  }

  private voice(fx: PlatformFx): void {
    const type = SOUND_OF[fx.type];
    if (!type) return;
    const s = this.sound;
    s.type = type;
    // Pan from where it happened relative to the hero; Rush pans by x / 7.
    s.x = fx.x - this.sim.x;
    s.y = fx.y;
    s.amount = fx.amount;
    this.audio.play(s);
  }

  private popupAt(fx: PlatformFx, text: string): void {
    const p = this.renderer.toScreen(fx.x, fx.y + 1);
    if (p) this.hud.popup(text, p.x, p.y);
  }

  private begin(): void {
    if (this.screen !== 'title') return;
    this.screen = 'playing';
    this.hud.showTitle(false);
    this.audio.go();
  }

  private restart(): void {
    this.sim = new PlatformSim(loadLevel(0));
    this.renderer.load(this.sim.level, this.sim);
    this.controls.reset();
    this.accumulator = 0;
    this.endedFor = 0;
    this.hud.showResult(null);
    this.hud.showPause(false);
    this.hud.showTitle(false);
    this.audio.setPaused(false);
    this.screen = 'playing';
    this.audio.go();
  }

  private finish(): void {
    const s = this.sim;
    const cleared = s.phase === 'clear';
    if (cleared && s.score > this.best) {
      this.best = s.score;
      saveBest(this.best);
    }
    this.screen = 'result';
    this.hud.showResult({ cleared, score: s.score, coins: s.coins, starCoins: s.starCoins, time: s.elapsed, best: this.best });
  }

  private setPaused(paused: boolean): void {
    if (paused && this.screen !== 'playing') return;
    if (!paused && this.screen !== 'paused') return;
    this.screen = paused ? 'paused' : 'playing';
    this.hud.showPause(paused);
    this.audio.setPaused(paused);
    // Do not replay the paused time as a burst of ticks.
    this.accumulator = 0;
  }

  private async toggleGaze(): Promise<void> {
    if (this.gazeEnabled) {
      this.gazeEnabled = false;
      this.face.stop();
      return;
    }
    this.gazeEnabled = true;
    const ok = await this.face.start();
    if (!ok) this.gazeEnabled = this.face.status === 'loading';
  }

  private async toggleHand(): Promise<void> {
    if (this.handEnabled) {
      this.handEnabled = false;
      this.hand.stop();
      return;
    }
    this.handEnabled = true;
    const ok = await this.hand.start();
    if (!ok) this.handEnabled = this.hand.status === 'loading';
  }
}

function deviceStatus(enabled: boolean, status: string, present: boolean): ChipStatus {
  if (!enabled) return status === 'error' ? 'error' : 'off';
  if (status === 'loading' || status === 'requesting-camera') return 'loading';
  if (status === 'error' || status === 'denied') return 'error';
  return present ? 'on' : 'lost';
}

function backToCar(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  window.location.href = url.toString();
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Private mode or storage full: the best score just is not remembered.
  }
}
