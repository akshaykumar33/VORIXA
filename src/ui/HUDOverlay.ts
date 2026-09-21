import { CapabilitiesReport } from '../core/DeviceCapabilities';

export interface TelemetryData {
  fps: number;
  p95FrameTime: number;
  simTicks: number;
  activeEntities: number;
  backendName: string;
  capabilities: CapabilitiesReport;
  posX: number;
  posY: number;
  posZ: number;
  /** Camera yaw in radians. */
  yaw: number;
  /** Camera pitch in radians. */
  pitch: number;
  /** Current effective vertical FOV in degrees, including the sprint boost. */
  fov: number;
  /** Whether the mouse is currently captured for look. */
  lookCaptured: boolean;
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Converts camera yaw into a compass heading.
 *
 * World convention: -Z is north and +X is east (see Mat4's yaw basis). Positive yaw is a
 * right-handed rotation about +Y, which swings the view anti-clockwise when seen from above — so
 * compass degrees, which run clockwise, are the negation.
 */
export function yawToHeading(yaw: number): { degrees: number; point: string } {
  let degrees = (-yaw * RAD_TO_DEG) % 360;
  if (degrees < 0) degrees += 360;
  const point = COMPASS_POINTS[Math.round(degrees / 45) % 8];
  return { degrees, point };
}

export class HUDOverlay {
  private fpsEl: HTMLElement | null = null;
  private p95El: HTMLElement | null = null;
  private ticksEl: HTMLElement | null = null;
  private entitiesEl: HTMLElement | null = null;
  private backendEl: HTMLElement | null = null;
  private tierEl: HTMLElement | null = null;
  private resEl: HTMLElement | null = null;
  private posEl: HTMLElement | null = null;
  private facingEl: HTMLElement | null = null;
  private fovEl: HTMLElement | null = null;
  private lockPromptEl: HTMLElement | null = null;
  private reticleEl: HTMLElement | null = null;

  /**
   * The HUD is written every frame but changes far less often. Caching the last rendered string
   * per field keeps us from handing the browser 600 pointless style recalculations a second.
   */
  private readonly lastText = new Map<HTMLElement, string>();
  private lastLockState: boolean | null = null;

  constructor() {
    if (typeof document === 'undefined') return;
    this.fpsEl = document.getElementById('metric-fps');
    this.p95El = document.getElementById('metric-p95');
    this.ticksEl = document.getElementById('metric-ticks');
    this.entitiesEl = document.getElementById('metric-entities');
    this.backendEl = document.getElementById('metric-backend');
    this.tierEl = document.getElementById('metric-tier');
    this.resEl = document.getElementById('metric-res');
    this.posEl = document.getElementById('metric-pos');
    this.facingEl = document.getElementById('metric-facing');
    this.fovEl = document.getElementById('metric-fov');
    this.lockPromptEl = document.getElementById('lock-prompt');
    this.reticleEl = document.getElementById('reticle');
  }

  private setText(element: HTMLElement | null, text: string): void {
    if (!element) return;
    if (this.lastText.get(element) === text) return;
    this.lastText.set(element, text);
    element.textContent = text;
  }

  public update(data: TelemetryData): void {
    this.setText(this.fpsEl, data.fps.toString());
    this.setText(this.p95El, `${data.p95FrameTime.toFixed(1)} ms`);
    this.setText(this.ticksEl, data.simTicks.toString());
    this.setText(this.entitiesEl, data.activeEntities.toString());

    if (this.backendEl) {
      this.setText(this.backendEl, data.backendName);
      const nextClass = data.backendName.includes('WebGPU')
        ? 'badge badge-webgpu'
        : 'badge badge-webgl';
      if (this.backendEl.className !== nextClass) this.backendEl.className = nextClass;
    }

    this.setText(this.tierEl, data.capabilities.tier.toUpperCase());

    if (this.resEl && typeof window !== 'undefined') {
      this.setText(this.resEl, `${window.innerWidth}x${window.innerHeight}`);
    }

    this.setText(
      this.posEl,
      `X: ${data.posX.toFixed(1)} Y: ${data.posY.toFixed(1)} Z: ${data.posZ.toFixed(1)}`
    );

    const heading = yawToHeading(data.yaw);
    this.setText(
      this.facingEl,
      `${heading.point} ${heading.degrees.toFixed(0)}° / ${(data.pitch * RAD_TO_DEG).toFixed(0)}°`
    );
    this.setText(this.fovEl, `${data.fov.toFixed(0)}°`);

    this.updateLookState(data.lookCaptured);
  }

  /**
   * The capture prompt is the only thing standing between the player and a game that appears not
   * to respond to the mouse, so it is driven by real pointer-lock state rather than assumed.
   */
  private updateLookState(captured: boolean): void {
    if (captured === this.lastLockState) return;
    this.lastLockState = captured;

    if (this.lockPromptEl) {
      this.lockPromptEl.classList.toggle('is-hidden', captured);
    }
    if (this.reticleEl) {
      this.reticleEl.classList.toggle('is-active', captured);
    }
  }
}
