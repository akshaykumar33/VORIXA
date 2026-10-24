import * as THREE from 'three';
import type { Fight, FightEvent } from '../../fighter/Fight';
import { castDef, type Contender } from '../../fighter/Roster';
import { People } from '../city/People';
import { PostFX } from '../rush/PostFX';
import { Arena, WEATHER_BY_ROUND } from './Arena';
import { FighterView } from './FighterView';

/**
 * Akhada drawn (ADR-0016): the arena, the two fighters, their blasts, and the camera.
 *
 * The camera watches from the side like Street Fighter: centred between the fighters, pulled back
 * as they separate, pushed in on a super and on the KO. Hits throw sparks in the attacker's colour,
 * knockdowns raise dust, and heavy blows shake the view.
 */

interface BlastView {
  id: number;
  core: THREE.Mesh;
  glow: THREE.Mesh;
  light: THREE.PointLight;
  colour: number;
}

export class FightRenderer {
  public readonly scene = new THREE.Scene();
  public readonly camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 600);
  private renderer!: THREE.WebGLRenderer;
  private post: PostFX | null = null;
  public arena!: Arena;
  private readonly people = new People();
  private views: FighterView[] = [];
  private readonly blasts = new Map<number, BlastView>();
  private readonly camPos = new THREE.Vector3(0, 1.7, 7.5);
  private readonly look = new THREE.Vector3(0, 1.1, 0);
  private shake = 0;
  /** A push-in on a super or a KO: where to, and for how long. */
  private focus: { x: number; time: number } | null = null;
  private readonly tmp = new THREE.Vector3();
  private roundShown = 0;
  public ready = false;

  public initialize(canvas: HTMLCanvasElement): void {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    // Ravana's extra heads are his body clipped above the neck.
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.post = new PostFX(this.renderer, this.scene, this.camera);
    // Garlands, diyas and umbrella ribs are thin against the sky: a tight occlusion radius.
    this.post.setOcclusion(0.45, 1.4);
    this.arena = new Arena(this.scene);
  }

  public resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.post?.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const px = height * Math.min(window.devicePixelRatio, 2);
    this.arena?.smoke.setViewHeight(px);
    this.arena?.glow.setViewHeight(px);
  }

  public async load(onProgress: (share: number) => void): Promise<void> {
    onProgress(0.1);
    await this.arena.build(this.renderer);
    onProgress(0.7);
    this.ready = true;
    onProgress(1);
  }

  /** Puts the two chosen fighters in the ring (replacing any before). */
  public async cast(a: Contender, b: Contender): Promise<void> {
    for (const v of this.views) v.dispose();
    const [ga, gb] = await Promise.all([this.people.load(a.model), this.people.load(b.model)]);
    // The same fighter twice: the second wears another colour.
    const second = a.id === b.id ? { ...b, palette: Object.fromEntries(Object.keys(b.palette).map((k) => [k, 0x2a3a8c])) } : b;
    this.views = [
      new FighterView(this.people, ga, castDef(a), a.colour, a.look, this.scene),
      new FighterView(this.people, gb, castDef(second), second.colour, second.look, this.scene)
    ];
    for (const v of this.views) this.scene.add(v.root);
    this.roundShown = 0;
  }

  /** Turns the fight's events into sparks, dust, shake and push-ins. */
  public react(fight: Fight, events: readonly FightEvent[]): void {
    const glow = this.arena.glow;
    const smoke = this.arena.smoke;
    for (const e of events) {
      if (e.type === 'hit' || e.type === 'block') {
        const by = fight.fighters[1 - e.slot];
        const colour = e.type === 'block' ? 0x9fd8ff : by.def.colour;
        const n = e.type === 'hit' ? (e.heavy ? 40 : 22) : 12;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = (e.type === 'hit' && e.heavy ? 7 : 4.5) * (0.4 + Math.random() * 0.6);
          glow.emit({ x: e.x, y: e.y, z: 0.25, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: (Math.random() - 0.5) * 2, size: 0.06 + Math.random() * 0.05, life: 0.25 + Math.random() * 0.2, color: i % 3 ? colour : 0xffffff, lift: -9, drag: 0.2 });
        }
        glow.emit({ x: e.x, y: e.y, z: 0.3, size: 0.2, grow: e.type === 'hit' && e.heavy ? 1.6 : 0.9, life: 0.16, color: 0xffffff, alpha: 1 });
        this.shake = Math.max(this.shake, e.type === 'hit' ? (e.heavy ? 0.16 : 0.07) : 0.04);
      } else if (e.type === 'knockdown') {
        const f = fight.fighters[e.slot];
        for (let i = 0; i < 18; i++) smoke.emit({ x: f.x + (Math.random() - 0.5) * 1.2, y: 0.1, z: (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 1.5, vy: 0.4 + Math.random() * 0.6, size: 0.4, grow: 1.6, life: 1.4, color: 0xb8a088, alpha: 0.35, drag: 0.3 });
      } else if (e.type === 'projectile' && e.super) {
        const f = fight.fighters[e.slot];
        this.focus = { x: f.x, time: 0.9 };
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2;
          smoke.emit({ x: f.x + Math.cos(a) * 0.3, y: 0.2 + Math.random() * 1.8, z: Math.sin(a) * 0.3, vx: Math.cos(a) * 2, vz: Math.sin(a) * 2, vy: 1, size: 0.5, grow: 2.2, life: 1.6, color: f.def.colour, alpha: 0.3, drag: 0.4 });
        }
      } else if (e.type === 'clash') {
        for (let i = 0; i < 50; i++) {
          const a = Math.random() * Math.PI * 2;
          glow.emit({ x: e.x, y: e.y, z: 0, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, size: 0.08, life: 0.5, color: 0xffffff, drag: 0.3 });
        }
        this.shake = 0.12;
      } else if (e.type === 'ko') {
        const f = fight.fighters[e.slot];
        this.focus = { x: f.x, time: 2.2 };
        this.shake = 0.22;
      } else if (e.type === 'round' && e.round !== this.roundShown) {
        this.roundShown = e.round;
        void this.arena.setWeather(WEATHER_BY_ROUND[(e.round - 1) % WEATHER_BY_ROUND.length]);
      }
    }
  }

  public render(fight: Fight, dt: number, held: readonly number[]): void {
    if (!this.ready || this.views.length < 2) return;
    fight.fighters.forEach((f, i) => {
      const back = Math.sign(held[i] ?? 0) === -f.facing;
      const step = fight.slowmo > 0 ? dt * 0.35 : dt;
      this.views[i].update(f, step, back);
      this.views[i].power(step, f.facing, this.arena.glow, this.arena.smoke, f.state === 'attack');
    });
    this.drawBlasts(fight, dt);
    const [a, b] = fight.fighters;
    const mid = (a.x + b.x) / 2;
    this.arena.update(dt, mid);
    this.placeCamera(mid, Math.abs(a.x - b.x), dt);
    if (this.post) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  private drawBlasts(fight: Fight, dt: number): void {
    const alive = new Set<number>();
    for (const p of fight.projectiles) {
      alive.add(p.id);
      let v = this.blasts.get(p.id);
      const colour = fight.fighters[p.owner].def.colour;
      if (!v) {
        const hot = new THREE.Color(colour).multiplyScalar(4);
        const core = new THREE.Mesh(new THREE.SphereGeometry(p.size * 0.35, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
        const glow = new THREE.Mesh(new THREE.SphereGeometry(p.size * 0.6, 20, 14), new THREE.MeshBasicMaterial({ color: hot, transparent: true, opacity: 0.6, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
        const light = new THREE.PointLight(colour, p.super ? 14 : 6, 6, 2);
        v = { id: p.id, core, glow, light, colour };
        this.scene.add(core, glow, light);
        this.blasts.set(p.id, v);
      }
      v.core.position.set(p.x, p.y, 0);
      v.glow.position.set(p.x, p.y, 0);
      v.light.position.set(p.x, p.y, 0.3);
      const pulse = 1 + Math.sin(performance.now() / 50) * 0.12;
      v.glow.scale.setScalar(pulse);
      // A trail of embers behind it.
      for (let i = 0; i < (p.super ? 4 : 2); i++) {
        this.arena.glow.emit({ x: p.x - Math.sign(p.vx) * Math.random() * 0.3, y: p.y + (Math.random() - 0.5) * p.size, z: (Math.random() - 0.5) * p.size, vx: -p.vx * 0.15, vy: (Math.random() - 0.5) * 0.6, size: p.size * 0.5, grow: 0.02, life: 0.35, color: colour });
      }
    }
    for (const [id, v] of this.blasts) {
      if (alive.has(id)) continue;
      v.core.removeFromParent();
      v.glow.removeFromParent();
      v.light.removeFromParent();
      this.blasts.delete(id);
    }
    void dt;
  }

  private placeCamera(mid: number, gap: number, dt: number): void {
    let x = mid;
    // Far enough back to frame the temples and the river, closer as the fighters close in.
    let dist = 7.4 + Math.max(0, gap - 2) * 0.8;
    let height = 2.0;
    if (this.focus) {
      this.focus.time -= dt;
      x = this.focus.x;
      dist = 4.2;
      height = 1.45;
      if (this.focus.time <= 0) this.focus = null;
    }
    const ease = 1 - Math.exp(-5 * dt);
    this.camPos.x += (x - this.camPos.x) * ease;
    this.camPos.y += (height - this.camPos.y) * ease;
    this.camPos.z += (dist - this.camPos.z) * ease;
    this.look.set(this.camPos.x, 1.05, 0);
    this.shake = Math.max(0, this.shake - dt * 0.6);
    const s = this.shake;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * s, this.camPos.y + (Math.random() - 0.5) * s, this.camPos.z);
    this.camera.lookAt(this.look);
  }

  public chestOf(slot: number, out: THREE.Vector3 = this.tmp): THREE.Vector3 {
    return this.views[slot].chest(out);
  }
}
