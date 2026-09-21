import { World } from '../ecs/World';
import { InputEngine } from '../input/InputEngine';
import { InputAction } from '../input/ActionTypes';
import { Renderer } from '../rendering/Renderer';
import { Camera } from '../rendering/Camera';
import { AudioEngine } from '../audio/AudioEngine';
import { HUDOverlay } from '../ui/HUDOverlay';
import { CapabilitiesReport } from './DeviceCapabilities';
import { yawForwardX, yawForwardZ, yawRightX, yawRightZ } from '../math/Mat4';

export class Engine {
  public static readonly TICK_RATE = 60;
  public static readonly TICK_DURATION = 1000 / Engine.TICK_RATE; // 16.666 ms

  /** Metres per second squared. Tuned for arcade weight, not Earth realism — 9.81 feels floaty. */
  public static readonly GRAVITY = 26;
  /** Initial upward speed on jump, giving roughly a 1.1 m apex. */
  public static readonly JUMP_SPEED = 7.6;
  public static readonly WALK_SPEED = 8;
  public static readonly SPRINT_SPEED = 14;

  public world: World;
  public input: InputEngine;
  public renderer: Renderer;
  public audio: AudioEngine;
  public hud: HUDOverlay;
  public camera: Camera;
  public capabilities: CapabilitiesReport;

  private isRunning: boolean = false;
  private lastTime: number = 0;
  private accumulator: number = 0;
  public simTicks: number = 0;

  // Telemetry sliding window
  private frameTimes: number[] = [];
  private lastFpsUpdate: number = 0;
  private currentFps: number = 60;
  private currentP95: number = 16.6;

  /** 0 when walking, 1 at full sprint. Drives camera FOV, so it is state rather than a local. */
  private sprintAmount: number = 0;
  private grounded: boolean = true;
  /** Mirrors pointer-lock state purely so the HUD can tell the player how to regain the cursor. */
  public lookCaptured: boolean = false;

  // Controlled Player Entity ID
  public playerEntityId: number = 0;

  constructor(
    renderer: Renderer,
    capabilities: CapabilitiesReport,
    world: World = new World(),
    input: InputEngine = new InputEngine(),
    audio: AudioEngine = new AudioEngine(),
    hud: HUDOverlay = new HUDOverlay(),
    camera: Camera = new Camera()
  ) {
    this.renderer = renderer;
    this.capabilities = capabilities;
    this.world = world;
    this.input = input;
    this.audio = audio;
    this.hud = hud;
    this.camera = camera;

    this.initPlayer();
  }

