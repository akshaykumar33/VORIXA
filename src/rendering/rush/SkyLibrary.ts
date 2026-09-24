import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { BiomeId } from '../../rush/Zones';

/**
 * Each world's sky: an HDR photograph for lighting and reflections, and a JPEG of the same sky
 * for the backdrop (see `scripts/assets/fetch-skies.mjs`).
 *
 * Loaded on demand and cached, so a run only downloads the worlds it reaches — and the next
 * world is preloaded while you are still in the current one, so it never arrives unlit.
 */

export interface Sky {
  /** Prefiltered for image-based lighting (PMREM). */
  environment: THREE.Texture;
  /** The backdrop, as an equirectangular image. */
  backdrop: THREE.Texture;
}

export class SkyLibrary {
  private readonly ready = new Map<BiomeId, Sky>();
  private readonly pending = new Map<BiomeId, Promise<Sky | null>>();
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly hdr = new HDRLoader();
  private readonly images = new THREE.TextureLoader();

  public constructor(renderer: THREE.WebGLRenderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }

  /** The sky if it has arrived; otherwise starts loading it and returns null. */
  public get(biome: BiomeId): Sky | null {
    const sky = this.ready.get(biome);
    if (sky) return sky;
    void this.load(biome);
    return null;
  }

  public load(biome: BiomeId): Promise<Sky | null> {
    const existing = this.pending.get(biome);
    if (existing) return existing;
    const job = (async () => {
      try {
        const [hdr, backdrop] = await Promise.all([
          this.hdr.loadAsync(`/sky/${biome}.hdr`),
          this.images.loadAsync(`/sky/${biome}.jpg`)
        ]);
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        const environment = this.pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();
        backdrop.colorSpace = THREE.SRGBColorSpace;
        backdrop.mapping = THREE.EquirectangularReflectionMapping;
        const sky = { environment, backdrop };
        this.ready.set(biome, sky);
        return sky;
      } catch (err) {
        // A missing sky must not break the game: the world just keeps the fallback lighting.
        console.warn(`[VORIXA] Sky for ${biome} failed to load:`, err);
        return null;
      }
    })();
    this.pending.set(biome, job);
    return job;
  }
}
