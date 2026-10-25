import * as THREE from 'three';
import { MOVES, type Fight, type FightEvent } from '../../fighter/Fight';
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

/** A starburst for impacts: a hot core and sharp rays, like a fighting game's hit spark. */
function burstTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.translate(128, 128);
  const rays = 14;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + (i % 2) * 0.12;
    const len = i % 2 ? 70 : 124;
    g.beginPath();
    g.moveTo(Math.cos(a - 0.07) * 18, Math.sin(a - 0.07) * 18);
    g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    g.lineTo(Math.cos(a + 0.07) * 18, Math.sin(a + 0.07) * 18);
    g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fill();
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, 48);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core;
  g.beginPath();
  g.arc(0, 0, 48, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Spark {
  sprite: THREE.Sprite;
  life: number;
  max: number;
  size: number;
}

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
  /**
   * A cinematic push-in: where to, for how long, how close and how low, and how far round the
   * subject the camera swings (radians) over it. Supers push in; a KO swings low round the fallen;
   * the winner gets a slow orbit for their victory.
   */
  private focus: { x: number; time: number; total: number; dist: number; height: number; orbit: number } | null = null;
  /** The camera's angle round its subject, eased; 0 is straight on from the side. */
  private angle = 0;
  private winShown = false;
  private readonly tmp = new THREE.Vector3();
  private roundShown = 0;
  /** Training's hitboxes: a red box where an attack can connect, a blue one round each body. */
  public showHitboxes = false;
  private readonly hitboxes: THREE.Mesh[] = [];
  private readonly sparks: Spark[] = [];
  private readonly burst = burstTexture();
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
        this.spark(e.x, e.y, colour, e.type === 'hit' ? (e.heavy ? 2.1 : 1.35) : 1.1, e.type === 'block');
        this.shake = Math.max(this.shake, e.type === 'hit' ? (e.heavy ? 0.16 : 0.07) : 0.04);
      } else if (e.type === 'knockdown') {
        const f = fight.fighters[e.slot];
        for (let i = 0; i < 18; i++) smoke.emit({ x: f.x + (Math.random() - 0.5) * 1.2, y: 0.1, z: (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 1.5, vy: 0.4 + Math.random() * 0.6, size: 0.4, grow: 1.6, life: 1.4, color: 0xb8a088, alpha: 0.35, drag: 0.3 });
      } else if (e.type === 'projectile' && e.super) {
        const f = fight.fighters[e.slot];
        this.focus = { x: f.x, time: 0.9, total: 0.9, dist: 4.2, height: 1.45, orbit: 0 };
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
        // The KO: low, close, swinging round the fallen as the fight slows.
        this.focus = { x: f.x, time: 2.4, total: 2.4, dist: 3.3, height: 0.85, orbit: 0.75 * (f.facing > 0 ? -1 : 1) };
        this.shake = 0.22;
      } else if (e.type === 'round') {
        this.winShown = false;
      }
      if (e.type === 'round' && e.round !== this.roundShown) {
        this.roundShown = e.round;
        void this.arena.setWeather(WEATHER_BY_ROUND[(e.round - 1) % WEATHER_BY_ROUND.length]);
      }
    }
  }

  private drawHitboxes(fight: Fight): void {
    if (!this.hitboxes.length) {
      const mat = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.28, depthTest: false });
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.6), mat(i < 2 ? 0x3d8cff : 0xff2a2a));
        m.renderOrder = 9;
        this.hitboxes.push(m);
        this.scene.add(m);
      }
    }
    fight.fighters.forEach((f, i) => {
      const body = this.hitboxes[i];
      const strike = this.hitboxes[2 + i];
      body.visible = this.showHitboxes;
      body.position.set(f.x, f.y + 0.9, 0);
      body.scale.set(0.62, 1.8, 1);
      const m = f.move ? MOVES[f.move] : null;
      const live = !!m && m.reach > 0 && f.t >= m.startup && f.t < m.startup + m.active;
      strike.visible = this.showHitboxes && live;
      if (live && m) {
        const from = m.around ? -m.reach : 0;
        strike.scale.set(m.reach - from, m.height === 'low' ? 0.5 : 0.8, 1);
        strike.position.set(f.x + f.facing * (from + m.reach) / 2, f.y + (m.height === 'low' ? 0.3 : 1.2), 0);
      }
    });
  }

  /** A starburst at an impact: it pops to full size in a few frames and fades. */
  private spark(x: number, y: number, colour: number, size: number, block: boolean): void {
    const material = new THREE.SpriteMaterial({
      map: this.burst, color: block ? 0x8fd0ff : new THREE.Color(colour).lerp(new THREE.Color(0xffffff), 0.35),
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, rotation: Math.random() * Math.PI
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, 0.5);
    sprite.renderOrder = 10;
    this.scene.add(sprite);
    this.sparks.push({ sprite, life: 0.22, max: 0.22, size });
  }

  private updateSparks(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        s.sprite.removeFromParent();
        s.sprite.material.dispose();
        this.sparks.splice(i, 1);
        continue;
      }
      const k = 1 - s.life / s.max;
      // Snap open, then shrink a little as it fades.
      s.sprite.scale.setScalar(s.size * (k < 0.25 ? 0.4 + k * 2.4 : 1 - (k - 0.25) * 0.3));
      s.sprite.material.opacity = k < 0.25 ? 1 : 1 - (k - 0.25) / 0.75;
    }
  }

  public render(fight: Fight, dt: number, held: readonly number[]): void {
    if (!this.ready || this.views.length < 2) return;
    fight.fighters.forEach((f, i) => {
      const back = Math.sign(held[i] ?? 0) === -f.facing;
      // Hit-stop: on impact the bodies freeze with the fight, which is what makes a blow land.
      const step = fight.hitstop > 0 ? 0 : fight.slowmo > 0 ? dt * 0.35 : dt;
      this.views[i].update(f, step, back);
      this.views[i].power(step, f.facing, this.arena.glow, this.arena.smoke, f.state === 'attack');
    });
    this.drawBlasts(fight, dt);
    this.drawHitboxes(fight);
    // Sparks keep moving through hit-stop: the freeze is the bodies, not the flash.
    this.updateSparks(dt);
    const [a, b] = fight.fighters;
    const mid = (a.x + b.x) / 2;
    // The winner's moment: once the KO has played, a slow orbit round them in their victory pose.
    const winner = fight.fighters.find((f) => f.state === 'win' && f.t > 1.1);
    if (winner && !this.winShown && !this.focus) {
      this.winShown = true;
      this.focus = { x: winner.x, time: 3.2, total: 3.2, dist: 3.0, height: 1.55, orbit: 0.55 * (winner.facing > 0 ? 1 : -1) };
    }
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
    // A fighting game's camera: low and close, the fighters filling most of the screen's height,
    // pulling back only as far as it must to keep both in frame.
    let dist = 4.9 + Math.max(0, gap - 1.6) * 0.62;
    let height = 1.3;
    let angle = 0;
    if (this.focus) {
      this.focus.time -= dt;
      x = this.focus.x;
      dist = this.focus.dist;
      height = this.focus.height;
      // The swing grows over the shot.
      angle = this.focus.orbit * (1 - this.focus.time / this.focus.total);
      if (this.focus.time <= 0) this.focus = null;
    }
    const ease = 1 - Math.exp(-5 * dt);
    this.camPos.x += (x - this.camPos.x) * ease;
    this.camPos.y += (height - this.camPos.y) * ease;
    this.camPos.z += (dist - this.camPos.z) * ease;
    this.angle += (angle - this.angle) * ease;
    this.look.set(this.camPos.x, this.focus ? Math.max(0.7, height - 0.2) : 1.08, 0);
    this.shake = Math.max(0, this.shake - dt * 0.6);
    const s = this.shake;
    // Round the subject by the angle: x swings sideways, z comes in.
    const px = this.camPos.x + Math.sin(this.angle) * this.camPos.z;
    const pz = Math.cos(this.angle) * this.camPos.z;
    this.camera.position.set(px + (Math.random() - 0.5) * s, this.camPos.y + (Math.random() - 0.5) * s, pz);
    this.camera.lookAt(this.look);
  }

  public chestOf(slot: number, out: THREE.Vector3 = this.tmp): THREE.Vector3 {
    return this.views[slot].chest(out);
  }
}
