import { InputEngine } from '../input/InputEngine';
import { InputAction } from '../input/ActionTypes';
import { buildDistrict, type District } from '../city/CityLayout';
import { HeroMotor, type HeroIntent } from '../city/HeroMotor';
import { CityRenderer } from '../rendering/city/CityRenderer';
import { CityHUD } from '../ui/CityHUD';

/**
 * Runs VORIXA City (ADR-0014), phase 1: the hero on foot in the downtown district.
 *
 * The mouse is captured with pointer lock while playing; Esc releases it and brings back the card.
 * The hero steps at a fixed 120 Hz like every other simulation in the project.
 */

const TICK = 1 / 120;
const MAX_FRAME = 0.1;
const MOUSE_SENSITIVITY = 0.0022;
const PITCH_LIMIT = 1.25;

export class CityGame {
  private readonly input = new InputEngine();
  private readonly district: District = buildDistrict(4);
  private readonly hero: HeroMotor;
  private readonly hud: CityHUD;
  private readonly intent: HeroIntent = {
    forward: 0,
    right: 0,
    cameraYaw: 0,
    sprint: false,
    walk: false,
    jumpPressed: false,
    faceCamera: false
  };
  private lastTime = -1;
  private accumulator = 0;
  private playing = false;
  private started = false;

  public constructor(
    private readonly renderer: CityRenderer,
    private readonly canvas: HTMLCanvasElement,
    container: HTMLElement
  ) {
    this.hero = new HeroMotor(this.district.colliders, this.district.bounds);
    const s = this.district.spawn;
    this.hero.place(s.x, s.z, s.yaw + Math.PI);
    this.renderer.yaw = s.yaw;
    this.hud = new CityHUD(container);
    this.hud.onPlay = () => this.capture();
    this.hud.onBack = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      window.location.href = url.toString();
    };
    canvas.addEventListener('click', () => {
      if (this.renderer.ready && !this.playing) this.capture();
    });
    document.addEventListener('pointerlockchange', () => {
      this.playing = document.pointerLockElement === this.canvas;
      this.hud.showCard(!this.playing, this.started);
    });
    this.renderer
      .load(this.district, (share) => this.hud.progress(share))
      .then(() => this.hud.loaded())
      .catch((error: unknown) => {
        console.error('[city] could not load', error);
        this.hud.failed('Could not load the city');
      });
  }

  public start(): void {
    requestAnimationFrame((t) => this.frame(t));
  }

  private capture(): void {
    if (!this.renderer.ready) return;
    this.started = true;
    void this.canvas.requestPointerLock?.();
    // Browsers without pointer lock (and headless tests) still get to play.
    if (!('requestPointerLock' in this.canvas)) {
      this.playing = true;
      this.hud.showCard(false);
    }
  }

  private frame(nowMs: number): void {
    const now = nowMs / 1000;
    const dt = this.lastTime < 0 ? 0 : Math.max(0, Math.min(now - this.lastTime, MAX_FRAME));
    this.lastTime = now;
    const r = this.renderer;
    const i = this.input;

    if (this.playing) {
      r.yaw -= i.getAxis(InputAction.LOOK_X) * MOUSE_SENSITIVITY;
      r.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, r.pitch - i.getAxis(InputAction.LOOK_Y) * MOUSE_SENSITIVITY));
      if (i.isJustPressed(InputAction.VIEW_TOGGLE)) r.view = r.view === 'third' ? 'first' : 'third';
    }
    r.aiming = this.playing && i.isPressed(InputAction.ITEM);

    const intent = this.intent;
    const on = this.playing;
    intent.forward = on ? (i.isPressed(InputAction.MOVE_FORWARD) ? 1 : 0) - (i.isPressed(InputAction.MOVE_BACKWARD) ? 1 : 0) : 0;
    intent.right = on ? (i.isPressed(InputAction.STRAFE_RIGHT) ? 1 : 0) - (i.isPressed(InputAction.STRAFE_LEFT) ? 1 : 0) : 0;
    intent.cameraYaw = r.yaw;
    intent.sprint = on && i.isPressed(InputAction.DASH);
    intent.jumpPressed = on && i.isJustPressed(InputAction.JUMP);
    intent.faceCamera = r.aiming || r.view === 'first';

    this.accumulator += dt;
    while (this.accumulator >= TICK) {
      this.hero.step(intent, TICK);
      for (const fx of this.hero.fx) r.heroEvent(fx);
      intent.jumpPressed = false;
      this.accumulator -= TICK;
    }

    this.hud.setView(r.view === 'first', r.aiming || r.view === 'first');
    r.render(this.hero, dt);
    i.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }
}
