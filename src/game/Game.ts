import { InputEngine } from '../input/InputEngine';
import { InputAction } from '../input/ActionTypes';
import { AudioEngine } from '../audio/AudioEngine';
import { GameRenderer } from '../rendering/GameRenderer';
import { GameHUD } from '../ui/GameHUD';
import { buildCourse, type Checkpoint, type CourseData } from './Course';
import { staticCourseSource, type CourseSource } from './CourseSource';
import { CourseStream } from '../world/CourseStream';
import { RivalPack } from './Rivals';
import { PlayerController, type MoveIntent, type PlayerEvents, DASH_COOLDOWN } from './PlayerController';
import { CameraRig, type RigInput } from './CameraRig';
import { RunState } from './RunState';
import { GhostPlayback, GhostRecorder, loadGhost, saveGhost, type GhostFrame } from './Ghost';
import { Look, PITCH_LIMIT } from './Look';
import { HandTracker } from '../input/HandTracker';
import { FaceTracker } from '../input/FaceTracker';
import { applyGestureIntent } from '../input/GestureBridge';
import { applyGazeIntent } from '../input/GazeBridge';
import { Overlay2D } from '../ui/Overlay2D';
import type { CoPilotInput, CoPilotMood } from '../ui/CoPilot';
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

/**
 * Time dilation, triggered by a deliberate hard blink.
 *
 * 0.4 is slow enough that a difficult jump becomes readable, fast enough that the player is still
 * playing rather than watching. 1.6 s is about two obstacles at pace — long enough to be worth
 * spending, short enough that it cannot carry a whole section.
 */
const DILATION_SCALE = 0.4;
const DILATION_DURATION = 1.6;
/** Ease rate in and out of dilation. */
const DILATION_EASE = 9;

/**
 * Co-pilot head tracking for pointer-locked play.
 *
 * There is no cursor to follow under pointer lock, so the head follows the turn instead. The gain
 * converts a smoothed per-frame mouse delta into the -1..1 the co-pilot expects; the smoothing
 * keeps a flick of the mouse from snapping the head to full deflection for one frame.
 */
const YAW_RATE_TO_HEAD = 0.09;
const LOOK_RATE_SMOOTHING = 0.18;

function clampUnit(value: number): number {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}

/** Traffic seed for the authored course. Fixed so repeat attempts face identical rivals. */
const AUTHORED_TRAFFIC_SEED = 0x5641;

