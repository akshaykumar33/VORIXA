import * as THREE from 'three';

/**
 * Soft round particles for Akhada (ADR-0016): smoke and dust (normal blending) or sparks, embers
 * and fireflies (additive). One draw call per system; each particle has its own size, colour,
 * alpha and life. CPU-updated: a few hundred at most, which costs nothing.
 */

export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** World size at birth and at death. */
  size: number;
  grow?: number;
  life: number;
  color: THREE.ColorRepresentation;
  alpha?: number;
  /** Fraction of velocity kept per second (1 keeps it all). */
  drag?: number;
  /** Upward acceleration (smoke rises, sparks fall). */
  lift?: number;
}

interface Live extends Required<Omit<ParticleSpec, 'color'>> {
  age: number;
  r: number;
  g: number;
  b: number;
}

function softDisc(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Particles {
  public readonly points: THREE.Points;
  private readonly live: Live[] = [];
  private readonly geometry = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly tmp = new THREE.Color();

  public constructor(private readonly max: number, additive: boolean) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDisc() }, scale: { value: 600 } },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        uniform float scale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * vAlpha);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
  }

  /** Point size scales with the view's height in pixels. */
  public setViewHeight(px: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = px * 0.9;
  }

  public emit(p: ParticleSpec): void {
    if (this.live.length >= this.max) this.live.shift();
    this.tmp.set(p.color);
    this.live.push({
      x: p.x, y: p.y, z: p.z, vx: p.vx ?? 0, vy: p.vy ?? 0, vz: p.vz ?? 0, size: p.size, grow: p.grow ?? p.size,
      life: p.life, alpha: p.alpha ?? 1, drag: p.drag ?? 1, lift: p.lift ?? 0, age: 0, r: this.tmp.r, g: this.tmp.g, b: this.tmp.b
    });
  }

  public update(dt: number): void {
    let n = 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.live.splice(i, 1);
        continue;
      }
      const keep = Math.pow(p.drag, dt);
      p.vx *= keep;
      p.vy = p.vy * keep + p.lift * dt;
      p.vz *= keep;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    for (const p of this.live) {
      const k = p.age / p.life;
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.col[n * 3] = p.r;
      this.col[n * 3 + 1] = p.g;
      this.col[n * 3 + 2] = p.b;
      this.size[n] = p.size + (p.grow - p.size) * k;
      // Fade in fast, out slowly.
      this.alpha[n] = p.alpha * Math.min(1, k * 8) * (1 - k);
      n++;
    }
    this.geometry.setDrawRange(0, n);
    for (const name of ['position', 'color', 'size', 'alpha']) (this.geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }
}
