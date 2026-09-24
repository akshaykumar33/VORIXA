import * as THREE from 'three';
import { EXPLOSIVES, type Blast, type Chaos, type Fire } from '../../city/Chaos';

/**
 * How VORIXA City's chaos looks (ADR-0014, Far Cry layer): the barrels and propane tanks, and what
 * they turn into. A blast is a fireball that swells and burns out, a flash that lights the street,
 * a ring of dust thrown out along the ground, sparks, a column of smoke, a scorch mark that stays,
 * and a shake of the camera. Fires are flames drawn by a shader (no textures), their own smoke,
 * and a flickering light.
 *
 * Lights come from a fixed pool that is always in the scene: adding and removing lights would make
 * every material recompile mid-fight.
 */

const NOISE = /* glsl */ `
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

/** A tongue of flame on a camera-facing card: a noisy teardrop, white-hot at the root. */
const FLAME_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uAlpha;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 uv = vUv;
    float t = uTime * 1.7 + uSeed * 13.0;
    float n = fbm(vec2(uv.x * 3.2 + uSeed, uv.y * 2.4 - t * 1.9));
    float width = mix(0.42, 0.03, pow(uv.y, 0.85));
    float d = abs(uv.x - 0.5 + (n - 0.5) * 0.3 * uv.y) / width;
    float body = 1.0 - smoothstep(0.45, 1.0, d + (n - 0.5) * 0.7 + uv.y * 0.3);
    body *= smoothstep(0.0, 0.1, uv.y);
    float heat = body * (1.0 - uv.y * 0.85);
    vec3 col = mix(vec3(0.85, 0.1, 0.02), vec3(1.0, 0.5, 0.06), smoothstep(0.08, 0.45, heat));
    col = mix(col, vec3(1.0, 0.9, 0.62), smoothstep(0.5, 0.85, heat));
    float a = clamp(body * uAlpha, 0.0, 1.0);
    gl_FragColor = vec4(col * 2.4 * a, a);
  }
`;

