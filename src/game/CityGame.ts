import * as THREE from 'three';
import { InputEngine } from '../input/InputEngine';
import { InputAction } from '../input/ActionTypes';
import { CityAudio } from '../audio/CityAudio';
import { buildDistrict, type District } from '../city/CityLayout';
import { HeroMotor, type HeroIntent } from '../city/HeroMotor';
import { Arsenal, LOADOUT, WEAPONS, type WeaponId } from '../city/Weapons';
import { Combat, HERO_MAX_ARMOR } from '../city/Combat';
import { Vehicle, VEHICLE_SPECS, separate, coverBox, type DriveIntent } from '../city/Vehicle';
import { CityLife } from '../city/CityLife';
import { direction } from '../city/Combat';
import { CHAPTER_ONE, JobRunner, COIN_REACH, type Job, type Panel } from '../city/Jobs';
import { CityJobUI, type Blip, type StoryPanel } from '../ui/CityJobUI';

const CHAPTER_KEY = 'vorixa.city.chapter';
const CASH_KEY = 'vorixa.city.cash';

function loadNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

/** A readable accent for a speaker's panel, from the brightest colour in their palette. */
function accentOf(palette: Record<string, number>): string {
  let best = 0x3fd8ff;
  let bestLight = -1;
  for (const [name, hex] of Object.entries(palette)) {
    if (/skin|hair|black|white|eye/i.test(name)) continue;
    const r = (hex >> 16) & 255;
    const g = (hex >> 8) & 255;
    const b = hex & 255;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma > bestLight) {
      bestLight = chroma;
      best = hex;
    }
  }
  return `#${best.toString(16).padStart(6, '0')}`;
}
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
  private readonly audio = new CityAudio();
  private stride = 0;
  private lastStars = 0;
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
  private readonly jobUI: CityJobUI;
  private chapter = loadNumber(CHAPTER_KEY);
  private cash = loadNumber(CASH_KEY);
  private runner: JobRunner | null = null;
  /** What happens when the storyboard on screen is closed. */
  private afterStory: (() => void) | null = null;
  private briefingDue = true;
  private jobCar: Vehicle | null = null;
  private coins: { x: number; y: number; z: number; taken: boolean }[] = [];
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
    this.jobUI = new CityJobUI(container.querySelector<HTMLElement>('#rush-hud.city') ?? container);
    this.jobUI.onContinue = () => this.continueStory();
    this.jobUI.onRetry = () => this.retryJob();
    this.jobUI.setCash(this.cash);
    this.hud.onPlay = () => this.capture();
    this.hud.onRespawn = () => this.respawn();
    this.hud.onBack = () => {
      const url = new URL(window.location.href);
      url.searchParams.set('mode', 'rush');
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
      if (this.jobUI.storyOpen) {
        if (e.code === 'Space' || e.code === 'Enter') this.continueStory();
        return;
      }
      if (this.jobUI.failOpen) {
        if (e.code === 'KeyR' || e.code === 'Enter') this.retryJob();
        return;
      }
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
        this.applyLook();
        // The chapter first; once it is done, the turf war never stops.
        if (!this.currentJob) {
          this.briefingDue = false;
          this.startWave();
        }
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
    if (this.briefingDue && this.currentJob) {
      this.briefingDue = false;
      void this.openBriefing(this.currentJob);
      return;
    }
    if (this.jobUI.storyOpen || this.jobUI.failOpen) return;
    this.started = true;
    // Some browsers refuse pointer lock (and say so by rejecting); the game still works.
    Promise.resolve(this.canvas.requestPointerLock?.()).catch(() => {});
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

  // ─── The story: jobs and storyboards ─────────────────────────────────────────────────────

  private get currentJob(): Job | null {
    return CHAPTER_ONE[this.chapter] ?? null;
  }

  private async panelsFor(lines: readonly Panel[]): Promise<StoryPanel[]> {
    const out: StoryPanel[] = [];
    for (const p of lines) {
      if (p.speaker === 'choir') {
        out.push({ name: 'The Choir', alias: '', line: p.line, portrait: null, accent: '#b01828', villain: true });
        continue;
      }
      const def = CREW.find((c) => c.id === p.speaker) ?? CREW[0];
      const portrait = await this.renderer.portrait(def).catch(() => null);
      out.push({ name: def.name, alias: def.alias, line: p.line, portrait, accent: accentOf(def.palette), villain: false });
    }
    return out;
  }

  private async openStory(kicker: string, title: string, lines: readonly Panel[], after: () => void): Promise<void> {
    void document.exitPointerLock?.();
    this.playing = false;
    this.hud.showCard(false);
    this.afterStory = after;
    this.jobUI.showStory(kicker, title, await this.panelsFor(lines));
  }

  private openBriefing(job: Job): Promise<void> {
    return this.openStory(`Chapter 1 · Job ${this.chapter + 1} of ${CHAPTER_ONE.length}`, job.title, job.briefing, () => this.startJob(job));
  }

  private continueStory(): void {
    if (this.jobUI.reveal()) return;
    this.jobUI.closeStory();
    const after = this.afterStory;
    this.afterStory = null;
    after?.();
    this.capture();
  }

  private startJob(job: Job): void {
    this.runner = new JobRunner(job);
    this.runner.start();
    this.handleJobEvents();
    this.hud.banner(job.title, job.steps[0].text);
  }

  private retryJob(): void {
    this.jobUI.showFail(false);
    this.combat.clearChoir();
    this.combat.standDownPolice();
    this.life.heat = 0;
    this.coins = [];
    this.renderer.jobView.setCoins([]);
    if (this.jobCar && this.jobCar !== this.driving) {
      this.vehicles.splice(this.vehicles.indexOf(this.jobCar), 1);
      this.jobCar = null;
    }
    if (this.down) {
      this.downFor = 99;
      this.respawn();
    }
    const job = this.currentJob;
    if (job) this.startJob(job);
    this.capture();
  }

  private failJob(reason: string): void {
    if (!this.runner) return;
    this.runner = null;
    this.renderer.jobView.setTarget(null);
    this.jobUI.setObjective(null);
    void document.exitPointerLock?.();
    this.jobUI.showFail(true, 'Job failed', reason);
    this.audio.cue('fail');
  }

  private completeJob(cash: number): void {
    const job = this.currentJob!;
    this.runner = null;
    this.cash += cash;
    save(CASH_KEY, String(this.cash));
    this.jobUI.setCash(this.cash);
    this.chapter++;
    save(CHAPTER_KEY, String(this.chapter));
    this.renderer.jobView.setTarget(null);
    this.jobUI.setObjective(null);
    this.coins = [];
    this.renderer.jobView.setCoins([]);
    const paid = '+$' + cash.toLocaleString('en-US');
    this.hud.banner('Job complete', job.title + ' · ' + paid);
    this.audio.cue('complete');
    void this.openStory(job.title + ' · complete', paid, job.outro, () => {
      const next = this.currentJob;
      if (next) void this.openBriefing(next);
      else {
        this.hud.banner('Chapter 1 complete', 'Downtown is yours. The Choir keeps coming: turf war');
        this.startWave();
      }
    });
  }

  private handleJobEvents(): void {
    const r = this.runner;
    if (!r) return;
    for (const e of [...r.events]) {
      switch (e.type) {
        case 'placeCar': {
          // Clear the kerb, then park the target car.
          for (let i = this.vehicles.length - 1; i >= 0; i--) {
            const v = this.vehicles[i];
            if (v !== this.driving && Math.hypot(v.x - e.x, v.z - e.z) < 6) this.vehicles.splice(i, 1);
          }
          const car = new Vehicle(1000 + this.chapter, VEHICLE_SPECS[e.model], this.district.colliders, this.district.bounds).place(e.x, e.z, e.heading);
          car.speedScale = this.perks.carSpeed;
          car.damageScale = this.perks.carDamage;
          this.vehicles.push(car);
          this.jobCar = car;
          break;
        }
        case 'spawnCrew':
          this.combat.spawnWave(e.x, e.z, e.count);
          break;
        case 'setHeat':
          this.life.heat = e.stars;
          this.life.raiseHeat(0);
          break;
        case 'placeCoins':
          this.coins = e.coins.map((c) => ({ ...c, taken: false }));
          this.renderer.jobView.setCoins(this.coins);
          break;
        case 'spawnBoss':
          this.combat.spawn('boss', e.x, e.z, Math.atan2(this.hero.x - e.x, this.hero.z - e.z));
          this.combat.spawnWave(e.x, e.z, e.guards);
          this.hud.banner('Cantor', 'Plated. Aim for the head');
          break;
        case 'step':
          if (e.index > 0) {
            this.hud.feed(`Objective: ${e.text}`);
            this.audio.cue('objective');
          }
          break;
        case 'complete':
          this.completeJob(e.cash);
          return;
        case 'failed':
          this.failJob(e.reason);
          return;
      }
    }
  }

  private stepJob(dt: number): void {
    const r = this.runner;
    if (!r) return;
    // Stars: collected by touching them (from the middle of the hero).
    for (const c of this.coins) {
      if (c.taken) continue;
      if (Math.hypot(this.hero.x - c.x, this.hero.y + 1 - c.y, this.hero.z - c.z) < COIN_REACH + 0.25) {
        c.taken = true;
        this.renderer.jobView.setCoins(this.coins);
        this.hud.feed(`★ ${this.coins.filter((k) => k.taken).length} / ${this.coins.length}`, true);
        this.audio.cue('star');
      }
    }
    r.update(
      {
        heroX: this.hero.x,
        heroZ: this.hero.z,
        driving: this.driving?.spec.model ?? null,
        inJobCar: !!this.jobCar && this.driving === this.jobCar,
        choirAlive: this.combat.alive,
        stars: this.life.stars,
        coinsTaken: this.coins.filter((c) => c.taken).length,
        bossAlive: this.combat.bossAlive
      },
      dt
    );
    this.handleJobEvents();
    const s = r.current;
    if (!s || !this.runner) return;
    const t = r.target;
    this.renderer.jobView.setTarget(t);
    let meta = '';
    if (t) meta = `${Math.round(Math.hypot(t.x - this.hero.x, t.z - this.hero.z))} m`;
    if (s.kind === 'clear' || s.kind === 'boss') meta = `${this.combat.alive} left${this.combat.bossAlive ? ` · Cantor ${Math.max(0, Math.round(this.combat.boss!.hp))} HP` : ''}`;
    if (s.kind === 'escape') meta = this.combat.policeWatching ? 'They can see you: break line of sight' : 'Out of sight: stay hidden';
    if (s.kind === 'collect') meta = `${this.coins.filter((c) => c.taken).length} / ${this.coins.length} stars`;
    this.jobUI.setObjective(`Job ${this.chapter + 1} · ${r.job.title}`, s.text, meta, r.timeLeft);
  }

  private drawRadar(): void {
    const blips: Blip[] = [];
    for (const e of this.combat.enemies) {
      if (e.state === 'dead') continue;
      blips.push({ x: e.motor.x, z: e.motor.z, kind: e.kind === 'police' ? 'police' : e.kind === 'boss' ? 'boss' : 'enemy' });
    }
    for (const c of this.coins) if (!c.taken) blips.push({ x: c.x, z: c.z, kind: 'coin' });
    const t = this.runner?.target;
    if (t) blips.push({ x: t.x, z: t.z, kind: 'objective' });
    this.jobUI.drawRadar(this.hero.x, this.hero.z, this.renderer.yaw, { pitch: this.district.pitch, count: this.district.roadsX }, blips);
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

  /** The first-person arms wear the current crew member's skin and sleeves. */
  private applyLook(): void {
    const palette = this.crew.palette;
    const sleeve = Object.entries(palette).find(([name]) => !/skin|hair|eye|brow|moustache|gold|earring/i.test(name));
    this.renderer.combatView?.setArmColours(palette.Skin ?? 0xd8a67c, sleeve ? sleeve[1] : 0x3a3f4a);
  }

  /** The current crew member's perk, applied to the guns, the fight and the cars. */
  private applyPerks(): void {
    this.applyLook();
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
    const job = this.currentJob;
    if (job && !this.runner) {
      this.combat.clearChoir();
      this.coins = [];
      this.renderer.jobView.setCoins([]);
      this.startJob(job);
    }
    this.capture();
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
      if (i.isJustPressed(InputAction.MUTE_TOGGLE)) this.hud.feed(this.audio.toggleMute() ? 'Sound off (M)' : 'Sound on (M)');
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
    r.reloadProgress = a.reloadProgress;
    if (r.combatView) r.combatView.holstered = !!this.driving;

    this.stepSound(dt, car, drive.throttle);
    this.hud.setVehicle(car ? { speed: Math.abs(car.forwardSpeed), health: car.health } : null, !car && active && !!this.carNearHero());
    this.hud.setHeat(this.life.stars);
    // The objective panel shows even while paused; the job only advances in play.
    this.stepJob(active ? dt : 0);
    this.drawRadar();
    r.render(this.hero, dt, this.combat, this.vehicles, this.life);
    i.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Listener, engine, tyres, siren, footsteps and the heat alarm, once a frame. */
  private stepSound(dt: number, car: Vehicle | null, throttle: number): void {
    const a = this.audio;
    a.setListener(this.hero.x, this.hero.z, this.renderer.yaw);
    a.setEngine(car ? { speedT: Math.abs(car.forwardSpeed) / (car.spec.maxSpeed * car.speedScale), throttle: Math.abs(throttle), slip: car.slip } : null);
    let nearest: { x: number; z: number } | null = null;
    let best = Infinity;
    for (const e of this.combat.enemies) {
      if (e.kind !== 'police' || e.state === 'dead') continue;
      const d = Math.hypot(e.motor.x - this.hero.x, e.motor.z - this.hero.z);
      if (d < best) {
        best = d;
        nearest = { x: e.motor.x, z: e.motor.z };
      }
    }
    a.setSiren(nearest, dt);
    // Footsteps, one per stride.
    if (!car && this.hero.grounded && this.hero.speed > 0.6) {
      this.stride += this.hero.speed * dt;
      const length = this.hero.speed > 5 ? 1.7 : 1.1;
      if (this.stride > length) {
        this.stride = 0;
        a.footstep(this.hero.x, this.hero.z, this.hero.speed > 5);
      }
    }
    if (this.life.stars > this.lastStars) a.cue('heat');
    this.lastStars = this.life.stars;
  }

  private stepCars(): void {
    for (const v of this.vehicles) {
      v.step(v === this.driving ? this.drive : { throttle: 0, steer: 0, handbrake: true }, TICK);
      for (const fx of v.fx) {
        if (fx.type === 'crash') {
          this.renderer.vehicleView?.crash(fx.x, fx.z, fx.impact);
          if (v === this.driving) {
            this.renderer.punchPitch += Math.min(0.08, fx.impact * 0.004);
            this.audio.crash(fx.x, fx.z, fx.impact);
          }
        } else if (fx.type === 'wrecked') {
          this.hud.feed('Car wrecked');
          this.audio.explosion(v.x, v.z);
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
          this.audio.crash(va.x, va.z, impact);
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
      if (ev === 'dry') this.audio.dryClick();
      if (ev === 'reloadStart') this.audio.reload('start');
      if (ev === 'reloadEnd') this.audio.reload('end');
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
    this.audio.gunshot(a.current, this.hero.x, this.hero.z, true);
    for (const h of hits) if (h.kind === 'world') this.audio.impact(h.x, h.z, false);
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
          this.audio.gunshot(fx.enemy.kind === 'swat' ? 'smg' : fx.enemy.kind === 'police' ? 'pistol' : 'rifle', fx.enemy.motor.x, fx.enemy.motor.z, false);
          break;
        case 'enemyHurt':
          view?.impact(fx.x, fx.y, fx.z, true);
          this.hud.hitMarker(false);
          this.audio.impact(fx.x, fx.z, true);
          this.audio.cue('hit');
          break;
        case 'enemyKilled':
          this.hud.hitMarker(true);
          this.hud.feed(fx.headshot ? 'Headshot' : 'Enemy down', fx.headshot);
          this.audio.cue('kill');
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
          this.audio.impact(this.hero.x, this.hero.z, true);
          break;
        }
        case 'heroDown':
          if (this.runner) {
            this.runner = null;
            this.renderer.jobView.setTarget(null);
            this.jobUI.setObjective(null);
          }
          this.down = true;
          this.downFor = 0;
          this.hud.showDown(true, `${c.kills} down · ${c.headshots} headshots · wave ${c.wave}`);
          void document.exitPointerLock?.();
          this.audio.cue('fail');
          break;
        case 'policeDown':
          this.life.raiseHeat(1);
          this.hud.feed('Officer down · HEAT rises');
          break;
        case 'pickup':
          this.hud.feed(`+${fx.rounds} ${WEAPONS[fx.weapon].name} rounds`);
          this.audio.cue('pickup');
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
          this.audio.cue('complete');
          // Waves roll on only in the turf war, after the chapter.
          if (!this.currentJob) this.nextWaveIn = NEXT_WAVE_DELAY;
          break;
        }
        case 'bossDown':
          this.hud.banner('Cantor is down', 'Finish his choir');
          break;
      }
    }
  }
}
