import { GameRenderer } from './rendering/GameRenderer';
import { Game } from './game/Game';
import { buildCourse } from './game/Course';
import { createPointerLockController } from './input/PointerLockController';

function bootstrap(): void {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('Could not locate render canvas #render-canvas.');

  const course = buildCourse();
  const renderer = new GameRenderer();
  renderer.initialize(canvas, course);

  const game = new Game(renderer);

  const overlayCanvas = document.getElementById('overlay-canvas') as HTMLCanvasElement | null;
  if (overlayCanvas) game.attachOverlay(overlayCanvas);

  const handleResize = () => {
    renderer.resize(window.innerWidth, window.innerHeight);
    game.resizeOverlay(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', handleResize);
  handleResize();

  // Mouse capture. The same click also unlocks audio, because browsers require a user gesture
  // for both and asking the player for two separate gestures to start a game is one too many.
  const pointerLock = createPointerLockController(canvas);
  pointerLock?.onChange((locked) => {
    game.lookCaptured = locked;
  });
  canvas.addEventListener('click', () => void game.unlockAudio());

  game.start();

  // Dev-only handle. Movement tuning is done by feel, which means doing it live — being able to
  // teleport, re-read state and nudge constants from the console is worth far more than another
  // round of rebuilds. Stripped from production builds by the bundler.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__vorixa = { game, renderer, course };
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    try {
      bootstrap();
    } catch (err) {
      console.error('[VORIXA] Fatal bootstrap exception:', err);
    }
  });
}
