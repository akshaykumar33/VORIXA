import { World } from '../ecs/World';
import { InputEngine } from '../input/InputEngine';
import { InputAction } from '../input/ActionTypes';
import { Renderer } from '../rendering/Renderer';
import { AudioEngine } from '../audio/AudioEngine';
import { HUDOverlay } from '../ui/HUDOverlay';
import { CapabilitiesReport } from './DeviceCapabilities';

export class Engine {
  public static readonly TICK_RATE = 60;
  public static readonly TICK_DURATION = 1000 / Engine.TICK_RATE; // 16.666 ms

  public world: World;
  public input: InputEngine;
  public renderer: Renderer;
  public audio: AudioEngine;
  public hud: HUDOverlay;
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

  // Controlled Player Entity ID
  public playerEntityId: number = 0;

  constructor(
    renderer: Renderer,
    capabilities: CapabilitiesReport,
    world: World = new World(),
    input: InputEngine = new InputEngine(),
    audio: AudioEngine = new AudioEngine(),
    hud: HUDOverlay = new HUDOverlay()
  ) {
    this.renderer = renderer;
    this.capabilities = capabilities;
    this.world = world;
    this.input = input;
    this.audio = audio;
    this.hud = hud;

    this.initPlayer();
  }

  private initPlayer(): void {
    this.playerEntityId = this.world.createEntity();
    this.world.addTransform(this.playerEntityId, 0, 0, 0);
    this.world.addVelocity(this.playerEntityId, 0, 0, 0);
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

    // Fixed-timestep simulation updates
    while (this.accumulator >= Engine.TICK_DURATION) {
      this.tick(Engine.TICK_DURATION / 1000);
      this.accumulator -= Engine.TICK_DURATION;
    }

    // Render pass with interpolation factor
    const alpha = this.accumulator / Engine.TICK_DURATION;
    this.renderer.render(this.world, alpha);

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
      posZ: this.world.posZ[this.playerEntityId] || 0
    });

    this.input.endFrame();

    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame((time) => this.loop(time));
    }
  }

  public tick(deltaTime: number): void {
    this.simTicks++;

    // Player Kinetic Movement from Normalized Actions
    const moveSpeed = this.input.isPressed(InputAction.DASH) ? 14.0 : 8.0;
    let vx = 0;
    let vz = 0;

    if (this.input.isPressed(InputAction.MOVE_FORWARD)) vz -= moveSpeed;
    if (this.input.isPressed(InputAction.MOVE_BACKWARD)) vz += moveSpeed;
    if (this.input.isPressed(InputAction.STRAFE_LEFT)) vx -= moveSpeed;
    if (this.input.isPressed(InputAction.STRAFE_RIGHT)) vx += moveSpeed;

    if (this.input.isJustPressed(InputAction.JUMP)) {
      this.audio.playSoundEffect(600, 0.1, 'square');
    }
    if (this.input.isJustPressed(InputAction.DASH)) {
      this.audio.playSoundEffect(350, 0.15, 'sawtooth');
    }

    this.world.velX[this.playerEntityId] = vx;
    this.world.velZ[this.playerEntityId] = vz;

    // Advance ECS simulation
    this.world.tick(deltaTime);
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