  private initPlayer(): void {
    this.playerEntityId = this.world.createEntity();
    this.world.addTransform(this.playerEntityId, 0, 0, 0);
    this.world.addVelocity(this.playerEntityId, 0, 0, 0);
    // Without the snap the camera would ease in from the world origin on the first frame, which
    // reads as an unrequested cutscene.
    this.camera.snapTo(0, 0, 0);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = typeof performance !== 'undefined' ? performance.now() : 0;
    this.lastFpsUpdate = this.lastTime;

    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame((time) => this.loop(time));
    }
  }

  public stop(): void {
    this.isRunning = false;
  }

  public loop(currentTime: number): void {
    if (!this.isRunning) return;

    const frameDelta = Math.min(currentTime - this.lastTime, 100); // 100ms clamp prevents death spiral
    this.lastTime = currentTime;
    this.accumulator += frameDelta;

    // Track frame time for P95 latency
    this.frameTimes.push(frameDelta);
    if (this.frameTimes.length > 60) this.frameTimes.shift();

    if (currentTime - this.lastFpsUpdate >= 250) {
      this.calculateTelemetry();
      this.lastFpsUpdate = currentTime;
    }

    // Look is consumed once per frame, before simulation, and deliberately NOT inside `tick`.
    // Mouse deltas are per-frame quantities; a frame that runs two catch-up ticks would otherwise
    // apply the same delta twice and the view would lurch under load. Applying it first also means
    // movement this frame uses the orientation the player can already see.
    this.consumeLook();

    // Fixed-timestep simulation updates
    while (this.accumulator >= Engine.TICK_DURATION) {
      this.tick(Engine.TICK_DURATION / 1000);
      this.accumulator -= Engine.TICK_DURATION;
    }

    // Render pass with interpolation factor
    const alpha = this.accumulator / Engine.TICK_DURATION;

    this.camera.update(
      this.world.posX[this.playerEntityId],
      this.world.posY[this.playerEntityId],
      this.world.posZ[this.playerEntityId],
      frameDelta / 1000,
      this.sprintAmount
    );
    this.camera.updateMatrices();

    this.renderer.render(this.world, alpha, this.camera);

    // Update HUD
    this.hud.update({
      fps: this.currentFps,
      p95FrameTime: this.currentP95,
      simTicks: this.simTicks,
      activeEntities: this.world.activeCount,
      backendName: this.renderer.getBackendName(),
      capabilities: this.capabilities,
      posX: this.world.posX[this.playerEntityId] || 0,
      posY: this.world.posY[this.playerEntityId] || 0,
      posZ: this.world.posZ[this.playerEntityId] || 0,
      yaw: this.camera.yaw,
      pitch: this.camera.pitch,
      fov: this.camera.effectiveFovDegrees,
      lookCaptured: this.lookCaptured
    });

    this.input.endFrame();

    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame((time) => this.loop(time));
    }
  }

  /** Applies this frame's accumulated mouse delta to the camera. */
  public consumeLook(): void {
    const dx = this.input.getAxis(InputAction.LOOK_X);
    const dy = this.input.getAxis(InputAction.LOOK_Y);
    if (dx !== 0 || dy !== 0) this.camera.applyLook(dx, dy);
  }

  public tick(deltaTime: number): void {
    this.simTicks++;

    const id = this.playerEntityId;
    const sprinting = this.input.isPressed(InputAction.DASH);
    const moveSpeed = sprinting ? Engine.SPRINT_SPEED : Engine.WALK_SPEED;

    // Movement is expressed in the camera's frame, not the world's: forward means "the way the
    // player is looking". The yaw basis comes from Mat4 so it cannot drift out of agreement with
    // the view matrix.
    let forward = 0;
    let strafe = 0;
    if (this.input.isPressed(InputAction.MOVE_FORWARD)) forward += 1;
    if (this.input.isPressed(InputAction.MOVE_BACKWARD)) forward -= 1;
    if (this.input.isPressed(InputAction.STRAFE_LEFT)) strafe -= 1;
    if (this.input.isPressed(InputAction.STRAFE_RIGHT)) strafe += 1;

    // Normalising the input vector stops diagonal movement being 1.41x faster than cardinal —
    // the classic "strafe-running" bug that makes a control scheme feel broken once discovered.
    const magnitude = Math.hypot(forward, strafe);
    if (magnitude > 1) {
      forward /= magnitude;
      strafe /= magnitude;
    }

    const yaw = this.camera.yaw;
    const vx =
      (yawForwardX(yaw) * forward + yawRightX(yaw) * strafe) * moveSpeed;
    const vz =
      (yawForwardZ(yaw) * forward + yawRightZ(yaw) * strafe) * moveSpeed;

    this.world.velX[id] = vx;
    this.world.velZ[id] = vz;

    // Sprint only reads as sprint when there is movement to accelerate; standing still and holding
    // Shift should not widen the FOV.
    const moving = magnitude > 0;
    this.sprintAmount = sprinting && moving ? 1 : 0;

    if (this.input.isJustPressed(InputAction.JUMP) && this.grounded) {
      this.world.velY[id] = Engine.JUMP_SPEED;
      this.grounded = false;
      this.audio.playSoundEffect(600, 0.1, 'square');
    }
    if (this.input.isJustPressed(InputAction.DASH) && moving) {
      this.audio.playSoundEffect(350, 0.15, 'sawtooth');
    }

    if (!this.grounded) {
      this.world.velY[id] -= Engine.GRAVITY * deltaTime;
    }

    // Advance ECS simulation
    this.world.tick(deltaTime);

    // Ground collision. The slice has a single flat floor at y = 0; real terrain height queries
    // arrive with world streaming.
    if (this.world.posY[id] <= 0) {
      this.world.posY[id] = 0;
      this.world.velY[id] = 0;
      this.grounded = true;
    }
  }

  private calculateTelemetry(): void {
    if (this.frameTimes.length === 0) return;
    const avg = this.frameTimes.reduce((acc, v) => acc + v, 0) / this.frameTimes.length;
    this.currentFps = avg > 0 ? Math.round(1000 / avg) : 60;

    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p95Idx = Math.floor(sorted.length * 0.95);
    this.currentP95 = sorted[p95Idx] || avg;
  }
}