/** Route-map window on an endless course, in world units either side of the player. */
const ENDLESS_MAP_BEHIND = 60;
const ENDLESS_MAP_AHEAD = 240;

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
  private readonly faceTracker = new FaceTracker();
  private readonly overlay = new Overlay2D();
  private gestureEnabled = false;
  private gazeEnabled = false;
  /** Current simulation speed multiplier. 1 is real time. */
  private timeScale = 1;
  private dilationRemaining = 0;
  /** Smoothed view turn rate, used only to aim the co-pilot when no tracker is running. */
  private lookYawRate = 0;
  /** True while the ghost has a valid pose this frame, so the map can plot it. */
  private ghostVisible = false;

  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  public lookCaptured = false;

  /** Live in endless mode only. Null means the authored course is in play. */
  private readonly stream: CourseStream | null = null;
  /** Whichever course shape is driving this run. */
  private readonly source: CourseSource;
  /** Rival traffic. Present in both modes. */
  private readonly rivalPack: RivalPack;
  /** Seed the traffic was built from, so pilots stay attached to the same craft. */
  private readonly rivalSeed: number;

  /**
   * @param options.endlessSeed When given, the course is generated and streamed from this seed
   *        instead of using the authored one. The rest of the loop is identical: both shapes are
   *        a `CourseSource`, so collision, checkpoints and respawn do not know which they have.
   */
  constructor(
    renderer: GameRenderer,
    input: InputEngine = new InputEngine(),
    audio: AudioEngine = new AudioEngine(),
    hud: GameHUD = new GameHUD(),
    options: { endlessSeed?: number } = {}
  ) {
    this.course = buildCourse();
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.hud = hud;

    if (options.endlessSeed !== undefined) {
      this.stream = new CourseStream(options.endlessSeed);
      // Populate before the first tick, or the player spawns into empty space and falls through
      // a world that has not been generated yet.
      this.stream.update(this.stream.spawnZ);
      this.syncStreamedGeometry();
      this.source = this.stream;
    } else {
      this.source = staticCourseSource(this.course);
    }

    // Traffic in both modes. The authored course gets a fixed seed so its rivals are the same
    // every run — a time trial whose traffic reshuffles is not a fair comparison between attempts.
    this.rivalSeed = options.endlessSeed ?? AUTHORED_TRAFFIC_SEED;
    this.rivalPack = new RivalPack(this.rivalSeed);

    this.run = new RunState(this.source);

    const stored = loadGhost();
    if (stored) this.ghost = new GhostPlayback(stored);

    this.resetToSpawn(true);
  }

  /**
   * What the route map should show.
   *
   * A finite course maps its whole length, because "how much is left?" has an answer. An endless
   * one maps a rolling window around the player instead — the same strip, but reading as position
   * rather than progress, since there is no total to be a fraction of.
   */
  private routeView(): {
    routeStartZ: number;
    routeEndZ: number;
    checkpoints: readonly Checkpoint[];
    hasFinish: boolean;
  } {
    if (this.stream) {
      const z = this.player.body.z;
      return {
        routeStartZ: z + ENDLESS_MAP_BEHIND,
        routeEndZ: z - ENDLESS_MAP_AHEAD,
        checkpoints: this.stream.checkpoints,
        hasFinish: false
      };
    }
    return {
      routeStartZ: this.course.spawnZ,
      routeEndZ: this.course.finishZ,
      checkpoints: this.course.checkpoints,
      hasFinish: true
    };
  }

  /**
   * What the co-pilot should be looking at and reacting to.
   *
   * Head direction comes from the gaze tracker when it is live — the co-pilot genuinely follows
   * the player's eyes, which is the whole reason to have one in a game that already knows where
   * you are looking. Falling back to camera pitch and hand steering keeps it alive for keyboard
   * players rather than freezing it centred, which would read as broken.
   *
   * Mood is the most urgent event this frame, ordered by what the player most needs acknowledged:
   * hitting a hazard outranks banking a checkpoint.
   */
  private coPilotView(events: PlayerEvents): CoPilotInput {
    const gaze = this.gazeEnabled && this.faceTracker.isRunning ? this.faceTracker.intent : null;

    let mood: CoPilotMood = 'idle';
    if (events.hazardHit) mood = 'hazard';
    else if (this.run.justRespawned) mood = 'falling';
    else if (this.run.isNewRecord && this.run.justFinished) mood = 'record';
    else if (events.boosted) mood = 'boost';
    else if (this.run.justPassedCheckpoint) mood = 'checkpoint';
    else if (this.dilationRemaining > 0) mood = 'dilating';

    /*
     * Fallback chain, most direct signal first.
     *
     * The first version fell back to the ROLL axis for horizontal, which is only ever written by
     * hand tracking in flight mode — so for a keyboard-and-mouse player it was permanently zero
     * and the head could not turn sideways at all. Vertical passed raw `look.pitch` in radians,
     * which for ordinary looking sits far below the dead zone. Between them the co-pilot barely
     * moved, which is not obviously a bug on screen: it just looks like a character that ignores
     * you.
     */
    const hand = this.gestureEnabled && this.tracker.isRunning ? this.tracker.intent : null;

    let lookX: number;
    let lookY: number;
    if (gaze?.present) {
      lookX = gaze.gazeX;
      lookY = gaze.gazeY;
    } else if (hand?.present) {
      lookX = hand.steerX;
      lookY = hand.steerY;
    } else {
      // Mouse and keyboard have no pointer to follow under pointer lock, so the head follows the
      // *turn*: how fast the view is swinging, and how far it is pitched.
      lookX = clampUnit(this.lookYawRate * YAW_RATE_TO_HEAD);
      lookY = clampUnit(-this.look.pitch / PITCH_LIMIT);
    }

    return {
      gazeX: lookX,
      gazeY: lookY,
      mood,
      // Only "lost" when a tracker is actually running — an unused camera is not a failed one.
      trackingLost:
        (this.gazeEnabled && this.faceTracker.isRunning && !this.faceTracker.intent.present) ||
        (this.gestureEnabled && this.tracker.isRunning && !this.tracker.intent.present),
      // Either signal means the player has engaged: mouse captured, or the run underway. Using
      // both covers playing with the keyboard without ever locking the pointer.
      visible: this.lookCaptured || this.run.phase !== 'ready'
    };
  }

  /**
   * Pushes the streamer's latest window into the renderer.
   *
   * Removals run before additions so a segment index being replaced releases its buffers before
   * the new one allocates, which keeps the peak lower than the steady state rather than higher.
   */
  private syncStreamedGeometry(): void {
    if (!this.stream) return;
    for (const segment of this.stream.removed) this.renderer.removeCourseSegment(segment.index);
    for (const segment of this.stream.added) {
      this.renderer.addCourseSegment(segment.index, segment.boxes, segment.checkpoint, {
        seed: segment.seed,
        minZ: segment.minZ,
        maxZ: segment.maxZ
      });
    }
  }

  public get courseData(): CourseData {
    return this.course;
  }

  private resetToSpawn(full: boolean): void {
    const spot = full
      ? { x: this.source.spawnX, y: this.source.spawnY, z: this.source.spawnZ }
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

  public get faceTrackerStatus(): string {
    return this.faceTracker.status;
  }

  public get gazeActive(): boolean {
    return this.gazeEnabled;
  }

  /**
   * Gaze control is opt-in and reversible on the same terms as hand control.
   *
   * Switching it off has to clear the look axes explicitly. The bus holds the last value written,
   * so a player who disables gaze mid-turn would otherwise keep rotating forever with no input
   * device responsible for it.
   */
  public async toggleGaze(): Promise<void> {
    if (this.gazeEnabled) {
      this.gazeEnabled = false;
      this.faceTracker.stop();
      applyGazeIntent(this.input, this.faceTracker.intent, 0);
      return;
    }
    this.gazeEnabled = true;
    const ok = await this.faceTracker.start();
    if (!ok) this.gazeEnabled = this.faceTracker.status === 'loading';
  }

  private frame(nowMs: number): void {
    if (!this.running) return;
    const now = nowMs / 1000;
    const frameDelta = Math.min(now - this.lastTime, MAX_FRAME_DELTA);
    this.lastTime = now;

    // Vision intent is injected into the action bus *before* look and movement are read, so the
    // rest of the loop cannot tell a webcam from a keyboard.
    //
    // Gaze runs first and, while live, claims the look axes; the hands then fall back to flight
    // controls instead of steering. Exactly one device writes any given axis per frame — two
    // would quietly become last-writer-wins, which surfaces as the camera fighting itself.
    const gazeDriving = this.gazeEnabled && this.faceTracker.isRunning;
    if (gazeDriving) {
      applyGazeIntent(this.input, this.faceTracker.update(), frameDelta);
    }

    if (this.gestureEnabled && this.tracker.isRunning) {
      applyGestureIntent(
        this.input,
        this.tracker.update(),
        frameDelta,
        gazeDriving ? 'flight' : 'steer'
      );
    }

    this.consumeLook();

    if (this.input.isJustPressed(InputAction.RESTART)) this.restart();
    if (this.input.isJustPressed(InputAction.GESTURE_TOGGLE)) void this.toggleGesture();
    if (this.input.isJustPressed(InputAction.GAZE_TOGGLE)) void this.toggleGaze();
    if (this.input.isJustPressed(InputAction.TIME_DILATE)) this.triggerDilation();
    if (this.input.isJustPressed(InputAction.MUTE_TOGGLE)) {
      this.hud.setMuted(this.audio.toggleMute());
    }

    this.updateDilation(frameDelta);
    // Audio follows the simulation clock. Slow motion with a full-bandwidth mix reads as a bug —
    // the world crawls while the soundtrack carries on, and the brain trusts its ears.
    this.audio.setDilation((1 - this.timeScale) / (1 - DILATION_SCALE));

    // The simulation runs on dilated time; the run clock does not. Slowing the world is a
    // precision aid that costs you real seconds, not a way to buy a better time — if the clock
    // slowed with the world, holding a blink would be strictly optimal and the whole mechanic
    // would collapse into an exploit.
    this.accumulator += frameDelta * this.timeScale;
    while (this.accumulator >= TICK_DURATION) {
      this.tick(TICK_DURATION, TICK_DURATION / this.timeScale);
      this.accumulator -= TICK_DURATION;
    }

    this.present(frameDelta);
    this.input.endFrame();

    requestAnimationFrame((t) => this.frame(t));
  }

  /**
   * Starts a time-dilation window.
   *
   * Refuses while one is already running rather than extending it — otherwise a player holding
   * their eyes shut would stay in slow motion indefinitely, and the ability would stop being a
   * decision about when to spend it.
   */
  private triggerDilation(): void {
    if (this.dilationRemaining > 0) return;
    this.dilationRemaining = DILATION_DURATION;
    this.audio.playSoundEffect(880, 0.18, 'sine');
  }

  /**
   * Advances the dilation window and eases the time scale.
   *
   * Eased rather than switched: an instant jump to a third speed and back is disorienting and
   * reads as a frame hitch, which is the opposite of the intended "everything got precise" feel.
   */
  private updateDilation(frameDelta: number): void {
    if (this.dilationRemaining > 0) {
      this.dilationRemaining = Math.max(0, this.dilationRemaining - frameDelta);
    }
    const target = this.dilationRemaining > 0 ? DILATION_SCALE : 1;
    this.timeScale += (target - this.timeScale) * (1 - Math.exp(-DILATION_EASE * frameDelta));
  }

  /** Look is consumed once per frame; applying it per tick would double-apply mouse deltas. */
  private consumeLook(): void {
    const dx = this.input.getAxis(InputAction.LOOK_X);
    const dy = this.input.getAxis(InputAction.LOOK_Y);
    if (dx !== 0 || dy !== 0) this.look.apply(dx, dy);

    // Smoothed turn rate, for the co-pilot to follow when there is no tracker and no pointer.
    // Decays toward zero on its own, so holding still settles the head back to centre.
    this.lookYawRate += (dx - this.lookYawRate) * LOOK_RATE_SMOOTHING;
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
      crouchHeld: this.input.isPressed(InputAction.CROUCH),
      brake: this.input.getAxis(InputAction.BRAKE)
    };
  }

  /**
   * @param dt     Simulation step, already dilated.
   * @param realDt Wall-clock equivalent of this step, for anything that must not be slowed.
   */
  private tick(dt: number, realDt: number): void {
    const intent = this.buildIntent();
    // The streamer runs before physics, not after: stepping the player through geometry that has
    // not been generated yet is how a fast run falls through the floor at a segment boundary.
    if (this.stream?.update(this.player.body.z)) this.syncStreamedGeometry();

    this.player.update(intent, this.source.boxes, dt);
    this.emitMovementAudio();

    const body = this.player.body;
    const moving = intent.forward !== 0 || intent.strafe !== 0 || intent.jumpPressed;

    const fell = this.run.update(body.x, body.y, body.z, moving, realDt);

    if (this.run.phase === 'running') {
      this.recorder.sample(this.run.elapsed, body.x, body.y, body.z, this.look.yaw);
    }

    if (this.run.justPassedCheckpoint) {
      this.renderer.setCheckpointProgress(this.run.checkpointIndex);
      this.audio.playCheckpointChime();
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
    if (e.boosted) this.audio.playBoost();
    if (e.jumpPadLaunched) this.audio.playJumpPad();
    if (e.hazardHit) this.audio.playHazard();
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
      sliding: p.sliding,
      bank: this.input.getAxis(InputAction.ROLL)
    };
  }

  private present(frameDelta: number): void {
    let strafe = 0;
    if (this.input.isPressed(InputAction.STRAFE_LEFT)) strafe -= 1;
    if (this.input.isPressed(InputAction.STRAFE_RIGHT)) strafe += 1;

    const events = this.player.events;
    const rig = this.rig.update(
      this.rigInput(strafe),
      events.landed,
      events.dashed,
      frameDelta,
      events.boosted,
      events.hazardHit
    );

    this.audio.setSpeedWind(this.player.speed / 26);

    // Traffic runs on dilated time: rivals that kept full pace through a dilation would turn the
    // ability into a handicap, since the one thing it is for is buying you a moment on them.
    this.renderer.setRivalPoses(
      this.rivalPack.update(frameDelta * this.timeScale, this.player.body.z)
    );

    this.renderer.setCraftState({
      speed: Math.min(this.player.speed / (MAX_GROUND_SPEED * 2.6), 1),
      bank: this.input.getAxis(InputAction.ROLL),
      brake: this.input.getAxis(InputAction.BRAKE),
      boosting: events.boosted,
      dilating: this.dilationRemaining > 0
    });

    this.updateGhost();
    this.renderer.render(rig);

    this.overlay.draw({
      ...this.routeView(),
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
      video: this.tracker.videoElement,
      gazeEnabled: this.gazeEnabled,
      gazeStatus: this.faceTracker.status,
      gazeIntent: this.gazeEnabled ? this.faceTracker.intent : null,
      coPilot: this.coPilotView(events),
      rivals: this.rivalPack.all,
      rivalSeed: this.rivalSeed
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
