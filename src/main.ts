// Self-hosted variable fonts, bundled rather than fetched from a font CDN — same reasoning as the
// locally served vision models: nothing this game needs to render should depend on a third party
// being reachable, and nothing should phone out on load.
// These stylesheets declare every subset (latin, latin-ext, Cyrillic, Greek, Vietnamese) behind
// `unicode-range`, so a player only ever downloads latin — about 63 kB for both families, inside
// the 100 kB budget. The unused subsets do sit in `dist` unserved; splitting them out would mean
// hardcoding paths into node_modules, which is more fragile than the bytes are worth.
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';

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

  /**
   * Size the render target from the canvas's own box, not from the window.
   *
   * `window.resize` misses layout changes that alter the canvas without changing the window —
   * a browser infobar appearing or collapsing is the common one, and it leaves the drawing buffer
   * a stretched approximation of the element it is drawn into. That shows up as a soft image with
   * a band of dead space along one edge, which reads as a broken renderer rather than a
   * missed event.
   *
   * ResizeObserver fires for any change to the observed box, whatever caused it.
   */
  const applySize = (cssWidth: number, cssHeight: number) => {
    // Guard against zero: a hidden or not-yet-laid-out element produces a 0x0 box, and handing
    // that to the renderer divides by zero in the projection matrix.
    const width = Math.max(1, Math.round(cssWidth));
    const height = Math.max(1, Math.round(cssHeight));
    renderer.resize(width, height);
    game.resizeOverlay(width, height);
  };

  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    // contentBoxSize is the precise, fractional box; getBoundingClientRect is the fallback for
    // browsers that report the older shape.
    const box = entry.contentBoxSize?.[0];
    if (box) applySize(box.inlineSize, box.blockSize);
    else applySize(entry.contentRect.width, entry.contentRect.height);
  });
  observer.observe(canvas);

  // ResizeObserver delivers its first callback asynchronously, so size once up front rather than
  // rendering a frame or two at the wrong dimensions.
  applySize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);

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
