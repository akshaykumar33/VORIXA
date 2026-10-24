import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Particles } from './Particles';
import { STAGES, type ArenaKit, type Preset, type StageId, type Weather } from './Stages';

export { WEATHER_BY_ROUND, type Weather } from './Stages';

/**
 * Akhada's arena (ADR-0016, ADR-0017): the sky, light, weather and life of whichever place the
 * fight is in. The places themselves (Varanasi, Kurukshetra, Rameswaram, Jaisalmer) are built by
 * their stage definitions in Stages.ts from the parts this class offers (`ArenaKit`).
 *
 * Each place has three rounds of weather: its first look, a dramatic one (a monsoon storm, a dust
 * storm, the smoke of war) and night. Smoke rises from its incense, pyres and camps in all of them.
 */


function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Soft ripples for the river, scrolled over time. */
function rippleNormals(): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    const img = g.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const a = Math.sin((x / s) * Math.PI * 10 + Math.sin((y / s) * Math.PI * 4) * 2);
        const b = Math.sin((y / s) * Math.PI * 14 + Math.cos((x / s) * Math.PI * 6) * 1.5);
        const i = (y * s + x) * 4;
        img.data[i] = 128 + a * 34;
        img.data[i + 1] = 128 + b * 34;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, false);
}

/** A flame: a hot core and a soft orange glow. */
function flameTexture(): THREE.CanvasTexture {
  return canvasTexture(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s * 0.62, 1, s / 2, s * 0.55, s / 2);
    grad.addColorStop(0, 'rgba(255,250,220,1)');
    grad.addColorStop(0.25, 'rgba(255,190,80,0.9)');
    grad.addColorStop(0.6, 'rgba(255,110,20,0.35)');
    grad.addColorStop(1, 'rgba(255,80,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
}

export class Arena implements ArenaKit {
  public readonly group = new THREE.Group();
  public readonly smoke = new Particles(500, false);
  public readonly glow = new Particles(700, true);
  public readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  public readonly hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.4);
  public weather: Weather = 'dusk';
  public stageId: StageId = 'varanasi';
  public models!: ArenaKit['models'];
  /** Everything belonging to the current place, cleared when the place changes. */
  private readonly stage = new THREE.Group();
  private waterY: number | null = null;
  /** Called with a 0..1 loudness when lightning strikes (for thunder). */
  public onLightning: (loudness: number) => void = () => {};

  private readonly loader = new GLTFLoader();
  private readonly textures = new THREE.TextureLoader();
  private readonly hdr = new HDRLoader();
  private pmrem: THREE.PMREMGenerator | null = null;
  private readonly skies = new Map<string, { env: THREE.Texture; backdrop: THREE.Texture }>();
  private readonly stone: THREE.MeshStandardMaterial[] = [];
  private readonly waterMaterial: THREE.MeshStandardMaterial;
  private readonly flames: { sprite: THREE.Sprite; base: number; phase: number }[] = [];
  private readonly lamps: THREE.PointLight[] = [];
  private readonly flags: THREE.Mesh[] = [];
  private readonly boats: { mesh: THREE.Object3D; phase: number; y: number }[] = [];
  private readonly incense: THREE.Vector3[] = [];
  private readonly wind = { value: 0 };
  private rain: THREE.LineSegments | null = null;
  private rainPos: Float32Array | null = null;
  private bolt: THREE.Line | null = null;
  private flash = 0;
  private nextBolt = 4;
  private time = 0;
  private emitT = 0;

  public constructor(private readonly scene: THREE.Scene) {
    this.waterMaterial = new THREE.MeshStandardMaterial({
      // Dark, glassy river water: what you see on it is the sky, not the water's own colour.
      color: 0x08181c, roughness: 0.03, metalness: 0.6, normalMap: rippleNormals(), normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.6
    });
    this.waterMaterial.normalMap!.repeat.set(90, 60);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 10;
    sc.bottom = -6;
    sc.near = 1;
    sc.far = 60;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.group.add(this.sun, this.sun.target, this.hemi, this.smoke.points, this.glow.points, this.stage);
    scene.add(this.group);
  }

  // ─── Building ───────────────────────────────────────────────────────────────────────────────

  public pbr(name: string, repeat: [number, number], tint = 0xffffff): THREE.MeshStandardMaterial {
    const load = (map: string, srgb: boolean) => {
      const t = this.textures.load(`/akhada/tex/${name}_${map}.webp`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(...repeat);
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const m = new THREE.MeshStandardMaterial({ map: load('diff', true), normalMap: load('nor', false), roughnessMap: load('rough', false), color: tint, roughness: 1 });
    this.stone.push(m);
    return m;
  }

  public async build(renderer: THREE.WebGLRenderer): Promise<void> {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    const [diya, pot1, pot2, clay] = await Promise.all(
      ['brass_diya_lantern', 'brass_pot_01', 'brass_pot_02', 'ceramic_pot'].map((m) => this.loader.loadAsync(`/akhada/models/${m}.glb`))
    );
    this.models = { diya, pot1, pot2, clay };
    await this.setStage('varanasi');
  }

  /** Builds a place (clearing the last one) and sets its first weather. */
  public async setStage(id: StageId): Promise<void> {
    this.stageId = id;
    this.stage.clear();
    this.stone.length = 0;
    this.flames.length = 0;
    this.lamps.length = 0;
    this.flags.length = 0;
    this.boats.length = 0;
    this.incense.length = 0;
    const def = STAGES[id];
    this.waterY = def.waterY;
    def.build(this);
    await this.setWeather('dusk');
  }

  public add(...objects: THREE.Object3D[]): void {
    this.stage.add(...objects);
  }

  public flame(x: number, y: number, z: number, size: number): void {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(size);
    this.flames.push({ sprite, base: size, phase: x * 3.1 + z });
    this.stage.add(sprite);
  }

  public lamp(x: number, y: number, z: number, colour = 0xffa040): void {
    const lamp = new THREE.PointLight(colour, 0, 9, 1.6);
    lamp.position.set(x, y, z);
    this.lamps.push(lamp);
    this.stage.add(lamp);
  }

  /** The river or the sea: dark glassy water with ripples, at height `y`. */
  public water(y: number, colour: number): void {
    this.waterMaterial.color.setHex(colour);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(400, 260).rotateX(-Math.PI / 2), this.waterMaterial);
    plane.position.set(0, y, -9 - 130);
    this.stage.add(plane);
  }

  public smokeSource(at: THREE.Vector3): void {
    this.incense.push(at.clone());
  }

  /** The current place's look for a round. */
  private preset(weather: Weather): Preset {
    return STAGES[this.stageId].weather[weather];
  }

  public place(gltf: GLTF, x: number, y: number, z: number, scale: number): void {
    const o = gltf.scene.clone(true);
    o.position.set(x, y, z);
    o.scale.setScalar(scale);
    o.rotation.y = x * 1.7;
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    this.stage.add(o);
  }

  public diya(gltf: GLTF, x: number, y: number, z: number): void {
    this.place(gltf, x, y, z, 1.4);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sprite.position.set(x, y + 0.2, z);
    sprite.scale.setScalar(0.22);
    this.flames.push({ sprite, base: 0.22, phase: x * 3.1 + z });
    this.stage.add(sprite);
  }

  /** A nagara spire: a plinth and shrine, a curved tower faceted in sandstone, rings, a brass kalash and a flag. */
  public temple(red: THREE.Material, plaster: THREE.Material, kalash: GLTF, x: number, z: number, scale: number, y = 0): void {
    const t = new THREE.Group();
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 5), red);
    plinth.position.y = 0.3;
    const shrine = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3, 3.6), plaster);
    shrine.position.y = 2.1;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.1), new THREE.MeshStandardMaterial({ color: 0x120a06, roughness: 1 }));
    door.position.set(0, 1.55, 1.81);
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const k = i / 16;
      profile.push(new THREE.Vector2(2.1 * Math.cos(k * Math.PI * 0.48) ** 1.3 + 0.12, k * 8));
    }
    const spire = new THREE.Mesh(new THREE.LatheGeometry(profile, 8), red);
    spire.position.y = 3.6;
    const rings: THREE.Mesh[] = [];
    for (let i = 1; i < 7; i++) {
      const k = i / 8;
      const r = 2.1 * Math.cos(k * Math.PI * 0.48) ** 1.3 + 0.18;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 8), red);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 3.6 + k * 8;
      rings.push(ring);
    }
    const amalaka = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 16), red);
    amalaka.position.y = 11.7;
    const top = kalash.scene.clone(true);
    top.scale.setScalar(2.2);
    top.position.y = 11.85;
    // The flag: saffron cloth on a staff, rippling in the wind.
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2a }));
    staff.position.set(0, 13.2, 0);
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.8, side: THREE.DoubleSide });
    this.windCloth(flagMat);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8, 16, 4).translate(0.8, 0, 0), flagMat);
    flag.position.set(0.03, 14.1, 0);
    this.flags.push(flag);
    t.add(plinth, shrine, door, spire, ...rings, amalaka, top, staff, flag);
    t.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    // On the steps a deep plinth carries it up to the landing's height.
    if (y < 0) {
      const footing = new THREE.Mesh(new THREE.BoxGeometry(5.4, -y + 0.1, 5.4), red);
      footing.position.y = y / 2;
      footing.receiveShadow = true;
      t.add(footing);
    }
    t.position.set(x, 0, z);
    t.scale.setScalar(scale);
    this.stage.add(t);
    this.incense.push(new THREE.Vector3(x - 1.5 * scale, 0.7 * scale, z + 2.2 * scale), new THREE.Vector3(x + 1.5 * scale, 0.7 * scale, z + 2.2 * scale));
  }

  /** Cloth that ripples more the further it is from its staff. */
  public windCloth(m: THREE.MeshStandardMaterial): void {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = this.wind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float reach = max(0.0, position.x) / 1.6;
          transformed.z += sin(uWind * 6.0 + position.x * 4.0) * 0.18 * reach;
          transformed.y += sin(uWind * 4.0 + position.x * 3.0) * 0.05 * reach;`
        );
    };
  }

  /** Marigold strings sagging between the umbrella poles: orange and yellow flowers. */
  public garlands(poles: THREE.Vector3[]): void {
    const flowers: THREE.Vector3[] = [];
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i];
      const b = poles[i + 1];
      for (let k = 0; k <= 1; k += 1 / 26) {
        const p = a.clone().lerp(b, k);
        p.y -= Math.sin(k * Math.PI) * 0.7;
        flowers.push(p);
      }
    }
    // One merged mesh of flowers, coloured per vertex: instanced meshes rendered black through the
    // post chain here (the occlusion prepass does not see instance transforms).
    const parts = flowers.map((p, i) => {
      const g = new THREE.IcosahedronGeometry(0.07, 1).translate(p.x, p.y, p.z);
      const c = new THREE.Color(i % 3 === 0 ? 0xffc21a : 0xff7a10);
      const colours = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < colours.length; k += 3) colours.set([c.r, c.g, c.b], k);
      g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      return g;
    });
    const merged = mergeGeometries(parts, false)!;
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, emissive: 0xff6a00, emissiveIntensity: 0.15 }));
    mesh.castShadow = true;
    this.stage.add(mesh);
  }

  /** A wooden river boat: a hull tapered and raised at both ends, a lantern in the bow. */
  public boat(x: number, z: number, rot: number): void {
    const g = new THREE.BoxGeometry(5, 0.7, 1.5, 12, 1, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / 2.5;
      p.setZ(i, p.getZ(i) * (1 - u * u * 0.85));
      p.setY(i, p.getY(i) + u * u * 0.45);
    }
    g.computeVertexNormals();
    const hull = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.85 }));
    hull.castShadow = true;
    const boat = new THREE.Group();
    boat.add(hull);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sprite.position.set(2.1, 0.9, 0);
    sprite.scale.setScalar(0.5);
    this.flames.push({ sprite, base: 0.5, phase: x });
    boat.add(sprite);
    const y = (this.waterY ?? 0) + 0.15;
    boat.position.set(x, y, z);
    boat.rotation.y = rot;
    this.boats.push({ mesh: boat, phase: x * 0.7, y });
    this.stage.add(boat);
  }

  // ─── Weather ────────────────────────────────────────────────────────────────────────────────

  private async loadSky(base: string): Promise<void> {
    if (this.skies.has(base) || !this.pmrem) return;
    const [hdr, backdrop] = await Promise.all([this.hdr.loadAsync(`${base}.hdr`), this.textures.loadAsync(`${base}.jpg`)]);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const env = this.pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    backdrop.mapping = THREE.EquirectangularReflectionMapping;
    backdrop.colorSpace = THREE.SRGBColorSpace;
    this.skies.set(base, { env, backdrop });
  }

  /** Switches the sky, light, fog, wetness and rain to a round's weather. */
  public async setWeather(weather: Weather): Promise<void> {
    this.weather = weather;
    const stage = this.stageId;
    const p = this.preset(weather);
    await this.loadSky(p.sky);
    if (this.weather !== weather || this.stageId !== stage) return;
    const sky = this.skies.get(p.sky)!;
    this.scene.background = sky.backdrop;
    this.scene.environment = sky.env;
    this.scene.backgroundIntensity = p.background;
    this.scene.environmentIntensity = p.env;
    this.scene.fog = new THREE.FogExp2(p.fog, p.fogDensity);
    this.sun.color.setHex(p.sun);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.hemi;
    // Wet stone is darker and shines.
    for (const m of this.stone) {
      m.roughness = 1 - p.wet * 0.55;
      m.color.setScalar(1 - p.wet * 0.3);
      m.envMapIntensity = 1 + p.wet * 0.8;
    }
    this.setRain(p.rain);
  }

  private setRain(on: boolean): void {
    if (!on) {
      if (this.rain) this.rain.visible = false;
      return;
    }
    if (!this.rain) {
      const n = 2600;
      this.rainPos = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) this.resetDrop(i, Math.random() * 14);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8cc, transparent: true, opacity: 0.38, depthWrite: false }));
      this.rain.frustumCulled = false;
      this.group.add(this.rain);
    }
    this.rain.visible = true;
  }

  private resetDrop(i: number, y = 14, around = 0): void {
    const p = this.rainPos!;
    const x = around + (Math.random() - 0.5) * 30;
    const z = -6 + Math.random() * 12;
    p[i * 6] = x;
    p[i * 6 + 1] = y;
    p[i * 6 + 2] = z;
    p[i * 6 + 3] = x + 0.04;
    p[i * 6 + 4] = y + 0.45;
    p[i * 6 + 5] = z;
  }

  // ─── Each frame ─────────────────────────────────────────────────────────────────────────────

  public update(dt: number, focusX: number): void {
    this.time += dt;
    this.wind.value = this.time;
    const p = this.preset(this.weather);
    // The sun follows the fight so its shadow map covers it.
    this.sun.position.set(focusX + p.sunDir.x * 30, p.sunDir.y * 30, p.sunDir.z * 30);
    this.sun.target.position.set(focusX, 0, 0);
    this.waterMaterial.normalMap!.offset.set(this.time * 0.01, this.time * 0.02);

    // Diyas flicker; the lamps carry it.
    for (const f of this.flames) {
      const flick = 0.85 + Math.sin(this.time * 13 + f.phase) * 0.08 + Math.sin(this.time * 29 + f.phase * 2) * 0.05;
      f.sprite.scale.set(f.base * flick, f.base * flick * 1.4, 1);
    }
    this.lamps.forEach((l, i) => (l.intensity = p.diya * (2.2 + Math.sin(this.time * 11 + i * 2.3) * 0.35)));
    for (const b of this.boats) {
      b.mesh.position.y = b.y + Math.sin(this.time * 1.1 + b.phase) * 0.06;
      b.mesh.rotation.z = Math.sin(this.time * 0.9 + b.phase) * 0.03;
    }

    // Incense smoke rises from the temples; fireflies at night.
    this.emitT += dt;
    while (this.emitT > 0.08) {
      this.emitT -= 0.08;
      const src = this.incense[Math.floor(Math.random() * this.incense.length)];
      if (src) {
        this.smoke.emit({
          x: src.x + (Math.random() - 0.5) * 0.1, y: src.y, z: src.z, vx: 0.15 + Math.random() * 0.1, vy: 0.5, vz: 0.05,
          size: 0.25, grow: 1.6, life: 4, color: this.weather === 'night' ? 0x8a8aa0 : 0xd8d0c8, alpha: 0.18, lift: 0.05, drag: 0.85
        });
      }
      if (this.weather === 'night' && Math.random() < 0.5) {
        this.glow.emit({
          x: focusX + (Math.random() - 0.5) * 16, y: 0.5 + Math.random() * 2.5, z: -3 + Math.random() * 3,
          vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.2, size: 0.07, life: 3, color: 0xd8ff6a, alpha: 0.9
        });
      }
      // Mist off the water in the day and the storm.
      if (this.waterY !== null && this.weather !== 'night' && Math.random() < 0.3) {
        this.smoke.emit({
          x: focusX + (Math.random() - 0.5) * 30, y: this.waterY + 0.4, z: -10 - Math.random() * 20, vx: 0.2, size: 4, grow: 8, life: 9,
          color: p.fog, alpha: 0.18
        });
      }
    }

    // A dust storm: sand driven across the arena on the wind.
    if (p.dust) {
      for (let i = 0; i < 6; i++) {
        this.smoke.emit({
          x: focusX + 16 + Math.random() * 4, y: Math.random() * 6, z: -8 + Math.random() * 12, vx: -9 - Math.random() * 5, vy: (Math.random() - 0.5) * 0.6,
          size: 1.2, grow: 3, life: 3.2, color: Math.random() < 0.5 ? 0xc89a60 : 0xa87a48, alpha: 0.28, drag: 0.95
        });
      }
      if (Math.random() < 0.6) this.glow.emit({ x: focusX + 15, y: Math.random() * 3, z: -2 + Math.random() * 4, vx: -14, size: 0.03, life: 2.2, color: 0xffd8a0, alpha: 0.6 });
    }

    if (this.rain?.visible && this.rainPos) {
      const pos = this.rainPos;
      for (let i = 0; i < pos.length / 6; i++) {
        const fall = 17 * dt;
        pos[i * 6 + 1] -= fall;
        pos[i * 6 + 4] -= fall;
        pos[i * 6] -= 2 * dt;
        pos[i * 6 + 3] -= 2 * dt;
        const ground = pos[i * 6 + 2] < -3 && this.waterY !== null ? this.waterY : 0;
        if (pos[i * 6 + 1] < ground) {
          // A splash where it lands, now and then.
          if (Math.random() < 0.08) this.glow.emit({ x: pos[i * 6], y: ground + 0.02, z: pos[i * 6 + 2], vy: 0.6, size: 0.06, life: 0.18, color: 0x9fb2c8, alpha: 0.5, lift: -6 });
          this.resetDrop(i, 14, focusX);
        }
        // Keep the rain around the fight as the camera moves.
        if (pos[i * 6] < focusX - 15) {
          pos[i * 6] += 30;
          pos[i * 6 + 3] += 30;
        } else if (pos[i * 6] > focusX + 15) {
          pos[i * 6] -= 30;
          pos[i * 6 + 3] -= 30;
        }
      }
      (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      this.lightning(dt, focusX);
    } else if (this.bolt) this.bolt.visible = false;

    this.smoke.update(dt);
    this.glow.update(dt);
  }

  /** Lightning over the river: a jagged bolt, the world lit white, then thunder. */
  private lightning(dt: number, focusX: number): void {
    this.nextBolt -= dt;
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (this.nextBolt <= 0) {
      this.nextBolt = 5 + Math.random() * 9;
      this.flash = 1;
      const pts: THREE.Vector3[] = [];
      let x = focusX + (Math.random() - 0.5) * 50;
      for (let y = 60; y > (this.waterY ?? 0); y -= 4 + Math.random() * 4) {
        pts.push(new THREE.Vector3(x, y, -90));
        x += (Math.random() - 0.5) * 6;
      }
      if (this.bolt) {
        this.bolt.geometry.dispose();
        this.bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      } else {
        this.bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xe8f0ff, transparent: true }));
        this.group.add(this.bolt);
      }
      const distance = Math.random();
      setTimeout(() => this.onLightning(1 - distance * 0.6), 300 + distance * 1500);
    }
    if (this.bolt) {
      this.bolt.visible = this.flash > 0.4 && Math.floor(this.flash * 20) % 3 !== 0;
      (this.bolt.material as THREE.LineBasicMaterial).opacity = this.flash;
    }
    this.hemi.intensity = this.preset('storm').hemi + this.flash * 2.2;
  }
}
