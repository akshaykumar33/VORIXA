import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * The shared glTF loader.
 *
 * Every model in `public/characters` is Draco-compressed and carries WebP textures, which took the
 * set from 58 MB to 3.8 MB — the Khronos source models are renderer *reference* assets with 4K PBR
 * textures, and shipping them raw would have been indefensible for a web game. `AntiqueCamera`
 * alone went from 17 MB to 216 kB.
 *
 * That compression is why this module exists: a Draco-compressed file is unreadable without the
 * decoder, so every loader in the project must be built here rather than constructed ad hoc. A
 * `new GLTFLoader()` somewhere else silently fails on every asset we ship.
 *
 * The decoder is served from `public/draco`, not a CDN — the same stance already taken for fonts
 * and the vision models. Nothing the game needs to render should depend on a third party being
 * reachable.
 *
 * One decoder instance is shared across loaders. It spins up a worker pool, and building several
 * would mean several pools decoding the same format.
 */

let draco: DRACOLoader | null = null;

function dracoLoader(): DRACOLoader {
  if (!draco) {
    draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    // No decoder config: left alone, the loader picks the 188 kB WASM build and falls back to the
    // 501 kB JS decoder only where WebAssembly is missing. An earlier version set `type: 'js'`
    // here, which forced the larger, slower decoder on every browser.
    draco.preload();
  }
  return draco;
}

export function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader());
  return loader;
}

/** Releases the decoder's worker pool. */
export function disposeGltfLoaders(): void {
  draco?.dispose();
  draco = null;
}
