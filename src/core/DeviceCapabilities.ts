export type DeviceTier = 'tier-1' | 'tier-2' | 'tier-3';

export interface CapabilitiesReport {
  hasWebGPU: boolean;
  hasWebGL2: boolean;
  maxTextureDimension2D: number;
  hardwareConcurrency: number;
  devicePixelRatio: number;
  hasTouch: boolean;
  tier: DeviceTier;
}

export class DeviceCapabilities {
  public static async probe(): Promise<CapabilitiesReport> {
    let hasWebGPU = false;
    let maxTextureDimension2D = 2048;

    if (typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          hasWebGPU = true;
          maxTextureDimension2D = adapter.limits.maxTextureDimension2D || 8192;
        }
      } catch {
        hasWebGPU = false;
      }
    }

    let hasWebGL2 = false;
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (gl) {
          hasWebGL2 = true;
          if (!hasWebGPU) {
            maxTextureDimension2D = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
          }
        }
      } catch {
        hasWebGL2 = false;
      }
    }

    const hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const hasTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    let tier: DeviceTier = 'tier-3';
    if (hasWebGPU && hardwareConcurrency >= 8) {
      tier = 'tier-1';
    } else if (hasWebGPU || (hasWebGL2 && hardwareConcurrency >= 4)) {
      tier = 'tier-2';
    }

    return {
      hasWebGPU,
      hasWebGL2,
      maxTextureDimension2D,
      hardwareConcurrency,
      devicePixelRatio,
      hasTouch,
      tier
    };
  }
}
