import * as THREE from 'three';
import { InputEngine } from '../input/InputEngine';
import { InputAction } from '../input/ActionTypes';
import { RushAudio } from '../audio/RushAudio';
import type { FxRecord, FxType } from '../rush/RushSim';
import { buildDistrict, type District } from '../city/CityLayout';
import { HeroMotor, type HeroIntent } from '../city/HeroMotor';
import { Arsenal, LOADOUT, WEAPONS, type WeaponId } from '../city/Weapons';
import { Combat, HERO_MAX_ARMOR } from '../city/Combat';
import { CityRenderer } from '../rendering/city/CityRenderer';
import { CityHUD, type SlotInfo } from '../ui/CityHUD';

/**
 * Runs VORIXA City (ADR-0014): the hero on foot in the downtown district (phase 1) with
 * Counter-Strike-style gunplay against a crew holding the district (phase 2).
 *
 * The mouse is captured with pointer lock while playing; Esc releases it and brings back the card.
 * The hero, the guns and the fight step together at a fixed 120 Hz.
 */

const TICK = 1 / 120;
const MAX_FRAME = 0.1;
const MOUSE_SENSITIVITY = 0.0022;
const PITCH_LIMIT = 1.25;
const NEXT_WAVE_DELAY = 6;

export class CityGame {
  private readonly input = new InputEngine();
  private readonly audio = new RushAudio();
  private readonly district: District = buildDistrict(4);
  private readonly hero: HeroMotor;
  private readonly arsenal = new Arsenal(0x5eed);
  private readonly combat: Combat;
  private readonly hud: CityHUD;
  private readonly intent: HeroIntent = {
    forward: 0,
    right: 0,
    cameraYaw: 0,
    sprint: false,
    walk: false,
    jumpPressed: false,
    faceCamera: false
  };
  private readonly sound: FxRecord = { type: 'fire', x: 0, y: 0, z: 0, amount: 0 };
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private lastTime = -1;
  private accumulator = 0;
  private playing = false;
  private started = false;
  private down = false;
  private downFor = 0;
  private nextWaveIn = -1;
  private readonly wavePoints: [number, number][];
  private waveIndex = 0;

