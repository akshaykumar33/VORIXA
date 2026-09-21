import { InputEngine } from '../input/InputEngine';
import { InputAction } from '../input/ActionTypes';
import { AudioEngine } from '../audio/AudioEngine';
import { GameRenderer } from '../rendering/GameRenderer';
import { GameHUD } from '../ui/GameHUD';
import { buildCourse, type CourseData } from './Course';
import { PlayerController, type MoveIntent, DASH_COOLDOWN } from './PlayerController';
import { CameraRig, type RigInput } from './CameraRig';
import { RunState } from './RunState';
import { GhostPlayback, GhostRecorder, loadGhost, saveGhost, type GhostFrame } from './Ghost';
import { Look } from './Look';
import { HandTracker } from '../input/HandTracker';
import { applyGestureIntent } from '../input/GestureBridge';
import { Overlay2D } from '../ui/Overlay2D';
import { MAX_GROUND_SPEED } from './PlayerController';

/**
 * Game orchestration: the loop, and the wiring between movement, run rules, and presentation.
 *
 * The simulation runs at a fixed 120 Hz regardless of display rate. Movement games are unusually
 * sensitive to this — jump apex, dash distance and wall-run duration are all integrations, and if
 * they vary with frame rate then a 144 Hz player and a 60 Hz player are not running the same
 * course, which makes the leaderboard meaningless.
 */

const TICK_RATE = 120;
const TICK_DURATION = 1 / TICK_RATE;
/** Beyond this, we stop simulating rather than spiral. A tab regaining focus must not teleport. */
const MAX_FRAME_DELTA = 0.1;

export class Game {
  private readonly course: CourseData;
  private readonly player = new PlayerController();
  private readonly rig = new CameraRig();
  private readonly look = new Look();
  private readonly run: RunState;
  private readonly recorder = new GhostRecorder();
  private ghost: GhostPlayback | null = null;
  private readonly ghostFrame: GhostFrame = { x: 0, y: 0, z: 0, yaw: 0 };

  private readonly renderer: GameRenderer;
  private readonly input: InputEngine;
  private readonly audio: AudioEngine;
  private readonly hud: GameHUD;

  private readonly tracker = new HandTracker();
  private readonly overlay = new Overlay2D();
  private gestureEnabled = false;
  /** True while the ghost has a valid pose this frame, so the map can plot it. */
  private ghostVisible = false;

  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  public lookCaptured = false;

  constructor(
    renderer: GameRenderer,
    input: InputEngine = new InputEngine(),
    audio: AudioEngine = new AudioEngine(),
    hud: GameHUD = new GameHUD()
  ) {
    this.course = buildCourse();
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.hud = hud;
    this.run = new RunState(this.course);

    const stored = loadGhost();
    if (stored) this.ghost = new GhostPlayback(stored);

    this.resetToSpawn(true);
  }

  public get courseData(): CourseData {
    return this.course;
  }

  private resetToSpawn(full: boolean): void {
    const spot = full
      ? { x: this.course.spawnX, y: this.course.spawnY, z: this.course.spawnZ }
      : this.run.respawn;
    this.player.reset(spot.x, spot.y, spot.z);
    if (full) {
      this.look.reset(0, 0);
      this.recorder.start();
    }
    this.rig.reset(this.rigInput(0));
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now() / 1000;
    requestAnimationFrame((t) => this.frame(t));
  }

  public stop(): void {
    this.running = false;
  }

  /** Browsers require a user gesture before audio will play; the capture click is that gesture. */
  public async unlockAudio(): Promise<void> {
    await this.audio.unlock();
  }

  public attachOverlay(canvas: HTMLCanvasElement): void {
    this.overlay.attach(canvas);
  }

  public resizeOverlay(width: number, height: number): void {
    this.overlay.resize(width, height);
  }

  public get trackerStatus(): string {
    return this.tracker.status;
  }

