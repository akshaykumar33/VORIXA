import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  SMAAEffect,
  HueSaturationEffect,
  BrightnessContrastEffect
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

/**
 * The finishing chain that makes a render look like a game rather than a viewer:
 *
 *   ambient occlusion → bloom → grade → filmic tone mapping → vignette → anti-aliasing
 *
 * - **Ambient occlusion** (N8AO) darkens creases and contact points: where a tyre meets the road,
 *   under a roof, between props. It is the single biggest step from "CG" to "grounded".
 * - **Bloom** only on genuinely bright things (a threshold near white), so emissive details glow
 *   without the whole scene going soft.
 * - **ACES filmic tone mapping** rolls highlights off like a camera instead of clipping them.
 * - A light **grade** and **vignette** focus the eye on the road.
 *
 * The renderer's own tone mapping is off; this chain owns it.
 */
export class PostFX {
  private readonly composer: EffectComposer;
  private readonly ao: N8AOPostPass;

  public constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    renderer.toneMapping = THREE.NoToneMapping;
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(scene, camera));

    this.ao = new N8AOPostPass(scene, camera, 1, 1);
    this.ao.configuration.aoRadius = 2.2;
    this.ao.configuration.distanceFalloff = 1.2;
    this.ao.configuration.intensity = 2.2;
    // Full resolution: the half-resolution path's red-only buffers bled a red tint into the image.
    this.ao.configuration.halfRes = false;
    this.ao.configuration.gammaCorrection = false;
    this.ao.setQualityMode('Medium');
    this.composer.addPass(this.ao);

    const bloom = new BloomEffect({ luminanceThreshold: 1.0, luminanceSmoothing: 0.25, intensity: 0.6, mipmapBlur: true, radius: 0.7 });
    const grade = new HueSaturationEffect({ saturation: 0.08 });
    const contrast = new BrightnessContrastEffect({ contrast: 0.08 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
    this.composer.addPass(new EffectPass(camera, bloom, grade, contrast, tone, vignette));
    this.composer.addPass(new EffectPass(camera, new SMAAEffect()));
  }

  public setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  /**
   * Ambient occlusion's reach and strength. The default suits streets and buildings; a scene of
   * small props against open sky wants a tighter radius, or thin things go black.
   */
  public setOcclusion(radius: number, intensity: number): void {
    this.ao.configuration.aoRadius = radius;
    this.ao.configuration.intensity = intensity;
  }

  /** Lower-cost settings for weaker GPUs: AO at lower quality. */
  public setLowQuality(low: boolean): void {
    this.ao.setQualityMode(low ? 'Performance' : 'Medium');
  }

  public render(delta: number): void {
    this.composer.render(delta);
  }
}