  public constructor(
    private readonly renderer: CityRenderer,
    private readonly canvas: HTMLCanvasElement,
    container: HTMLElement
  ) {
    this.hero = new HeroMotor(this.district.colliders, this.district.bounds);
    this.combat = new Combat(this.district.colliders, this.district.bounds);
    const s = this.district.spawn;
    this.hero.place(s.x, s.z, s.yaw + Math.PI);
    this.renderer.yaw = s.yaw;
    const P = this.district.pitch;
    // Each wave holds a different intersection, working out from the start.
    this.wavePoints = [[P, 0], [P, P], [2 * P, P], [2 * P, 2 * P], [P, 2 * P], [0, P]];

    this.hud = new CityHUD(container);
    this.hud.onPlay = () => this.capture();
    this.hud.onRespawn = () => this.respawn();
    this.hud.onBack = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      window.location.href = url.toString();
    };
    canvas.addEventListener('click', () => {
      if (this.renderer.ready && !this.playing && !this.down) this.capture();
    });
    document.addEventListener('pointerlockchange', () => {
      this.playing = document.pointerLockElement === this.canvas;
      this.hud.showCard(!this.playing && !this.down, this.started);
    });
    window.addEventListener('keydown', (e) => {
      const slot = Number(e.code.replace('Digit', '')) - 1;
      if (e.code.startsWith('Digit') && slot >= 0 && slot < LOADOUT.length) this.select(LOADOUT[slot]);
    });
    window.addEventListener('wheel', (e) => {
      if (!this.playing) return;
      const i = LOADOUT.indexOf(this.arsenal.current);
      this.select(LOADOUT[(i + (e.deltaY > 0 ? 1 : -1) + LOADOUT.length) % LOADOUT.length]);
    });
    const unlock = () => void this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    this.renderer
      .load(this.district, (share) => this.hud.progress(share))
      .then(() => {
        this.hud.loaded();
        this.renderer.combatView?.setWeapon(this.arsenal.current);
        this.startWave();
      })
      .catch((error: unknown) => {
        console.error('[city] could not load', error);
        this.hud.failed('Could not load the city');
      });
  }

  public start(): void {
    requestAnimationFrame((t) => this.frame(t));
  }

  private capture(): void {
    if (!this.renderer.ready) return;
    this.started = true;
    void this.canvas.requestPointerLock?.();
    if (!('requestPointerLock' in this.canvas)) {
      this.playing = true;
      this.hud.showCard(false);
    }
  }

  private select(id: WeaponId): void {
    const a = this.arsenal;
    if (a.ammo[id].mag + a.ammo[id].reserve <= 0 && id !== a.current) return;
    a.select(id);
    this.renderer.combatView?.setWeapon(id);
  }

  private startWave(): void {
    const [x, z] = this.wavePoints[this.waveIndex % this.wavePoints.length];
    this.waveIndex++;
    this.combat.spawnWave(x, z, 3 + this.waveIndex * 2);
    this.hud.banner(`Wave ${this.combat.wave}`, `${this.combat.alive} armed, holding the intersection ahead`);
  }

  private respawn(): void {
    if (!this.down || this.downFor < 1) return;
    this.down = false;
    const s = this.district.spawn;
    this.hero.place(s.x, s.z, s.yaw + Math.PI);
    this.renderer.yaw = s.yaw;
    this.renderer.pitch = -0.12;
    this.combat.reviveHero();
    // A fresh pistol magazine at least: nobody respawns empty-handed.
    const pistol = this.arsenal.ammo.pistol;
    pistol.mag = WEAPONS.pistol.magazine;
    pistol.reserve = Math.max(pistol.reserve, WEAPONS.pistol.reserve);
    for (const e of this.combat.enemies) if (e.state !== 'dead') e.state = 'idle';
    this.hud.showDown(false);
    this.capture();
  }

  private play(type: FxType, x: number, z: number): void {
    const s = this.sound;
    s.type = type;
    // Rush's synth pans by x / 7 around the listener.
    s.x = (x - this.hero.x) * 0.5;
    s.z = z;
    this.audio.play(s);
  }

  private frame(nowMs: number): void {
    const now = nowMs / 1000;
    const dt = this.lastTime < 0 ? 0 : Math.max(0, Math.min(now - this.lastTime, MAX_FRAME));
    this.lastTime = now;
    const r = this.renderer;
    const i = this.input;
    const active = this.playing && !this.down;

    if (active) {
      r.yaw -= i.getAxis(InputAction.LOOK_X) * MOUSE_SENSITIVITY;
      r.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, r.pitch - i.getAxis(InputAction.LOOK_Y) * MOUSE_SENSITIVITY));
      if (i.isJustPressed(InputAction.VIEW_TOGGLE)) r.view = r.view === 'third' ? 'first' : 'third';
      if (i.isJustPressed(InputAction.RESTART)) this.arsenal.reload();
    } else if (this.down && i.isJustPressed(InputAction.RESTART)) this.respawn();
    r.aiming = active && i.isPressed(InputAction.ITEM);
    r.aimFov = WEAPONS[this.arsenal.current].aimFov;

    const intent = this.intent;
    intent.forward = active ? (i.isPressed(InputAction.MOVE_FORWARD) ? 1 : 0) - (i.isPressed(InputAction.MOVE_BACKWARD) ? 1 : 0) : 0;
    intent.right = active ? (i.isPressed(InputAction.STRAFE_RIGHT) ? 1 : 0) - (i.isPressed(InputAction.STRAFE_LEFT) ? 1 : 0) : 0;
    intent.cameraYaw = r.yaw;
    intent.sprint = active && i.isPressed(InputAction.DASH) && !r.aiming;
    intent.jumpPressed = active && i.isJustPressed(InputAction.JUMP);
    intent.faceCamera = r.aiming || r.view === 'first' || r.sinceFired < 0.6;
    const trigger = active && (i.isPressed(InputAction.FIRE) || i.isJustPressed(InputAction.FIRE));

    this.accumulator += dt;
    while (this.accumulator >= TICK) {
      this.hero.step(intent, TICK);
      for (const fx of this.hero.fx) r.heroEvent(fx);
      intent.jumpPressed = false;
      this.stepGuns(trigger);
      this.stepCombat();
      this.accumulator -= TICK;
    }

    if (this.down) this.downFor += dt;
    if (this.nextWaveIn > 0) {
      this.nextWaveIn -= dt;
      if (this.nextWaveIn <= 0) this.startWave();
    }

    // HUD.
    const a = this.arsenal;
    const w = a.def;
    const ammo = a.ammo[a.current];
    const slots: SlotInfo[] = LOADOUT.map((id, n) => ({ key: String(n + 1), name: WEAPONS[id].name, owned: a.ammo[id].mag + a.ammo[id].reserve > 0 }));
    this.hud.setWeapon(w.name, ammo.mag, ammo.reserve, a.reloading > 0, slots, LOADOUT.indexOf(a.current));
    this.hud.setVitals(this.combat.hp, (this.combat.armor / HERO_MAX_ARMOR) * 50);
    this.hud.setEnemies(this.combat.alive);
    this.hud.setView(r.view === 'first');
    const moving = Math.min(1, this.hero.speed / 4.6);
    const spread = w.spread * (r.aiming ? w.aimSpread : 1) + w.moveSpread * moving + (this.hero.grounded ? 0 : 0.05);
    this.hud.setCrosshair(active, spread, r.camera.fov);
    r.combatView?.reloading(a.reloadProgress);

    r.render(this.hero, dt, this.combat);
    i.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  private stepGuns(trigger: boolean): void {
    const r = this.renderer;
    const a = this.arsenal;
    const result = a.step(TICK, trigger, r.aiming, Math.min(1, this.hero.speed / 4.6), !this.hero.grounded);
    for (const ev of a.events) {
      if (ev === 'dry') this.play('hit', this.hero.x, 0);
      if (ev === 'reloadStart') this.play('pickup', this.hero.x, 0);
    }
    if (!result) return;
    const cam = r.camera.position;
    // Third person traces from the camera but ignores anything between it and the hero.
    const minDistance = r.view === 'third' ? Math.hypot(cam.x - this.hero.x, cam.z - this.hero.z) + 0.4 : 0;
    const hits = this.combat.fire(a.current, result.shots, cam.x, cam.y, cam.z, r.yaw, r.pitch, minDistance);
    r.punchPitch += result.kickPitch;
    r.punchYaw += result.kickYaw;
    r.sinceFired = 0;
    this.play('fire', this.hero.x, 0);
    const view = r.combatView;
    if (view) {
      view.muzzle(r.view === 'first', this.from);
      for (const h of hits.slice(0, 3)) {
        this.to.set(h.x, h.y, h.z);
        view.heroFired(result.kickPitch, this.from, this.to, r.view === 'first');
      }
    }
  }

  private stepCombat(): void {
    const c = this.combat;
    c.step(TICK, this.hero, (weapon, rounds) => this.arsenal.addAmmo(weapon, rounds));
    const view = this.renderer.combatView;
    for (const fx of c.fx) {
      switch (fx.type) {
        case 'enemyShot':
          view?.enemyFired(fx.enemy, fx.tx, fx.ty, fx.tz);
          this.play('enemyFire', fx.enemy.motor.x, fx.enemy.motor.z);
          break;
        case 'enemyHurt':
          view?.impact(fx.x, fx.y, fx.z, true);
          this.hud.hitMarker(false);
          this.play('hit', fx.x, fx.z);
          break;
        case 'enemyKilled':
          this.hud.hitMarker(true);
          this.hud.feed(fx.headshot ? 'Headshot' : 'Enemy down', fx.headshot);
          this.play('takedown', fx.enemy.motor.x, fx.enemy.motor.z);
          break;
        case 'impact':
          view?.impact(fx.x, fx.y, fx.z, false);
          break;
        case 'heroHurt': {
          // Where the shot came from, relative to the view: 0 is straight ahead.
          const world = Math.atan2(fx.fromX - this.hero.x, fx.fromZ - this.hero.z);
          const viewYaw = Math.atan2(-Math.sin(this.renderer.yaw), -Math.cos(this.renderer.yaw));
          this.hud.damageFrom(-(world - viewYaw));
          this.play('hit', this.hero.x, 0);
          break;
        }
        case 'heroDown':
          this.down = true;
          this.downFor = 0;
          this.hud.showDown(true, `${c.kills} down · ${c.headshots} headshots · wave ${c.wave}`);
          void document.exitPointerLock?.();
          this.play('gameOver', this.hero.x, 0);
          break;
        case 'pickup':
          this.hud.feed(`+${fx.rounds} ${WEAPONS[fx.weapon].name} rounds`);
          this.play('pickup', this.hero.x, 0);
          break;
        case 'waveClear':
          this.hud.banner('Intersection clear', `Wave ${fx.wave} down · next crew in ${NEXT_WAVE_DELAY} s`);
          this.play('itemGet', this.hero.x, 0);
          this.nextWaveIn = NEXT_WAVE_DELAY;
          break;
      }
    }
  }
}