  public get gestureActive(): boolean {
    return this.gestureEnabled;
  }

  /**
   * Hand control is opt-in and reversible. Turning it on asks for the camera the moment the
   * player asks for it and never before — and turning it off releases the camera rather than
   * leaving the indicator light on, which is the difference between a feature and a liability.
   */
  public async toggleGesture(): Promise<void> {
    if (this.gestureEnabled) {
      this.gestureEnabled = false;
      this.tracker.stop();
      // Clear anything the hand was holding, or the player keeps running after switching off.
      applyGestureIntent(this.input, this.tracker.intent, 0);
      return;
    }
    this.gestureEnabled = true;
    const ok = await this.tracker.start();
    if (!ok) this.gestureEnabled = this.tracker.status === 'loading';
  }

  private frame(nowMs: number): void {
    if (!this.running) return;
    const now = nowMs / 1000;
    const frameDelta = Math.min(now - this.lastTime, MAX_FRAME_DELTA);
    this.lastTime = now;

    // Gesture intent is injected into the action bus *before* look and movement are read, so the
    // rest of the loop cannot tell a webcam from a keyboard.
    if (this.gestureEnabled && this.tracker.isRunning) {
      applyGestureIntent(this.input, this.tracker.update(), frameDelta);
    }

    this.consumeLook();

    if (this.input.isJustPressed(InputAction.RESTART)) this.restart();
    if (this.input.isJustPressed(InputAction.GESTURE_TOGGLE)) void this.toggleGesture();

    this.accumulator += frameDelta;
    while (this.accumulator >= TICK_DURATION) {
      this.tick(TICK_DURATION);
      this.accumulator -= TICK_DURATION;
    }

    this.present(frameDelta);
    this.input.endFrame();

    requestAnimationFrame((t) => this.frame(t));
  }

  /** Look is consumed once per frame; applying it per tick would double-apply mouse deltas. */
  private consumeLook(): void {
    const dx = this.input.getAxis(InputAction.LOOK_X);
    const dy = this.input.getAxis(InputAction.LOOK_Y);
    if (dx !== 0 || dy !== 0) this.look.apply(dx, dy);
  }

  public restart(): void {
    this.run.restart();
    this.resetToSpawn(true);
    this.audio.playSoundEffect(240, 0.12, 'triangle');
  }

  private buildIntent(): MoveIntent {
    let forward = 0;
    let strafe = 0;
    if (this.input.isPressed(InputAction.MOVE_FORWARD)) forward += 1;
    if (this.input.isPressed(InputAction.MOVE_BACKWARD)) forward -= 1;
    if (this.input.isPressed(InputAction.STRAFE_LEFT)) strafe -= 1;
    if (this.input.isPressed(InputAction.STRAFE_RIGHT)) strafe += 1;

    return {
      forward,
      strafe,
      yaw: this.look.yaw,
      jumpPressed: this.input.isJustPressed(InputAction.JUMP),
      dashPressed: this.input.isJustPressed(InputAction.DASH),
      crouchHeld: this.input.isPressed(InputAction.CROUCH)
    };
  }

  private tick(dt: number): void {
    const intent = this.buildIntent();
    this.player.update(intent, this.course.boxes, dt);
    this.emitMovementAudio();

    const body = this.player.body;
    const moving = intent.forward !== 0 || intent.strafe !== 0 || intent.jumpPressed;

    const fell = this.run.update(body.x, body.y, body.z, moving, dt);

    if (this.run.phase === 'running') {
      this.recorder.sample(this.run.elapsed, body.x, body.y, body.z, this.look.yaw);
    }

    if (this.run.justPassedCheckpoint) {
      this.renderer.setCheckpointProgress(this.run.checkpointIndex);
      this.audio.playSoundEffect(880, 0.09, 'sine');
    }

    if (fell) {
      const spot = this.run.respawn;
      this.player.reset(spot.x, spot.y, spot.z);
      this.rig.reset(this.rigInput(0));
      this.audio.playSoundEffect(150, 0.22, 'sawtooth');
    }

    if (this.run.justFinished) this.onFinish();
  }

