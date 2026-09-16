import { DeviceCapabilities } from './core/DeviceCapabilities';
import { WebGPURenderer } from './rendering/WebGPURenderer';
import { WebGL2Renderer } from './rendering/WebGL2Renderer';
import { Renderer } from './rendering/Renderer';
import { Engine } from './core/Engine';

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

  // 3. Handle responsive resizing
  const handleResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    renderer.resize(width, height);
  };
  window.addEventListener('resize', handleResize);
  handleResize();

  // 4. Instantiate and start Engine
  const engine = new Engine(renderer, capabilities);
  engine.start();

  // 5. User gesture for spatial audio activation
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
