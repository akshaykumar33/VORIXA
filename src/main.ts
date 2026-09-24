// Self-hosted variable fonts, bundled rather than fetched from a font CDN: nothing this game needs
// to render should depend on a third party being reachable, and nothing should phone out on load.
// The stylesheets declare every subset behind `unicode-range`, so a player downloads only latin.
import '@fontsource-variable/space-grotesk';

import { CityRenderer } from './rendering/city/CityRenderer';
import { CityGame } from './game/CityGame';

/**
 * VORIXA City: HEAT (ADR-0014): the open city, its outposts and the wild country beyond it.
 * `?lowfx` runs the low-effects preset (no post chain, no shadows, half resolution) for weak GPUs.
 */
function bootstrap(): void {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement | null;
  const viewport = document.getElementById('viewport');
  if (!canvas || !viewport) throw new Error('Could not locate #render-canvas and #viewport.');
  const renderer = new CityRenderer();
  renderer.initialize(canvas, new URLSearchParams(window.location.search).has('lowfx'));
  const applySize = () => {
    renderer.resize(Math.max(1, canvas.clientWidth || window.innerWidth), Math.max(1, canvas.clientHeight || window.innerHeight));
  };
  new ResizeObserver(applySize).observe(canvas);
  applySize();
  const game = new CityGame(renderer, canvas, viewport);
  game.start();
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__city = { game, renderer };
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