  private onFinish(): void {
    if (this.run.isNewRecord) {
      saveGhost(this.recorder.take());
      this.ghost = new GhostPlayback(this.recorder.take());
      this.audio.playSoundEffect(660, 0.16, 'square');
      window.setTimeout(() => this.audio.playSoundEffect(990, 0.28, 'square'), 130);
    } else {
      this.audio.playSoundEffect(520, 0.2, 'sine');
    }
  }

  private emitMovementAudio(): void {
    const e = this.player.events;
    if (e.jumped) this.audio.playSoundEffect(520, 0.08, 'square');
    if (e.wallJumped) this.audio.playSoundEffect(700, 0.1, 'square');
    if (e.dashed) this.audio.playSoundEffect(320, 0.16, 'sawtooth');
    if (e.slideStarted) this.audio.playSoundEffect(180, 0.16, 'triangle');
    if (e.landed > 4) {
      // Heavier landings speak lower and longer, so impact is audible as well as visible.
      const impact = Math.min(e.landed / 20, 1);
      this.audio.playSoundEffect(190 - impact * 70, 0.06 + impact * 0.08, 'sine');
    }
  }

  private rigInput(strafe: number): RigInput {
    const p = this.player;
    return {
      x: p.body.x,
      y: p.body.y,
      z: p.body.z,
      eyeHeight: p.eyeHeight,
      yaw: this.look.yaw,
      pitch: this.look.pitch,
      speed: p.speed,
      strafe,
      wallSide: p.wallSide,
      dashing: false,
      sliding: p.sliding
    };
  }

  private present(frameDelta: number): void {
    let strafe = 0;
    if (this.input.isPressed(InputAction.STRAFE_LEFT)) strafe -= 1;
    if (this.input.isPressed(InputAction.STRAFE_RIGHT)) strafe += 1;

    const events = this.player.events;
    const rig = this.rig.update(this.rigInput(strafe), events.landed, events.dashed, frameDelta);

    this.updateGhost();
    this.renderer.render(rig);

    this.overlay.draw({
      course: this.course,
      playerX: this.player.body.x,
      playerZ: this.player.body.z,
      ghostX: this.ghostVisible ? this.ghostFrame.x : null,
      ghostZ: this.ghostVisible ? this.ghostFrame.z : null,
      checkpointIndex: this.run.checkpointIndex,
      speed: this.player.speed,
      maxSpeed: MAX_GROUND_SPEED * 2.6,
      gestureEnabled: this.gestureEnabled,
      trackerStatus: this.tracker.status,
      trackerError: this.tracker.errorMessage,
      intent: this.gestureEnabled ? this.tracker.intent : null,
      landmarks: this.tracker.landmarks,
      video: this.tracker.videoElement
    });

    this.hud.update({
      run: this.run.snapshot(),
      speed: this.player.speed,
      dashReady: this.player.dashCooldown <= 0,
      dashCharge: 1 - this.player.dashCooldown / DASH_COOLDOWN,
      dashRefused: events.dashRefused,
      wallRunning: this.player.wallRunning,
      sliding: this.player.sliding,
      grounded: this.player.grounded,
      lookCaptured: this.lookCaptured
    });
  }

  private updateGhost(): void {
    if (!this.ghost || this.run.phase !== 'running') {
      if (this.run.phase === 'ready') this.renderer.hideGhost();
      this.ghostVisible = false;
      return;
    }
    const frame = this.ghost.sampleAt(this.run.elapsed, this.ghostFrame);
    this.ghostVisible = frame !== null;
    if (frame) this.renderer.setGhostPose(frame.x, frame.y, frame.z, frame.yaw);
    else this.renderer.hideGhost();
  }
}
