import * as THREE from 'three';
import { InputEngine } from '../input/InputEngine';
import { InputAction } from '../input/ActionTypes';
import { RushAudio } from '../audio/RushAudio';
import type { FxRecord, FxType } from '../rush/RushSim';
import { buildDistrict, type District } from '../city/CityLayout';
import { HeroMotor, type HeroIntent } from '../city/HeroMotor';
import { Arsenal, LOADOUT, WEAPONS, type WeaponId } from '../city/Weapons';
import { Combat, HERO_MAX_ARMOR } from '../city/Combat';
import { Vehicle, VEHICLE_SPECS, separate, coverBox, type DriveIntent } from '../city/Vehicle';
import { CityLife } from '../city/CityLife';
import { direction } from '../city/Combat';
import { CityRenderer } from '../rendering/city/CityRenderer';
import { CityHUD, type SlotInfo, type CrewEntry } from '../ui/CityHUD';
import { CREW, PERKS, perkEffects, unlocked, type CharacterDef, type PerkEffects } from '../city/Crew';

const PROGRESS_KEY = 'vorixa.city.progress';
const CREW_KEY = 'vorixa.city.crew';

function loadProgress(): { waves: number; crew: string } {
  try {
    const waves = Number(localStorage.getItem(PROGRESS_KEY)) || 0;
    return { waves, crew: localStorage.getItem(CREW_KEY) ?? 'vex' };
  } catch {
    return { waves: 0, crew: 'vex' };
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: progress lasts the session.
  }
}

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
  private readonly vehicles: Vehicle[];
  private readonly life: CityLife;
  private policeTimer = 0;
  private driving: Vehicle | null = null;
  private readonly drive: DriveIntent = { throttle: 0, steer: 0, handbrake: false };
  private mouseMovedAt = -99;
  private clock = 0;
  private wavesCleared: number;
  private crew: CharacterDef;
  private perks: PerkEffects = perkEffects(undefined);
  private browsing = 0;
  private timeScale = 1;
  private waveIndex = 0;

  public constructor(
    private readonly renderer: CityRenderer,
    private readonly canvas: HTMLCanvasElement,
    container: HTMLElement
  ) {
    this.hero = new HeroMotor(this.district.colliders, this.district.bounds);
    this.combat = new Combat(this.district.colliders, this.district.bounds);
    this.life = new CityLife(this.district, 28);
    this.vehicles = this.district.parking.map((p, n) =>
      new Vehicle(n + 1, VEHICLE_SPECS[p.model], this.district.colliders, this.district.bounds).place(p.x, p.z, p.heading)
    );
    const s = this.district.spawn;
    this.hero.place(s.x, s.z, s.yaw + Math.PI);
    this.renderer.yaw = s.yaw;
    const P = this.district.pitch;
    // Each wave holds a different intersection, working out from the start.
    this.wavePoints = [[P, 0], [P, P], [2 * P, P], [2 * P, 2 * P], [P, 2 * P], [0, P]];

    const progress = loadProgress();
    this.wavesCleared = progress.waves;
    this.crew = unlocked(this.wavesCleared).find((c) => c.id === progress.crew) ?? CREW[0];
    this.renderer.heroDef = this.crew;
    this.applyPerks();

    this.hud = new CityHUD(container);
    this.hud.onOpenSafehouse = () => this.openSafehouse();
    this.hud.onBrowse = (i) => this.browse(i);
    this.hud.onPick = () => this.pick();
    this.hud.onCloseSafehouse = () => this.closeSafehouse();
    this.hud.onPlay = () => this.capture();
    this.hud.onRespawn = () => this.respawn();
    this.hud.onBack = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      window.location.href = url.toString();
    };
    canvas.addEventListener('click', () => {
      if (this.renderer.ready && !this.playing && !this.down && !this.hud.safehouseOpen) this.capture();
    });
    document.addEventListener('pointerlockchange', () => {
      this.playing = document.pointerLockElement === this.canvas;
      if (!this.hud.safehouseOpen) this.hud.showCard(!this.playing && !this.down, this.started);
    });
    window.addEventListener('keydown', (e) => {
      if (this.hud.safehouseOpen) {
        if (e.code === 'ArrowRight' || e.code === 'KeyD') this.browse((this.browsing + 1) % CREW.length);
        else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.browse((this.browsing - 1 + CREW.length) % CREW.length);
        else if (e.code === 'Enter') this.pick();
        else if (e.code === 'Escape' || e.code === 'KeyH') this.closeSafehouse();
        return;
      }
      if (e.code === 'KeyH' && this.renderer.ready && !this.driving && !this.down) {
        this.openSafehouse();
        return;
      }
      if (e.code === 'KeyF' && this.playing && !this.down) this.toggleCar();
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

  // ─── The Safehouse: choose who to play ────────────────────────────────────────────────────

  private crewEntries(): CrewEntry[] {
    const open = new Set(unlocked(this.wavesCleared).map((c) => c.id));
    return CREW.map((c) => ({
      name: c.name,
      alias: c.alias,
      role: c.role,
      bio: c.bio,
      perkName: c.perk ? PERKS[c.perk].name : '',
      perkText: c.perk ? PERKS[c.perk].text : '',
      unlocked: open.has(c.id),
      lockText: `clear ${c.unlockAt} wave${c.unlockAt === 1 ? '' : 's'}`,
      current: c.id === this.crew.id
    }));
  }

  private openSafehouse(): void {
    if (!this.renderer.ready) return;
    this.browsing = CREW.findIndex((c) => c.id === this.crew.id);
    void document.exitPointerLock?.();
    this.playing = false;
    this.renderer.showroomOpen = true;
    this.hud.showSafehouse(true);
    this.browse(this.browsing);
  }

  private browse(index: number): void {
    this.browsing = index;
    this.hud.setSafehouse(this.crewEntries(), index);
    void this.renderer.showroom.show(CREW[index]);
  }

  private pick(): void {
    const def = CREW[this.browsing];
    if (!unlocked(this.wavesCleared).some((c) => c.id === def.id)) return;
    if (def.id !== this.crew.id) {
      this.crew = def;
      save(CREW_KEY, def.id);
      void this.renderer.setHero(def);
      this.applyPerks();
      this.hud.feed(`Playing as ${def.name} · ${def.perk ? PERKS[def.perk].name : ''}`);
    }
    this.closeSafehouse();
    this.capture();
  }

  private closeSafehouse(): void {
    this.renderer.showroomOpen = false;
    this.hud.showSafehouse(false);
    this.hud.showCard(!this.playing, this.started);
  }

  /** The current crew member's perk, applied to the guns, the fight and the cars. */
  private applyPerks(): void {
    const e = perkEffects(this.crew.perk);
    this.perks = e;
    this.arsenal.reloadScale = e.reloadTime;
    const c = this.combat;
    c.armorMax = e.armorMax;
    c.armor = Math.min(c.armor, e.armorMax);
    if (e.armorMax > 50) c.armor = e.armorMax;
    c.regenCap = e.regenCap;
    c.headshotScale = e.headshot;
    c.closeScale = e.closeDamage;
    c.spotScale = e.spotDelay;
    for (const v of this.vehicles) {
      v.speedScale = e.carSpeed;
      v.damageScale = e.carDamage;
    }
    if (e.bonusAmmo) for (const id of LOADOUT) this.arsenal.addAmmo(id, WEAPONS[id].magazine);
  }

  /** Nearest car within reach of the hero, or null. */
  private carNearHero(): Vehicle | null {
    let best: Vehicle | null = null;
    let bestD = 3.2;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.x - this.hero.x, v.z - this.hero.z);
      if (d < bestD) {
        best = v;
        bestD = d;
      }
    }
    return best;
  }

  /** F: get into the nearest car, or out of this one (on the driver's side, or the other if blocked). */
  private toggleCar(): void {
    const r = this.renderer;
    if (this.driving) {
      const car = this.driving;
      if (Math.abs(car.forwardSpeed) > 6) return;
      const rx = Math.cos(car.heading);
      const rz = -Math.sin(car.heading);
      for (const side of [-1, 1]) {
        const x = car.x + rx * side * 1.7;
        const z = car.z + rz * side * 1.7;
        const blocked = this.district.colliders.some((b) => b.height > 0.4 && x > b.minX - 0.4 && x < b.maxX + 0.4 && z > b.minZ - 0.4 && z < b.maxZ + 0.4);
        if (blocked) continue;
        this.hero.place(x, z, car.heading);
        break;
      }
      car.occupied = false;
      this.driving = null;
      r.driving = null;
      this.hud.feed('On foot');
      return;
    }
    const car = this.carNearHero();
    if (!car || car.health <= 0) return;
    car.occupied = true;
    this.driving = car;
    r.driving = car;
    // Look down the road the car is facing.
    r.yaw = car.heading + Math.PI;
    r.pitch = -0.08;
    this.hud.feed(`${car.spec.model.replace(/(\d)/, ' $1')} · F to get out`);
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
    // Waking up in hospital wipes the slate, as in GTA.
    this.life.heat = 0;
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

    this.clock += dt;
    if (i.getAxis(InputAction.LOOK_X) !== 0 || i.getAxis(InputAction.LOOK_Y) !== 0) this.mouseMovedAt = this.clock;
    if (active) {
      r.yaw -= i.getAxis(InputAction.LOOK_X) * MOUSE_SENSITIVITY;
      r.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, r.pitch - i.getAxis(InputAction.LOOK_Y) * MOUSE_SENSITIVITY));
      if (i.isJustPressed(InputAction.VIEW_TOGGLE)) r.view = r.view === 'third' ? 'first' : 'third';
      if (i.isJustPressed(InputAction.RESTART)) this.arsenal.reload();
    } else if (this.down && i.isJustPressed(InputAction.RESTART)) this.respawn();
    r.aiming = active && i.isPressed(InputAction.ITEM);
    r.aimFov = WEAPONS[this.arsenal.current].aimFov;

    // Driving: WASD drive the car, Space is the handbrake, and the camera settles behind the car
    // unless the mouse has just looked around.
    const car = this.driving;
    const drive = this.drive;
    drive.throttle = car && active ? (i.isPressed(InputAction.MOVE_FORWARD) ? 1 : 0) - (i.isPressed(InputAction.MOVE_BACKWARD) ? 1 : 0) : 0;
    drive.steer = car && active ? (i.isPressed(InputAction.STRAFE_RIGHT) ? 1 : 0) - (i.isPressed(InputAction.STRAFE_LEFT) ? 1 : 0) : 0;
    drive.handbrake = !!car && active && i.isPressed(InputAction.JUMP);
    if (car && this.clock - this.mouseMovedAt > 1.2) {
      const behind = car.heading + Math.PI;
      const d = Math.atan2(Math.sin(behind - r.yaw), Math.cos(behind - r.yaw));
      r.yaw += d * (1 - Math.exp(-3 * dt));
      r.pitch += (-0.1 - r.pitch) * (1 - Math.exp(-3 * dt));
    }

    const intent = this.intent;
    intent.forward = active && !car ? (i.isPressed(InputAction.MOVE_FORWARD) ? 1 : 0) - (i.isPressed(InputAction.MOVE_BACKWARD) ? 1 : 0) : 0;
    intent.right = active && !car ? (i.isPressed(InputAction.STRAFE_RIGHT) ? 1 : 0) - (i.isPressed(InputAction.STRAFE_LEFT) ? 1 : 0) : 0;
    intent.cameraYaw = r.yaw;
    intent.sprint = active && !car && i.isPressed(InputAction.DASH) && !r.aiming;
    intent.jumpPressed = active && !car && i.isJustPressed(InputAction.JUMP);
    intent.faceCamera = r.aiming || r.view === 'first' || r.sinceFired < 0.6;
    const trigger = active && !car && (i.isPressed(InputAction.FIRE) || i.isJustPressed(InputAction.FIRE));

    const slow = r.aiming && this.perks.bulletTimeWhenAiming ? 0.45 : 1;
    this.timeScale += (slow - this.timeScale) * (1 - Math.exp(-10 * dt));
    this.audio.setSlowmo((1 - this.timeScale) / 0.55);
    if (car && this.perks.carRepair && car.health > 0) car.health = Math.min(100, car.health + 2 * dt);
    this.accumulator += dt * this.timeScale;
    while (this.accumulator >= TICK) {
      this.stepCars();
      this.hero.step(intent, TICK);
      if (car) {
        // The hero rides along: enemies aim at the car, and its speed makes it hard to hit.
        this.hero.x = car.x;
        this.hero.z = car.z;
        this.hero.vx = car.vx;
        this.hero.vz = car.vz;
        this.hero.facing = car.heading;
      }
      for (const fx of this.hero.fx) r.heroEvent(fx);
      intent.jumpPressed = false;
      this.stepGuns(trigger);
      this.stepCombat();
      this.stepLife();
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
    this.hud.setVitals(this.combat.hp, (this.combat.armor / Math.max(HERO_MAX_ARMOR, this.combat.armorMax)) * 50);
    this.hud.setEnemies(this.combat.alive);
    this.hud.setView(r.view === 'first');
    const moving = Math.min(1, this.hero.speed / 4.6);
    const spread = w.spread * (r.aiming ? w.aimSpread : 1) + w.moveSpread * moving + (this.hero.grounded ? 0 : 0.05);
    this.hud.setCrosshair(active, spread, r.camera.fov);
    r.combatView?.reloading(a.reloadProgress);

    this.audio.update(car ? Math.abs(car.forwardSpeed) : 0, car ? Math.abs(car.forwardSpeed) / car.spec.maxSpeed : 0, drive.handbrake, null);
    this.hud.setVehicle(car ? { speed: Math.abs(car.forwardSpeed), health: car.health } : null, !car && active && !!this.carNearHero());
    this.hud.setHeat(this.life.stars);
    r.render(this.hero, dt, this.combat, this.vehicles, this.life);
    i.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  private stepCars(): void {
    for (const v of this.vehicles) {
      v.step(v === this.driving ? this.drive : { throttle: 0, steer: 0, handbrake: true }, TICK);
      for (const fx of v.fx) {
        if (fx.type === 'crash') {
          this.renderer.vehicleView?.crash(fx.x, fx.z, fx.impact);
          if (v === this.driving) {
            this.renderer.punchPitch += Math.min(0.08, fx.impact * 0.004);
            this.play('crash', fx.x, fx.z);
          }
        } else if (fx.type === 'wrecked') {
          this.hud.feed('Car wrecked');
          this.play('explode', v.x, v.z);
        }
      }
    }
    for (let a = 0; a < this.vehicles.length; a++) {
      for (let b = a + 1; b < this.vehicles.length; b++) {
        const va = this.vehicles[a];
        const vb = this.vehicles[b];
        if (Math.abs(va.x - vb.x) > 6 || Math.abs(va.z - vb.z) > 6) continue;
        const impact = separate(va, vb);
        if (impact > 4 && (va === this.driving || vb === this.driving)) {
          this.play('crash', va.x, va.z);
          this.renderer.vehicleView?.crash((va.x + vb.x) / 2, (va.z + vb.z) / 2, impact);
        }
      }
    }
    // Cars are cover: bullets stop at them, both ways (not the one being driven).
    const cover = this.combat.cover;
    cover.length = 0;
    for (const v of this.vehicles) {
      if (v === this.driving) continue;
      cover.push(coverBox(v, { minX: 0, maxX: 0, minZ: 0, maxZ: 0, height: 0 }));
    }
    const car = this.driving;
    if (car) {
      const [ax, az, bx, bz] = car.circles();
      const speed = Math.abs(car.forwardSpeed);
      const hits =
        this.combat.runOver(ax, az, car.spec.radius, speed) +
        this.combat.runOver(bx, bz, car.spec.radius, speed) +
        this.life.runOver(ax, az, car.spec.radius, speed) +
        this.life.runOver(bx, bz, car.spec.radius, speed);
      if (hits > 0) this.renderer.punchPitch += 0.03;
    }
  }

  /** Citizens walk and panic; HEAT brings the police, and cooling it sends them home. */
  private stepLife(): void {
    const life = this.life;
    life.step(TICK, this.combat.policeWatching);
    for (const fx of life.fx) {
      if (fx.type === 'citizenDown') {
        this.hud.feed(fx.byCar ? 'Pedestrian hit · HEAT rises' : 'Civilian down · HEAT rises');
        this.renderer.combatView?.impact(fx.citizen.x, 1, fx.citizen.z, true);
      }
    }
    const wanted = Math.min(8, life.stars * 2);
    if (life.stars === 0) {
      if (this.combat.policeOnScene > 0) {
        this.combat.standDownPolice();
        this.hud.feed('Heat is off');
      }
      return;
    }
    this.policeTimer -= TICK;
    if (this.policeTimer > 0 || this.combat.policeOnScene >= wanted) return;
    this.policeTimer = 2.5;
    // Police arrive down the nearest road, from behind the camera's view where possible.
    const P = this.district.pitch;
    const b = this.district.bounds;
    const behind = this.renderer.yaw;
    let x = this.hero.x + Math.sin(behind) * 34;
    let z = this.hero.z + Math.cos(behind) * 34;
    x = Math.max(b.minX + 2, Math.min(b.maxX - 2, x));
    z = Math.max(b.minZ + 2, Math.min(b.maxZ - 2, z));
    // Snap onto the nearest road centre line.
    const rx = Math.round(x / P) * P;
    const rz = Math.round(z / P) * P;
    if (Math.abs(x - rx) < Math.abs(z - rz)) x = rx;
    else z = rz;
    this.combat.spawn('police', x, z, Math.atan2(this.hero.x - x, this.hero.z - z));
    if (this.combat.policeOnScene === 1) this.hud.banner('Police', `${life.stars} star${life.stars === 1 ? '' : 's'} of heat · lose them, or hold them off`);
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
    // Bystanders: a shot that reaches a citizen before anything else hits them.
    result.shots.forEach((shot, n) => {
      const [dx, dy, dz] = direction(r.yaw + shot.yaw, r.pitch + shot.pitch);
      const who = this.life.trace(cam.x, cam.y, cam.z, dx, dy, dz);
      if (who.citizen && who.distance >= minDistance && who.distance < hits[n].distance) {
        this.life.hurt(who.citizen, false);
        hits[n] = { kind: 'world', distance: who.distance, x: cam.x + dx * who.distance, y: cam.y + dy * who.distance, z: cam.z + dz * who.distance };
        r.combatView?.impact(hits[n].x, hits[n].y, hits[n].z, true);
      }
    });
    this.life.gunshot(this.hero.x, this.hero.z);
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
          this.life.gunshot(fx.enemy.motor.x, fx.enemy.motor.z);
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
          if (this.driving) {
            // The car's body takes some of it.
            c.hp = Math.min(100, c.hp + fx.amount * 0.4);
            this.driving.health = Math.max(0, this.driving.health - fx.amount * 0.5);
          }
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
        case 'policeDown':
          this.life.raiseHeat(1);
          this.hud.feed('Officer down · HEAT rises');
          break;
        case 'pickup':
          this.hud.feed(`+${fx.rounds} ${WEAPONS[fx.weapon].name} rounds`);
          this.play('pickup', this.hero.x, 0);
          break;
        case 'waveClear': {
          const before = unlocked(this.wavesCleared).length;
          this.wavesCleared = Math.max(this.wavesCleared, fx.wave);
          save(PROGRESS_KEY, String(this.wavesCleared));
          const joined = unlocked(this.wavesCleared).slice(before);
          if (joined.length) {
            const j = joined[0];
            this.hud.banner(`${j.name} joins the crew`, `"${j.alias}" · ${j.perk ? PERKS[j.perk].text : ''} · press H at the Safehouse`);
          } else this.hud.banner('Intersection clear', `Wave ${fx.wave} down · next crew in ${NEXT_WAVE_DELAY} s`);
          this.play('itemGet', this.hero.x, 0);
          this.nextWaveIn = NEXT_WAVE_DELAY;
          break;
        }
      }
    }
  }
}
