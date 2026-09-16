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
  }

  public update(data: TelemetryData): void {
    if (this.fpsEl) this.fpsEl.textContent = data.fps.toString();
    if (this.p95El) this.p95El.textContent = `${data.p95FrameTime.toFixed(1)} ms`;
    if (this.ticksEl) this.ticksEl.textContent = data.simTicks.toString();
    if (this.entitiesEl) this.entitiesEl.textContent = data.activeEntities.toString();

    if (this.backendEl) {
      this.backendEl.textContent = data.backendName;
      if (data.backendName.includes('WebGPU')) {
        this.backendEl.className = 'badge badge-webgpu';
      } else {
        this.backendEl.className = 'badge badge-webgl';
      }
    }

    if (this.tierEl) {
      this.tierEl.textContent = data.capabilities.tier.toUpperCase();
    }

    if (this.resEl && typeof window !== 'undefined') {
      this.resEl.textContent = `${window.innerWidth}x${window.innerHeight}`;
    }

    if (this.posEl) {
      this.posEl.textContent = `X: ${data.posX.toFixed(1)} Y: ${data.posY.toFixed(1)} Z: ${data.posZ.toFixed(1)}`;
    }
  }
}
