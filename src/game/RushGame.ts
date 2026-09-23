import { InputEngine } from '../input/InputEngine';
import { InputAction } from '../input/ActionTypes';
import { RushAudio } from '../audio/RushAudio';
import { FaceTracker } from '../input/FaceTracker';
import { HandTracker } from '../input/HandTracker';
import { RushSim, MAX_HEARTS, MAX_SPEED, START_SPEED, type RushPhase, type FxRecord } from '../rush/RushSim';
import { RushControls, type ControlSources } from '../rush/RushControls';
import { RushRenderer } from '../rendering/rush/RushRenderer';
import { RushHUD, type DeviceStatus } from '../ui/RushHUD';

/**
 * Runs Rush: input in, simulation stepped, effects fanned out to picture, sound and HUD.
 *
 * The simulation steps at a fixed 120 Hz like the parkour game, for the same reason: identical
 * behaviour at 60 Hz and 144 Hz, and effects that are raised per tick are read per tick so none
 * are lost when several ticks run in one frame.
 */

const TICK = 1 / 120;
const MAX_FRAME = 0.1;

/** Freeze frames on big impacts. Short enough to feel like weight, not like a stall. */
const HIT_STOP_CRASH = 0.09;
const HIT_STOP_KILL = 0.045;

/** A deliberate hard blink buys a moment of slow motion. */
const SLOWMO_SCALE = 0.4;
const SLOWMO_DURATION = 2.2;

/** Once over, input is ignored briefly so a held fire button does not skip the results. */
const RESTART_GRACE = 0.9;

/** The mouse stops owning the crosshair after this long without moving. */
const MOUSE_AIM_TIMEOUT = 4;

const BEST_KEY = 'vorixa.rush.best';

export class RushGame {
  private readonly input = new InputEngine();
  private readonly audio = new RushAudio();
  private readonly face = new FaceTracker();
  private readonly hand = new HandTracker();
  private readonly sim: RushSim;
  private readonly controls = new RushControls();
  private readonly hud: RushHUD;

  private gazeEnabled = false;
  private handEnabled = false;
  private running = false;
  /** Previous frame's rAF timestamp in seconds; negative until the first frame arrives. */
  private lastTime = -1;
  private accumulator = 0;
  private hitStop = 0;
  private slowmo = 0;
  private timeScale = 1;
  private overFor = 0;
  private best = 0;

  private mouseAimX = 0;
  private mouseMovedAt = -Infinity;
  private clock = 0;
  private readonly crosshair = { x: 0, y: 0 };
  private readonly sources: ControlSources = {
    leftPressed: false,
    rightPressed: false,
    jumpPressed: false,
    fireHeld: false,
    nitroHeld: false,
    mouseAimX: null,
    gaze: null,
    hand: null
  };
  private wasNitro = false;
  private lastPhase: RushPhase = 'ready';
  private lastLane = 0;