const CARD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** The fireball: a lumpy sphere, white at first, then orange, then a dull red as it cools. */
const FIREBALL_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  varying float vHeat;
  varying vec3 vN;
  void main() {
    vec3 p = position;
    float lump = sin(p.x * 5.1 + uTime * 3.0 + uSeed) * sin(p.y * 4.3 - uTime * 2.2) * sin(p.z * 5.7 + uTime * 2.6 + uSeed * 2.0);
    p += normal * lump * 0.18;
    vHeat = 0.5 + lump;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const FIREBALL_FRAGMENT = /* glsl */ `
  uniform float uAge;
  varying float vHeat;
  varying vec3 vN;
  void main() {
    float rim = pow(1.0 - abs(vN.z), 1.5);
    float heat = clamp(vHeat * (1.0 - uAge * 1.2) + 0.25 - rim * 0.4, 0.0, 1.0);
    vec3 col = mix(vec3(0.6, 0.06, 0.02), vec3(1.0, 0.45, 0.05), smoothstep(0.1, 0.5, heat));
    col = mix(col, vec3(1.0, 0.95, 0.75), smoothstep(0.6, 0.95, heat) * (1.0 - uAge));
    float a = clamp((1.0 - uAge) * (1.0 - rim * 0.6), 0.0, 1.0);
    gl_FragColor = vec4(col * 3.0 * a, a);
  }
`;

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Paint wear: flecks and streaks over a base colour. */
function wear(g: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(40,25,20,${0.08 + rnd() * 0.18})` : `rgba(255,240,220,${0.04 + rnd() * 0.08})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 5, 1 + rnd() * 2);
  }
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(70,40,20,${0.1 + rnd() * 0.15})`;
    g.fillRect(rnd() * w, rnd() * h * 0.6, 1 + rnd() * 2, 8 + rnd() * 30);
  }
}

function barrelTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 256, (g) => {
    g.fillStyle = '#a8241c';
    g.fillRect(0, 0, 512, 256);
    // Ribs.
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (const y of [60, 196]) g.fillRect(0, y, 512, 8);
    // Hazard band.
    g.save();
    g.beginPath();
    g.rect(0, 100, 512, 56);
    g.clip();
    g.fillStyle = '#f2c230';
    g.fillRect(0, 100, 512, 56);
    g.fillStyle = '#111';
    for (let x = -60; x < 560; x += 40) {
      g.beginPath();
      g.moveTo(x, 100);
      g.lineTo(x + 20, 100);
      g.lineTo(x + 76, 156);
      g.lineTo(x + 56, 156);
      g.fill();
    }
    g.restore();
    // Two hazard diamonds with a flame, opposite each other.
    for (const cx of [128, 384]) {
      g.save();
      g.translate(cx, 60);
      g.rotate(Math.PI / 4);
      g.fillStyle = '#f4f1ea';
      g.fillRect(-26, -26, 52, 52);
      g.strokeStyle = '#c21d15';
      g.lineWidth = 5;
      g.strokeRect(-22, -22, 44, 44);
      g.restore();
      g.fillStyle = '#c21d15';
      g.beginPath();
      g.moveTo(cx, 40);
      g.quadraticCurveTo(cx + 16, 62, cx + 6, 76);
      g.quadraticCurveTo(cx, 66, cx - 6, 76);
      g.quadraticCurveTo(cx - 16, 62, cx, 40);
      g.fill();
    }
    wear(g, 512, 256, 7);
  });
}

function propaneTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#e4e2da';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#c42a1e';
    g.fillRect(0, 150, 256, 30);
    g.fillStyle = '#1f1f22';
    g.font = 'bold 34px sans-serif';
    g.textAlign = 'center';
    g.fillText('LPG', 64, 120);
    g.fillText('LPG', 192, 120);
    wear(g, 256, 256, 3);
  });
}

function softDot(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
}

function scorchTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    r.addColorStop(0, 'rgba(8,6,5,0.95)');
    r.addColorStop(0.55, 'rgba(20,14,10,0.7)');
    r.addColorStop(1, 'rgba(20,14,10,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      g.strokeStyle = 'rgba(10,8,6,0.5)';
      g.lineWidth = 2 + (i % 3);
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30);
      g.lineTo(64 + Math.cos(a) * (48 + (i % 4) * 4), 64 + Math.sin(a) * (48 + (i % 4) * 4));
      g.stroke();
    }
  });
}

interface Puff {
  sprite: THREE.Sprite;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  total: number;
  size: number;
  grow: number;
  dark: number;
}

interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface Ball {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  age: number;
  radius: number;
}

interface FireView {
  group: THREE.Group;
  flames: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[];
  smokeClock: number;
}

interface Flash {
  light: THREE.PointLight;
  life: number;
  peak: number;
}

const MAX_SPARKS = 480;
const MAX_PUFFS = 160;
const MAX_SCORCH = 48;
const LIGHTS = 3;

export class ChaosView {
  public readonly group = new THREE.Group();
  /** Camera shake to apply this frame, radians (the renderer reads and decays it). */
  public shake = 0;

  private readonly barrelGeometry: THREE.BufferGeometry;
  private readonly propaneGeometry: THREE.BufferGeometry;
  private readonly barrelMaterial: THREE.MeshStandardMaterial;
  private readonly rimMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2a24, roughness: 0.5, metalness: 0.7 });
  private readonly propaneMaterial: THREE.MeshStandardMaterial;
  private readonly valveMaterial = new THREE.MeshStandardMaterial({ color: 0x9a8a55, roughness: 0.35, metalness: 0.85 });
  private readonly items = new Map<number, THREE.Group>();

  private readonly flameGeometry = new THREE.PlaneGeometry(1, 1.6).translate(0, 0.8, 0);
  private readonly fires = new Map<number, FireView>();
  /** Small flames on lit barrels, and hiss jets on lit propane. */
  private readonly litFx = new Map<number, THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>();

  private readonly balls: Ball[] = [];
  private readonly puffs: Puff[] = [];
  private readonly puffTexture = softDot();
  private readonly sparks: Spark[] = [];
  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly scorchMaterial: THREE.MeshBasicMaterial;
  private readonly scorches: THREE.Mesh[] = [];
  private readonly flashes: Flash[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private time = 0;
  private seed = 1;

  public constructor(private readonly camera: THREE.Camera) {
    const barrel = new THREE.CylinderGeometry(0.3, 0.3, EXPLOSIVES.barrel.height, 24, 1, false).translate(0, EXPLOSIVES.barrel.height / 2, 0);
    this.barrelGeometry = barrel;
    this.barrelMaterial = new THREE.MeshStandardMaterial({ map: barrelTexture(), roughness: 0.55, metalness: 0.35 });
    const tank = new THREE.CapsuleGeometry(0.2, EXPLOSIVES.propane.height - 0.5, 6, 20).translate(0, EXPLOSIVES.propane.height / 2 - 0.05, 0);
    this.propaneGeometry = tank;
    this.propaneMaterial = new THREE.MeshStandardMaterial({ map: propaneTexture(), roughness: 0.42, metalness: 0.2 });

    this.sparkMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.035, 0.035, 0.22),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.2).multiplyScalar(4), toneMapped: false }),
      MAX_SPARKS
    );
    this.sparkMesh.count = 0;
    this.sparkMesh.frustumCulled = false;
    this.scorchMaterial = new THREE.MeshBasicMaterial({
      map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    this.group.add(this.sparkMesh);
    for (let i = 0; i < LIGHTS; i++) {
      const light = new THREE.PointLight(0xff8a3a, 0, 22, 2);
      this.group.add(light);
      this.flashes.push({ light, life: 0, peak: 0 });
    }
  }

  /** Draws every explosive the chaos has placed (call after the outposts are stocked). */
  public setExplosives(chaos: Chaos): void {
    for (const e of chaos.explosives) {
      if (this.items.has(e.id)) continue;
      const g = new THREE.Group();
      if (e.kind === 'barrel') {
        const body = new THREE.Mesh(this.barrelGeometry, this.barrelMaterial);
        body.castShadow = body.receiveShadow = true;
        g.add(body);
        for (const y of [0.03, EXPLOSIVES.barrel.height - 0.03]) {
          const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 6, 24).rotateX(Math.PI / 2), this.rimMaterial);
          rim.position.y = y;
          g.add(rim);
        }
      } else {
        const body = new THREE.Mesh(this.propaneGeometry, this.propaneMaterial);
        body.castShadow = body.receiveShadow = true;
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.14, 16, 1, true), this.valveMaterial);
        collar.position.y = EXPLOSIVES.propane.height - 0.02;
        const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), this.valveMaterial);
        valve.position.y = EXPLOSIVES.propane.height + 0.02;
        g.add(body, collar, valve);
      }
      g.position.set(e.x, 0, e.z);
      g.rotation.y = (e.id * 2.39996) % (Math.PI * 2);
      this.items.set(e.id, g);
      this.group.add(g);
    }
  }

  /** A blast: fireball, flash, dust ring, sparks, smoke, scorch and a shake scaled by distance. */
  public blast(b: Blast): void {
    const scale = b.radius / 7;
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSeed: { value: this.seed++ }, uAge: { value: 0 } },
      vertexShader: FIREBALL_VERTEX,
      fragmentShader: FIREBALL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), material);
    mesh.position.set(b.x, 0.8, b.z);
    mesh.scale.setScalar(0.01);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xd8c8b0, transparent: true, opacity: 0.55, depthWrite: false })
    );
    ring.position.set(b.x, 0.08, b.z);
    this.group.add(mesh, ring);
    this.balls.push({ mesh, ring, age: 0, radius: b.radius });

    // The flash: the brightest light in the pool is reused last.
    const flash = this.flashes.reduce((a, c) => (c.life < a.life ? c : a));
    flash.light.position.set(b.x, 2.2, b.z);
    flash.light.color.setHex(0xffa04a);
    flash.life = 0.45;
    flash.peak = 900 * scale;

    for (let i = 0; i < Math.round(70 * scale); i++) {
      if (this.sparks.length >= MAX_SPARKS) this.sparks.shift();
      const a = Math.random() * Math.PI * 2;
      const up = 0.3 + Math.random() * 0.9;
      const speed = 6 + Math.random() * 16;
      this.sparks.push({ x: b.x, y: 0.8, z: b.z, vx: Math.cos(a) * speed * (1 - up * 0.5), vy: up * speed, vz: Math.sin(a) * speed * (1 - up * 0.5), life: 0.6 + Math.random() * 0.9 });
    }
    for (let i = 0; i < Math.round(14 * scale); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * b.radius * 0.3;
      this.puff(b.x + Math.cos(a) * r, 0.8 + Math.random(), b.z + Math.sin(a) * r, (Math.random() - 0.5) * 2, 1.6 + Math.random() * 2.2, (Math.random() - 0.5) * 2, 3.5 + Math.random() * 3, 1.6 + Math.random() * 1.4, 1.1, 0.12);
    }
    const scorch = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.scorchMaterial);
    scorch.scale.setScalar(b.radius * 0.9);
    scorch.rotation.y = Math.random() * Math.PI;
    scorch.position.set(b.x, 0.03, b.z);
    this.group.add(scorch);
    this.scorches.push(scorch);
    if (this.scorches.length > MAX_SCORCH) {
      const old = this.scorches.shift()!;
      old.removeFromParent();
      old.geometry.dispose();
    }
    this.camera.getWorldPosition(this.v);
    const d = Math.hypot(this.v.x - b.x, this.v.z - b.z);
    this.shake = Math.max(this.shake, Math.min(0.06, (0.9 * scale) / Math.max(4, d)));
  }

  private puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, dark: number): void {
    let p: Puff;
    if (this.puffs.length >= MAX_PUFFS) {
      p = this.puffs.shift()!;
    } else {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTexture, transparent: true, depthWrite: false, color: 0x555555 }));
      this.group.add(sprite);
      p = { sprite, vx: 0, vy: 0, vz: 0, life: 0, total: 1, size: 1, grow: 1, dark: 0 };
    }
    Object.assign(p, { vx, vy, vz, life, total: life, size, grow, dark });
    p.sprite.position.set(x, y, z);
    p.sprite.material.rotation = Math.random() * Math.PI * 2;
    p.sprite.visible = true;
    this.puffs.push(p);
  }

  private flameMaterial(alpha: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSeed: { value: Math.random() * 10 }, uAlpha: { value: alpha } },
      vertexShader: CARD_VERTEX,
      fragmentShader: FLAME_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
  }

  private addFire(f: Fire): FireView {
    const group = new THREE.Group();
    group.position.set(f.x, 0, f.z);
    const flames: FireView['flames'] = [];
    const count = Math.round(4 + f.radius * 2);
    for (let i = 0; i < count; i++) {
      const flame = new THREE.Mesh(this.flameGeometry, this.flameMaterial(0.9));
      const a = (i / count) * Math.PI * 2 + Math.random();
      const r = i === 0 ? 0 : Math.random() * f.radius * 0.7;
      flame.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      flame.scale.setScalar(0.7 + Math.random() * 0.9 * (1 - r / (f.radius + 0.01)) + (i === 0 ? 0.6 : 0));
      flames.push(flame);
      group.add(flame);
    }
    this.group.add(group);
    const view = { group, flames, smokeClock: 0 };
    this.fires.set(f.id, view);
    return view;
  }

  public update(chaos: Chaos, dt: number): void {
    this.time += dt;
    this.camera.getWorldPosition(this.v);
    const camX = this.v.x;
    const camZ = this.v.z;
    // Cards turn about y to face the camera.
    const face = (m: THREE.Object3D) => {
      m.getWorldPosition(this.s);
      m.rotation.y = Math.atan2(camX - this.s.x, camZ - this.s.z);
    };

    // Explosives: gone when they blow; a small flame on a lit barrel, a white jet on hissing propane.
    for (const e of chaos.explosives) {
      const item = this.items.get(e.id);
      if (!item) continue;
      item.visible = e.alive;
      let lit = this.litFx.get(e.id);
      if (e.alive && e.fuse >= 0 && !lit) {
        lit = new THREE.Mesh(this.flameGeometry, this.flameMaterial(e.kind === 'barrel' ? 0.85 : 0.5));
        lit.position.set(e.x, EXPLOSIVES[e.kind].height, e.z);
        lit.scale.setScalar(e.kind === 'barrel' ? 0.55 : 0.35);
        this.group.add(lit);
        this.litFx.set(e.id, lit);
      }
      if (lit) {
        if (!e.alive) {
          lit.removeFromParent();
          lit.material.dispose();
          this.litFx.delete(e.id);
        } else {
          lit.material.uniforms.uTime.value = this.time;
          face(lit);
          if (e.kind === 'propane') {
            // The hiss: the tank shivers and vents.
            item.position.x = e.x + Math.sin(this.time * 90) * 0.01;
            if (Math.random() < dt * 30) this.puff(e.x, EXPLOSIVES.propane.height + 0.1, e.z, (Math.random() - 0.5) * 3, 2.5, (Math.random() - 0.5) * 3, 0.6, 0.25, 1.8, 0.9);
          } else if (Math.random() < dt * 8) this.puff(e.x, EXPLOSIVES.barrel.height + 0.6, e.z, 0, 1.2, 0, 2, 0.5, 1.2, 0.15);
        }
      }
    }

    // Fires.
    const live = new Set<number>();
    const nearFires: { x: number; z: number; d: number; k: number }[] = [];
    for (const f of chaos.fires) {
      live.add(f.id);
      const view = this.fires.get(f.id) ?? this.addFire(f);
      const k = Math.min(1, f.life / Math.min(3, f.total)) * Math.min(1, (f.total - f.life) * 4 + 0.3);
      view.flames.forEach((fl, i) => {
        fl.material.uniforms.uTime.value = this.time + i * 0.37;
        fl.material.uniforms.uAlpha.value = 0.95 * k;
        face(fl);
      });
      view.smokeClock -= dt;
      if (view.smokeClock <= 0) {
        view.smokeClock = 0.18 / Math.max(0.3, f.radius / 2.5);
        this.puff(f.x + (Math.random() - 0.5) * f.radius, 1.6, f.z + (Math.random() - 0.5) * f.radius, (Math.random() - 0.5) * 0.6, 1.4 + Math.random(), (Math.random() - 0.5) * 0.6, 4 + Math.random() * 2, 0.9, 1.4, 0.08);
      }
      nearFires.push({ x: f.x, z: f.z, d: Math.hypot(f.x - camX, f.z - camZ), k });
    }
    for (const [id, view] of this.fires) {
      if (live.has(id)) continue;
      for (const fl of view.flames) fl.material.dispose();
      view.group.removeFromParent();
      this.fires.delete(id);
    }

    // Lights: blast flashes first; the rest flicker over the nearest fires.
    nearFires.sort((a, b) => a.d - b.d);
    let fireIndex = 0;
    for (const f of this.flashes) {
      if (f.life > 0) {
        f.life -= dt;
        f.light.intensity = f.peak * Math.max(0, f.life / 0.45) ** 2;
        continue;
      }
      const fire = nearFires[fireIndex++];
      if (fire) {
        f.light.position.set(fire.x, 1.4, fire.z);
        f.light.color.setHex(0xff7a2a);
        f.light.intensity = (40 + Math.sin(this.time * 23 + fireIndex) * 10 + Math.sin(this.time * 37) * 8) * fire.k;
      } else f.light.intensity = 0;
    }

    // Fireballs swell fast and burn out; the ring of dust runs out along the ground.
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.age += dt;
      const t = b.age / 0.9;
      const size = b.radius * 0.5 * (1 - Math.pow(1 - Math.min(1, b.age / 0.25), 3)) + b.age * 0.8;
      b.mesh.scale.setScalar(Math.max(0.01, size));
      b.mesh.position.y = 0.8 + b.age * 1.6;
      b.mesh.material.uniforms.uTime.value = this.time;
      b.mesh.material.uniforms.uAge.value = Math.min(1, t);
      b.ring.scale.setScalar(0.5 + b.age * b.radius * 3.2);
      b.ring.material.opacity = Math.max(0, 0.5 * (1 - b.age / 0.6));
      if (t >= 1) {
        b.mesh.removeFromParent();
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        b.ring.removeFromParent();
        b.ring.geometry.dispose();
        b.ring.material.dispose();
        this.balls.splice(i, 1);
      }
    }

    // Smoke.
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      const age = 1 - p.life / p.total;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      p.vx *= 1 - dt * 0.6;
      p.vz *= 1 - dt * 0.6;
      p.sprite.scale.setScalar(p.size * (1 + age * p.grow * 2));
      const grey = 0.12 + p.dark * 0.5 + age * 0.25;
      p.sprite.material.color.setRGB(grey, grey * 0.97, grey * 0.94);
      p.sprite.material.opacity = Math.min(1, age * 6) * (1 - age) * 0.75;
    }

    // Sparks: ballistic, stretched along their flight.
    let n = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0 || s.y < 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.vy -= 14 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      this.v.set(s.vx, s.vy, s.vz).normalize();
      this.quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.v);
      this.matrix.compose(this.s.set(s.x, s.y, s.z), this.quat, new THREE.Vector3(1, 1, Math.min(3, s.life * 3)));
      this.sparkMesh.setMatrixAt(n++, this.matrix);
    }
    this.sparkMesh.count = n;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
  }
}
