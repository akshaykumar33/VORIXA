import { DeviceCapabilities } from './core/DeviceCapabilities';
import { WebGPURenderer } from './rendering/WebGPURenderer';
import { WebGL2Renderer } from './rendering/WebGL2Renderer';
import { Renderer } from './rendering/Renderer';
import { Engine } from './core/Engine';
import { createPointerLockController } from './input/PointerLockController';

/**
 * Backing-store scale is capped at 2. Beyond that the extra pixels are invisible on the devices
 * that report them and cost fill rate we would rather spend on frame time.
 */
const MAX_RENDER_SCALE = 2;

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Could not locate render canvas #render-canvas.');
  }

  // 1. Probe capabilities
  const capabilities = await DeviceCapabilities.probe();
  console.info('[VORIXA] Device Capabilities Probed:', capabilities);

  // 2. Select and initialize appropriate renderer
  let renderer: Renderer;
  if (capabilities.hasWebGPU) {
    try {
      const gpuRenderer = new WebGPURenderer();
      await gpuRenderer.initialize(canvas);
      renderer = gpuRenderer;
      console.info('[VORIXA] Successfully initialized WebGPU Primary Renderer.');
    } catch (e) {
      console.warn('[VORIXA] WebGPU initialization failed, falling back to WebGL2:', e);
      const glRenderer = new WebGL2Renderer();
      await glRenderer.initialize(canvas);
      renderer = glRenderer;
    }
  } else {
    console.info('[VORIXA] WebGPU not available, selecting WebGL2 Fallback Renderer.');
    const glRenderer = new WebGL2Renderer();
    await glRenderer.initialize(canvas);
    renderer = glRenderer;
  }

  // 3. Instantiate the engine before sizing, so the camera exists to receive the aspect ratio.
  const engine = new Engine(renderer, capabilities);

  // 4. Handle responsive resizing
  const scale = Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE);
  const handleResize = () => {
    const cssWidth = window.innerWidth;
    const cssHeight = window.innerHeight;
    renderer.resize(Math.round(cssWidth * scale), Math.round(cssHeight * scale));
    // Aspect comes from the CSS box, which is what the player actually sees; the backing store is
    // the same shape, so a stretched view here would be a bug in one of the two.
    engine.camera.setAspect(cssWidth, cssHeight);
  };
  window.addEventListener('resize', handleResize);
  handleResize();

  // 5. Mouse capture for first-person look. The HUD mirrors the real lock state, so a refused or
  // Escape-released lock is always visible to the player.
  const pointerLock = createPointerLockController(canvas);
  if (pointerLock) {
    pointerLock.onChange((locked) => {
      engine.lookCaptured = locked;
    });
  }

  engine.start();

  // 6. User gesture for spatial audio activation
  const audioPrompt = document.getElementById('audio-prompt');
  const unlockAudio = async () => {
    const success = await engine.audio.unlock();
    if (success && audioPrompt) {
      audioPrompt.style.opacity = '0';
      setTimeout(() => audioPrompt.remove(), 400);
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    }
  };
  window.addEventListener('click', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  console.info('[VORIXA] Engine shell active.');
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    bootstrap().catch((err) => {
      console.error('[VORIXA] Fatal engine bootstrap exception:', err);
    });
  });
}