  public constructor(
    private readonly renderer: RushRenderer,
    container: HTMLElement,
    seed: number,
    /** True when the player asked for a specific road; restarts then replay it. */
    private readonly fixedSeed = false
  ) {
    this.sim = new RushSim(seed);
    this.hud = new RushHUD(container);
    this.hud.onToggleGaze = () => void this.toggleGaze();
    this.hud.onToggleHand = () => void this.toggleHand();
    this.best = loadBest();

    window.addEventListener('pointermove', (e) => {
      const width = window.innerWidth || 1;
      // Slightly more than the screen width maps to the full aim range, so the edges are reachable
      // without the cursor leaving the window.
      this.mouseAimX = Math.max(-1, Math.min(1, ((e.clientX / width) * 2 - 1) * 1.15));
      this.mouseMovedAt = this.clock;
    });
    // Any press is also the gesture browsers require before audio may play.
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
    // rAF timestamps are the frame's start time and can lag performance.now(), so the clock is
    // seeded from the first frame itself — mixing the two clocks produced a negative first delta
    // that froze the simulation for seconds. Clamped at zero for the same reason.
    const frameDelta = this.lastTime < 0 ? 0 : Math.max(0, Math.min(now - this.lastTime, MAX_FRAME));
    this.lastTime = now;
    this.clock += frameDelta;

    this.handleMetaKeys();
    const gaze = this.gazeEnabled && this.face.isRunning ? this.face.update() : null;
    const hand = this.handEnabled && this.hand.isRunning ? this.hand.update() : null;
    if (gaze?.dilationStarted && this.slowmo <= 0) {
      this.slowmo = SLOWMO_DURATION;
      this.audio.slowmoStart();
    }

    const src = this.sources;
    src.leftPressed = this.input.isJustPressed(InputAction.STRAFE_LEFT);
    src.rightPressed = this.input.isJustPressed(InputAction.STRAFE_RIGHT);
    src.jumpPressed =
      this.input.isJustPressed(InputAction.JUMP) || this.input.isJustPressed(InputAction.MOVE_FORWARD);
    src.fireHeld = this.input.isPressed(InputAction.FIRE);
    src.nitroHeld = this.input.isPressed(InputAction.DASH);
    src.mouseAimX = this.clock - this.mouseMovedAt < MOUSE_AIM_TIMEOUT ? this.mouseAimX : null;
    src.gaze = gaze;
    src.hand = hand;
    const intent = this.controls.resolve(src);

    if (this.sim.phase === 'over') {
      this.overFor += frameDelta;
      const wantsRestart =
        this.input.isJustPressed(InputAction.RESTART) ||
        (this.overFor > RESTART_GRACE && (intent.jump || this.input.isJustPressed(InputAction.FIRE)));
      if (wantsRestart) this.restart();
    } else if (this.input.isJustPressed(InputAction.RESTART) && this.sim.phase === 'running') {
      this.restart();
    }

    // Slow motion eases in and out rather than switching, which reads as a hitch.
    this.slowmo = Math.max(0, this.slowmo - frameDelta);
    const targetScale = this.slowmo > 0 ? SLOWMO_SCALE : 1;
    this.timeScale += (targetScale - this.timeScale) * (1 - Math.exp(-8 * frameDelta));
    this.audio.setSlowmo((1 - this.timeScale) / (1 - SLOWMO_SCALE));

    if (this.hitStop > 0) {
      this.hitStop -= frameDelta;
    } else {
      this.accumulator += frameDelta * this.timeScale;
      let first = true;
      while (this.accumulator >= TICK) {
        this.sim.update(intent, TICK);
        this.consumeEffects();
        if (first) {
          // Edges belong to the first tick of the frame; repeating them would jump twice.
          intent.jump = false;
          first = false;
        }
        this.accumulator -= TICK;
        if (this.hitStop > 0) {
          this.accumulator = 0;
          break;
        }
      }
    }

    this.updateAudio();

    this.renderer.render(this.sim, intent.aimX, frameDelta);
    this.updateHud(intent.aimX, gaze?.present ? gaze.gazeX : hand?.present ? hand.steerX : null);
    this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  private handleMetaKeys(): void {
    if (this.input.isJustPressed(InputAction.GAZE_TOGGLE)) void this.toggleGaze();
    if (this.input.isJustPressed(InputAction.GESTURE_TOGGLE)) void this.toggleHand();
    if (this.input.isJustPressed(InputAction.MUTE_TOGGLE)) this.hud.setMuted(this.audio.toggleMute());
  }

  private consumeEffects(): void {
    const sim = this.sim;
    for (let i = 0; i < sim.fxCount; i++) {
      const fx = sim.fx[i];
      this.renderer.effect(fx, sim.z);
      this.audio.play(fx);
      this.popupFor(fx);
      if (fx.type === 'crash') {
        this.hitStop = Math.max(this.hitStop, HIT_STOP_CRASH);
        this.hud.flashCrash();
      } else if (fx.type === 'explode') {
        this.hitStop = Math.max(this.hitStop, HIT_STOP_KILL);
      } else if (fx.type === 'gameOver') {
        this.overFor = 0;
        if (sim.score > this.best) saveBest(sim.score);
      }
    }
  }

  /** Engine, music level and the one-shot cues that follow state changes rather than effects. */
  private updateAudio(): void {
    const sim = this.sim;
    if (sim.nitroActive && !this.wasNitro) this.audio.nitro();
    this.wasNitro = sim.nitroActive;
    if (sim.phase === 'running' && this.lastPhase === 'ready') this.audio.go();
    this.lastPhase = sim.phase;
    if (sim.lane !== this.lastLane) this.audio.swerve(Math.sign(sim.lane - this.lastLane));
    this.lastLane = sim.lane;

    const speedT = (sim.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
    const level = sim.phase === 'over' ? null : sim.phase === 'ready' ? 'title' : sim.nitroActive ? 'nitro' : 'run';
    this.audio.update(sim.speed, speedT, sim.nitroActive, level);
  }

  /** Points float up from where they were earned, so the reward sits on the thing that paid it. */
  private popupFor(fx: FxRecord): void {
    if (fx.type !== 'explode' && fx.type !== 'smash' && fx.type !== 'pickup') return;
    const at = this.renderer.projectPoint(fx.x, fx.y + 1.5, fx.z - this.sim.z, this.crosshair);
    if (!at) return;
    if (fx.type === 'pickup') {
      this.hud.popup(fx.amount === 1 ? '+1 HEART' : 'NITRO!', this.crosshair.x, this.crosshair.y, fx.amount === 1 ? '#ff4a6a' : '#3fa7ff');
    } else if (fx.amount > 0) {
      this.hud.popup(`+${fx.amount}`, this.crosshair.x, this.crosshair.y, fx.type === 'explode' ? '#ffd23f' : '#fff7e0');
    }
  }

  private updateHud(aimX: number, pointer: number | null): void {
    const sim = this.sim;
    this.hud.update({
      phase: sim.phase,
      score: sim.score,
      best: this.best,
      coins: sim.coins,
      hearts: sim.hearts,
      maxHearts: MAX_HEARTS,
      nitro: sim.nitro,
      nitroActive: sim.nitroActive,
      combo: sim.combo,
      distance: sim.distance,
      kills: sim.kills
    });
    this.renderer.projectAim(aimX, this.crosshair);
    this.hud.setCrosshair(this.crosshair.x, this.crosshair.y, sim.phase === 'running', this.renderer.hasLock);
    this.hud.setDevices({
      gaze: deviceStatus(this.gazeEnabled, this.face.status, this.face.intent.present),
      hand: deviceStatus(this.handEnabled, this.hand.status, this.hand.intent.present),
      pointer
    });
  }

  private restart(): void {
    if (this.sim.score > this.best) this.best = this.sim.score;
    // A new road every run, like any endless runner — unless a specific one was asked for.
    this.sim.reset(this.fixedSeed ? undefined : (Math.random() * 0xffffffff) >>> 0);
    this.controls.reset();
    this.overFor = 0;
    this.slowmo = 0;
    this.hitStop = 0;
    this.accumulator = 0;
  }

  /** Camera access is opt-in and reversible: asked for on request, released when switched off. */
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

function deviceStatus(enabled: boolean, status: string, present: boolean): DeviceStatus {
  if (!enabled) return status === 'error' ? 'error' : 'off';
  if (status === 'loading') return 'loading';
  if (status === 'error') return 'error';
  return present ? 'on' : 'lost';
}

function loadBest(): number {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    // Storage can be blocked (private windows, site-data settings). A best score is a nicety.
    return 0;
  }
}

function saveBest(score: number): void {
  try {
    window.localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // See loadBest.
  }
}
