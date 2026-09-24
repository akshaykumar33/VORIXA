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
import { seedFromString } from './world/Rng';

/** The shared endless world. Fixed so two players on `?endless` are racing the same course. */
const DEFAULT_ENDLESS_SEED = seedFromString('vorixa-endless-01');
import { createPointerLockController } from './input/PointerLockController';
import { RushRenderer } from './rendering/rush/RushRenderer';
import { RushGame } from './game/RushGame';
import { PlatformRenderer } from './rendering/platformer/PlatformRenderer';
import { OnFootGame } from './game/OnFootGame';
import { CityRenderer } from './rendering/city/CityRenderer';
import { CityGame } from './game/CityGame';

/**
 * Rush (ADR-0011) is the default game; On Foot (ADR-0012) is `?mode=onfoot`. The original parkour time-attack is kept, reachable with
 * `?mode=parkour`, until a later decision retires it.
 */
function bootstrap(): void {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  if (mode === 'parkour') bootstrapParkour();
  else if (mode === 'onfoot') bootstrapOnFoot();
  else if (mode === 'city') bootstrapCity();
  else bootstrapRush(params);
}

function bootstrapRush(params: URLSearchParams): void {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement | null;
  const viewport = document.getElementById('viewport');
  if (!canvas || !viewport) throw new Error('Could not locate #render-canvas and #viewport.');

  // `?seed=word` replays a specific road; without it every run is new.
  const seedParam = params.get('seed');
  const seed = seedParam
    ? /^\d+$/.test(seedParam)
      ? Number(seedParam) >>> 0
      : seedFromString(seedParam)
    : (Math.random() * 0xffffffff) >>> 0;

  const renderer = new RushRenderer();
  renderer.initialize(canvas);
  const applySize = () => {
    renderer.resize(Math.max(1, canvas.clientWidth || window.innerWidth), Math.max(1, canvas.clientHeight || window.innerHeight));
  };
  new ResizeObserver(applySize).observe(canvas);
  applySize();

  const game = new RushGame(renderer, viewport, seed, seedParam !== null);
  game.start();

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__rush = { game, renderer };
  }
}

/** VORIXA City (ADR-0014): the open-city flagship, in development. */
function bootstrapCity(): void {
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

/** On Foot (ADR-0012): the driver's side-scrolling adventure, entered from the Rush title. */
function bootstrapOnFoot(): void {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement | null;
  const viewport = document.getElementById('viewport');
  if (!canvas || !viewport) throw new Error('Could not locate #render-canvas and #viewport.');
  const renderer = new PlatformRenderer();
  renderer.initialize(canvas);
  const applySize = () => {
    renderer.resize(Math.max(1, canvas.clientWidth || window.innerWidth), Math.max(1, canvas.clientHeight || window.innerHeight));
  };
  new ResizeObserver(applySize).observe(canvas);
  applySize();
  const game = new OnFootGame(renderer, viewport);
  game.start();
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__onfoot = { game, renderer };
  }
}

function bootstrapParkour(): void {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('Could not locate render canvas #render-canvas.');

  /*
   * Endless mode is opt-in through the URL, so the authored course stays the default experience.
   *
   *   ?endless               a fixed default seed — same world for everyone, which is what makes
   *                          times comparable without a leaderboard backend
   *   ?endless=cobalt-drift  a named seed, shareable as text rather than as a number
   *
   * Reading it here rather than inside Game keeps the engine free of anything that knows what a
   * URL is; Game is handed a number.
   */
  const params = new URLSearchParams(window.location.search);
  const endlessParam = params.get('endless');
  const endlessSeed =
    endlessParam === null
      ? undefined
      : endlessParam === ''
        ? DEFAULT_ENDLESS_SEED
        : seedFromString(endlessParam);

  const renderer = new GameRenderer();
  // Set before initialize: the crowd is built during it, and placing spectators from the world
  // seed keeps the roadside consistent with the course they are watching.
  renderer.crowdSeed = endlessSeed ?? DEFAULT_ENDLESS_SEED;
  // Endless runs stream their geometry in, so there is no course to build up front.
  renderer.initialize(canvas, endlessSeed === undefined ? buildCourse() : null);

  const game = new Game(renderer, undefined, undefined, undefined, { endlessSeed });

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
    (window as unknown as Record<string, unknown>).__vorixa = { game, renderer, endlessSeed };
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
