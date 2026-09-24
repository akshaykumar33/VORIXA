import { InputEngine } from '../input/InputEngine';
import { InputAction } from '../input/ActionTypes';
import { RushAudio } from '../audio/RushAudio';
import { FaceTracker } from '../input/FaceTracker';
import { HandTracker } from '../input/HandTracker';
import { RushSim, MAX_SPEED, START_SPEED, type RushPhase, type FxRecord } from '../rush/RushSim';
import { RushControls, type ControlSources } from '../rush/RushControls';
import { RushRenderer } from '../rendering/rush/RushRenderer';
import { RushHUD, type DeviceStatus } from '../ui/RushHUD';
import { BIOME_NAMES, ZONE_LENGTH, type BiomeId } from '../rush/Zones';
import { VEHICLES } from '../rendering/rush/Vehicles';
import { DrivingSchool, type SchoolTrack } from '../rush/DrivingSchool';
import { loadCalibration, saveCalibration, normalizeGaze, type GazeCalibration } from '../rush/Calibration';
import { CameraPreview, type PreviewReadout } from '../ui/CameraPreview';
import { TourUI } from '../ui/TourUI';
import { GarageUI } from '../ui/GarageUI';
import { loadLoadout, saveLoadout, statsFor, buyUpgrade, buyWeapon, equip, type Loadout } from '../rush/Garage';
import {
  TOUR,
  findStage,
  goalMet,
  goalText,
  nextStage,
  recordResult,
  saveProgress,
  loadProgress,
  starsFor,
  stageUnlocked,
  worldUnlocked,
  type StageDef,
  type TourProgress
} from '../rush/Tour';
import { LANE_WIDTH } from '../rush/RushSim';

/**
 * Runs Rush: input in, simulation stepped, effects fanned out to picture, sound and HUD.
 *
 * The simulation steps at a fixed 120 Hz like the parkour game, for the same reason: identical
 * behaviour at 60 Hz and 144 Hz, and effects that are raised per tick are read per tick so none
 * are lost when several ticks run in one frame.
 */

const TICK = 1 / 120;
const MAX_FRAME = 0.1;

/** Freeze frames on big impacts. Short enough to feel like weight, not like a stall. */
const HIT_STOP_CRASH = 0.09;
const HIT_STOP_KILL = 0.045;

/** A deliberate hard blink buys a moment of slow motion. */
const SLOWMO_SCALE = 0.4;
const SLOWMO_DURATION = 2.2;

/** Once over, input is ignored briefly so a held fire button does not skip the results. */
const RESTART_GRACE = 0.9;

/** The mouse stops owning the crosshair after this long without moving. */
const MOUSE_AIM_TIMEOUT = 4;

/** Words and colours for trick popups. */
const TRICK_POPUPS: Partial<Record<FxRecord['type'], { text: string; color: string }>> = {
  nearMiss: { text: 'CLOSE CALL!', color: '#3fa7ff' },
  shieldPop: { text: 'SHIELD SAVED YOU!', color: '#3ff7ff' },
  lightning: { text: 'ZAP!', color: '#ffd23f' },
  jumpOver: { text: 'JUMPED IT!', color: '#5ad16b' },
  flip: { text: 'FLIP!', color: '#ff5fa8' },
  sloppyLanding: { text: 'SLOPPY LANDING', color: '#ff4d5e' },
  takedown: { text: 'TAKEDOWN!', color: '#ffd23f' }
};

const BEST_KEY = 'vorixa.rush.best';
const VEHICLE_KEY = 'vorixa.rush.vehicle';

/** A signature colour per world, for the results card. */
const BIOME_COLORS: Record<BiomeId, string> = {
  meadow: '#5ad16b',
  desert: '#e8955a',
  snow: '#3fa7ff',
  candy: '#ff5fa8',
  neon: '#6a3aa8',
  beach: '#2ec4b6'
};

export class RushGame {
  private readonly input = new InputEngine();
  private readonly audio = new RushAudio();
  private readonly face = new FaceTracker();
  private readonly hand = new HandTracker();
  private readonly sim: RushSim;
  private readonly controls = new RushControls();
  private readonly hud: RushHUD;

  private gazeEnabled = false;
  private handEnabled = false;
  private running = false;
  /** Previous frame's rAF timestamp in seconds; negative until the first frame arrives. */
  private lastTime = -1;
  private accumulator = 0;
  private hitStop = 0;
  private slowmo = 0;
  private timeScale = 1;
  private overFor = 0;
  private best = 0;

  private mouseAimX = 0;
  private mouseMovedAt = -Infinity;
  private clock = 0;
  private readonly crosshair = { x: 0, y: 0 };
  private readonly sources: ControlSources = {
    leftPressed: false,
    rightPressed: false,
    jumpPressed: false,
    itemPressed: false,
    fireHeld: false,
    nitroHeld: false,
    mouseAimX: null,
    gaze: null,
    hand: null
  };
  private wasNitro = false;
  private lastPhase: RushPhase = 'ready';
  private lastLane = 0;
  private lastBiome: BiomeId = 'meadow';
  private vehicle = 0;
  private paused = false;

  private calibration: GazeCalibration = loadCalibration();
  private readonly calibratedGaze = { present: false, gazeX: 0 };
  private school: DrivingSchool | null = null;
  private pickerOpen = false;
  private readonly preview: CameraPreview;
  /** Effects counted over the current frame, for lessons. */
  private frameJumps = 0;
  private frameSmashes = 0;
  private frameItems = 0;
  private readonly tour: TourUI;
  private readonly shop: GarageUI;
  private loadout: Loadout = loadLoadout();
  private progress: TourProgress = loadProgress();
  /** The World Tour stage being played, or null on the endless road. */
  private stage: StageDef | null = null;
  private mapWorld = 0;
  private mapStop = 0;
  /** Mouse position in canvas pixels, or null before the mouse has moved. */
  private mouseScreenX: number | null = null;

  public constructor(
    private readonly renderer: RushRenderer,
    container: HTMLElement,
    seed: number,
    /** True when the player asked for a specific road; restarts then replay it. */
    private readonly fixedSeed = false
  ) {
    this.sim = new RushSim(seed);
    this.renderer.setSeed(seed);
    this.hud = new RushHUD(container);
    this.hud.onToggleGaze = () => void this.toggleGaze();
    this.hud.onToggleHand = () => void this.toggleHand();
    this.best = loadBest();
    this.hud.onCycleVehicle = (step) => this.cycleVehicle(step);
    this.hud.onRaceAgain = () => this.raceAgain();
    this.hud.onGarage = () => this.backToGarage();
    this.hud.onShare = () => void this.shareRoad();
    this.hud.onResume = () => this.setPaused(false);
    this.hud.onOpenSchool = () => this.openSchoolPicker();
    this.hud.onPickTrack = (track) => this.startSchool(track);
    this.hud.onCloseSchool = () => this.backToGarage();
    this.hud.onSkipLesson = () => this.school?.skip();
    const hudRoot = container.querySelector<HTMLElement>('#rush-hud') ?? container;
    this.preview = new CameraPreview(hudRoot);
    this.tour = new TourUI(hudRoot);
    this.shop = new GarageUI(hudRoot);
    this.shop.onBuyUpgrade = (id) => this.spend(buyUpgrade(this.loadout, id, this.progress.bank));
    this.shop.onBuyWeapon = (id) => this.spend(buyWeapon(this.loadout, id, this.progress.bank));
    this.shop.onEquip = (id) => {
      equip(this.loadout, id);
      this.spend(0);
    };
    this.shop.onClose = () => this.closeShop();
    this.sim.car = statsFor(this.loadout);
    this.sim.reset();
    this.tour.onMenu = (choice) => {
      if (choice === 'garage') this.openShop();
      else if (choice === 'tour') this.openMap();
      else if (choice === 'school') this.openSchoolPicker();
      else if (this.sim.phase === 'ready') this.sim.start();
    };
    this.tour.onPlay = (id) => this.playStage(id);
    this.tour.onSelect = (world, stop) => this.selectOnMap(world, stop);
    this.tour.onMapBack = () => this.closeMap();
    this.tour.onNext = () => this.playNext();
    this.tour.onRetry = () => this.stage && this.playStage(this.stage.id);
    this.tour.onToMap = () => this.openMap(this.stage?.world);
    // Switching tabs mid-run pauses rather than letting the car drive blind. Window blur is not
    // used: the browser's own camera-permission prompt blurs the window, and pausing the game
    // at the very moment a player turns on eye control made the feature look broken.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.setPaused(true);
    });
    this.vehicle = loadVehicle();
    this.cycleVehicle(0);

    window.addEventListener('pointermove', (e) => {
      const canvas = document.getElementById('render-canvas');
      const left = canvas ? canvas.getBoundingClientRect().left : 0;
      this.mouseScreenX = e.clientX - left;
      this.mouseMovedAt = this.clock;
    });
    // Any press is also the gesture browsers require before audio may play.
    const unlock = () => void this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(nowMs: number): void {
    if (!this.running) return;
    const now = nowMs / 1000;
    // rAF timestamps are the frame's start time and can lag performance.now(), so the clock is
    // seeded from the first frame itself — mixing the two clocks produced a negative first delta
    // that froze the simulation for seconds. Clamped at zero for the same reason.
    const frameDelta = this.lastTime < 0 ? 0 : Math.max(0, Math.min(now - this.lastTime, MAX_FRAME));
    this.lastTime = now;
    this.clock += frameDelta;

    this.handleMetaKeys();
    if (this.paused) {
      // Frozen, but still drawn: the paused frame stays on screen behind the card.
      this.renderer.render(this.sim, this.controls.intent.aimX, 0);
      this.input.endFrame();
      requestAnimationFrame((t) => this.frame(t));
      return;
    }
    const gaze = this.gazeEnabled && this.face.isRunning ? this.face.update() : null;
    const hand = this.handEnabled && this.hand.isRunning ? this.hand.update() : null;
    // Slow motion: a hard blink, or a peace sign for hand players.
    if ((gaze?.dilationStarted || hand?.vSignStarted) && this.slowmo <= 0) {
      this.slowmo = SLOWMO_DURATION;
      this.audio.slowmoStart();
    }

    // The crosshair sits exactly under the mouse: the aim is solved from the cursor's screen x.
    if (this.mouseScreenX !== null) this.mouseAimX = this.renderer.aimForScreenX(this.mouseScreenX);

    const src = this.sources;
    src.leftPressed = this.input.isJustPressed(InputAction.STRAFE_LEFT);
    src.rightPressed = this.input.isJustPressed(InputAction.STRAFE_RIGHT);
    src.jumpPressed =
      this.input.isJustPressed(InputAction.JUMP) || this.input.isJustPressed(InputAction.MOVE_FORWARD);
    src.fireHeld = this.input.isPressed(InputAction.FIRE);
    src.itemPressed = this.input.isJustPressed(InputAction.ITEM);
    src.nitroHeld = this.input.isPressed(InputAction.DASH);
    src.mouseAimX = this.clock - this.mouseMovedAt < MOUSE_AIM_TIMEOUT ? this.mouseAimX : null;
    // Gaze steers against this player's calibration, not a fixed threshold.
    if (gaze) {
      this.calibratedGaze.present = gaze.present;
      this.calibratedGaze.gazeX = normalizeGaze(gaze.gazeX, this.calibration);
    }
    src.gaze = gaze ? this.calibratedGaze : null;
    src.face = gaze?.present ? this.face.commands : null;
    src.hand = hand;
    const intent = this.controls.resolve(src);
    if (this.pickerOpen || this.tour.mapOpen || this.tour.resultOpen || this.shop.open) {
      // Choosing a lesson or a stage must not start a race behind the menu.
      intent.jump = intent.fire = intent.nitro = intent.useItem = false;
      intent.lane = this.sim.lane;
      this.controls.lane = this.sim.lane;
    }
    this.frameJumps = 0;
    this.frameSmashes = 0;
    this.frameItems = 0;

    if (this.sim.phase === 'over' && !this.stage) {
      this.overFor += frameDelta;
      // The grace period stops a held fire button or a panicked jump from skipping the results.
      const wantsAgain =
        this.input.isJustPressed(InputAction.RESTART) || (this.overFor > RESTART_GRACE && intent.jump);
      if (wantsAgain) this.raceAgain();
    } else if (this.input.isJustPressed(InputAction.RESTART) && this.sim.phase === 'running') {
      this.raceAgain();
    }

    // Slow motion eases in and out rather than switching, which reads as a hitch.
    this.slowmo = Math.max(0, this.slowmo - frameDelta);
    const targetScale = this.slowmo > 0 ? SLOWMO_SCALE : 1;
    this.timeScale += (targetScale - this.timeScale) * (1 - Math.exp(-8 * frameDelta));
    this.audio.setSlowmo((1 - this.timeScale) / (1 - SLOWMO_SCALE));

    if (this.hitStop > 0) {
      this.hitStop -= frameDelta;
    } else {
      this.accumulator += frameDelta * this.timeScale;
      let first = true;
      while (this.accumulator >= TICK) {
        this.sim.update(intent, TICK);
        this.consumeEffects();
        if (first) {
          // Edges belong to the first tick of the frame; repeating them would jump twice.
          intent.jump = false;
          intent.useItem = false;
          first = false;
        }
        this.accumulator -= TICK;
        if (this.hitStop > 0) {
          this.accumulator = 0;
          break;
        }
      }
    }

    this.updateAudio();
    if (this.school) this.stepSchool(frameDelta, intent.fire, gaze, hand);
    document.body.classList.toggle('racing', this.sim.phase === 'running' && !this.paused);

    this.renderer.render(this.sim, intent.aimX, frameDelta);
    const biome = this.renderer.biome;
    if (biome !== this.lastBiome) {
      this.lastBiome = biome;
      if (this.sim.phase === 'running') this.hud.banner(BIOME_NAMES[biome]);
    }
    this.updateHud(intent.aimX, gaze?.present ? this.calibratedGaze.gazeX : hand?.present ? hand.steerX : null);
    this.updatePreview(gaze, hand);
    this.updateStageHud();
    this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Cars can only be changed in the garage, on the title screen. */
  private cycleVehicle(step: number): void {
    if (this.sim.phase !== 'ready') return;
    this.vehicle = (this.vehicle + step + VEHICLES.length) % VEHICLES.length;
    const v = VEHICLES[this.vehicle];
    this.renderer.setVehicle(v.kind);
    this.hud.setVehicle(v.name, v.blurb);
    if (step !== 0) {
      this.audio.swerve(step);
      try {
        window.localStorage.setItem(VEHICLE_KEY, String(this.vehicle));
      } catch {
        // The choice simply will not persist.
      }
    }
  }

  private handleMetaKeys(): void {
    if (this.handleTourKeys()) return;
    if (this.input.isJustPressed(InputAction.PAUSE)) {
      if (this.paused) this.setPaused(false);
      else if (this.sim.phase === 'running') this.setPaused(true);
    }
    if (this.input.isJustPressed(InputAction.CROUCH)) {
      if (this.sim.phase === 'ready') this.cycleVehicle(1);
      else if (this.sim.phase === 'over' || this.paused) this.backToGarage();
    }
    if (this.input.isJustPressed(InputAction.SCHOOL) && this.sim.phase === 'ready' && !this.pickerOpen) {
      this.openSchoolPicker();
    }
    if (this.input.isJustPressed(InputAction.GAZE_TOGGLE)) void this.toggleGaze();
    if (this.input.isJustPressed(InputAction.GESTURE_TOGGLE)) void this.toggleHand();
    if (this.input.isJustPressed(InputAction.MUTE_TOGGLE)) this.hud.setMuted(this.audio.toggleMute());
  }

  private consumeEffects(): void {
    const sim = this.sim;
    for (let i = 0; i < sim.fxCount; i++) {
      const fx = sim.fx[i];
      this.renderer.effect(fx, sim.z);
      if (fx.type === 'jump') this.frameJumps++;
      if (fx.type === 'smash' || fx.type === 'explode') this.frameSmashes++;
      if (fx.type === 'itemUse') this.frameItems++;
      this.audio.play(fx);
      this.popupFor(fx);
      if (fx.type === 'crash') {
        this.hitStop = Math.max(this.hitStop, HIT_STOP_CRASH);
        this.hud.flashCrash();
      } else if (fx.type === 'explode') {
        this.hitStop = Math.max(this.hitStop, HIT_STOP_KILL);
      } else if (fx.type === 'lightning') {
        this.hud.flashLightning();
      } else if (fx.type === 'finish' && this.stage) {
        this.finishStage(true);
      } else if (fx.type === 'gameOver' && this.stage) {
        this.finishStage(false);
      } else if (fx.type === 'gameOver') {
        this.overFor = 0;
        this.hud.showResults({
          score: sim.score,
          best: this.best,
          distance: sim.distance,
          kills: sim.kills,
          coins: sim.coins,
          worlds: this.worldsReached()
        });
        if (sim.score > this.best) saveBest(sim.score);
        this.progress.bank += sim.coins;
        saveProgress(this.progress);
      }
    }
  }

  /** Engine, music level and the one-shot cues that follow state changes rather than effects. */
  private updateAudio(): void {
    const sim = this.sim;
    if (sim.nitroActive && !this.wasNitro) this.audio.nitro();
    this.wasNitro = sim.nitroActive;
    if (sim.phase === 'running' && this.lastPhase === 'ready') this.audio.go();
    this.lastPhase = sim.phase;
    if (sim.lane !== this.lastLane) this.audio.swerve(Math.sign(sim.lane - this.lastLane));
    this.lastLane = sim.lane;

    const speedT = (sim.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
    const level = sim.phase === 'over' ? null : sim.phase === 'ready' ? 'title' : sim.nitroActive ? 'nitro' : 'run';
    this.audio.update(sim.speed, speedT, sim.nitroActive, level);
  }

  /** Points float up from where they were earned, so the reward sits on the thing that paid it. */
  private popupFor(fx: FxRecord): void {
    const trick = TRICK_POPUPS[fx.type];
    if (trick) {
      const at = this.renderer.projectPoint(fx.x, fx.y + 1.5, fx.z - this.sim.z, this.crosshair);
      if (!at) return;
      this.hud.popup(fx.amount > 0 ? `${trick.text} +${fx.amount}` : trick.text, this.crosshair.x, this.crosshair.y, trick.color);
      // A takedown gets a beat of slow motion: the moment to savour.
      if (fx.type === 'takedown' && this.slowmo <= 0) this.slowmo = 0.45;
      return;
    }
    if (fx.type !== 'explode' && fx.type !== 'smash' && fx.type !== 'pickup') return;
    const at = this.renderer.projectPoint(fx.x, fx.y + 1.5, fx.z - this.sim.z, this.crosshair);
    if (!at) return;
    if (fx.type === 'pickup') {
      this.hud.popup(fx.amount === 1 ? '+1 HEART' : 'NITRO!', this.crosshair.x, this.crosshair.y, fx.amount === 1 ? '#ff4a6a' : '#3fa7ff');
    } else if (fx.amount > 0) {
      this.hud.popup(`+${fx.amount}`, this.crosshair.x, this.crosshair.y, fx.type === 'explode' ? '#ffd23f' : '#fff7e0');
    }
  }

  private updateHud(aimX: number, pointer: number | null): void {
    const sim = this.sim;
    this.hud.setItem(sim.heldItem, sim.shieldTime > 0 ? 'SHIELD' : sim.giantTime > 0 ? 'GIANT!' : sim.magnetTime > 0 ? 'MAGNET' : null);
    this.hud.update({
      // In a tour stage the stage card owns the ending; the endless game-over card stays away.
      phase: this.stage && (sim.phase === 'over' || sim.phase === 'clear') ? 'running' : sim.phase,
      score: sim.score,
      best: this.best,
      coins: sim.coins,
      hearts: sim.hearts,
      maxHearts: sim.maxHearts,
      nitro: sim.nitro,
      nitroActive: sim.nitroActive,
      combo: sim.combo,
      distance: sim.distance,
      kills: sim.kills
    });
    this.renderer.projectAim(aimX, this.crosshair);
    this.hud.setCrosshair(this.crosshair.x, this.crosshair.y, sim.phase === 'running', this.renderer.hasLock);
    this.hud.setDevices({
      gaze: deviceStatus(this.gazeEnabled, this.face.status, this.face.intent.present),
      hand: deviceStatus(this.handEnabled, this.hand.status, this.hand.intent.present),
      pointer
    });
  }

  /** Every world this run touched, in order, from the start of the run to where it ended. */
  private worldsReached(): { name: string; color: string }[] {
    const sim = this.sim;
    const first = Math.floor(sim.startZ / ZONE_LENGTH);
    const last = Math.floor(sim.z / ZONE_LENGTH);
    const out: { name: string; color: string }[] = [];
    for (let i = first; i <= last; i++) {
      const biome = this.renderer.biomeOf(i);
      out.push({ name: BIOME_NAMES[biome], color: BIOME_COLORS[biome] });
    }
    return out;
  }

  /**
   * Shares a link to this exact road. The seed is the road: a friend who opens it gets the same
   * traffic, drones and worlds, so "beat my score" means the same thing for both of you.
   */
  private async shareRoad(): Promise<void> {
    const url = `${location.origin}${location.pathname}?seed=${this.sim.seedValue}`;
    const text = `I scored ${this.sim.score.toLocaleString()} in VORIXA Rush. Can you beat me on this road?`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'VORIXA Rush', text, url });
        this.hud.setShareNote('Shared. Good luck to them!');
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      this.hud.setShareNote('Link copied. Challenge a friend!');
    } catch {
      // Clipboard refused (permissions, insecure origin) or the share sheet was dismissed:
      // show the link itself so it can still be copied by hand.
      this.hud.setShareNote(url);
    }
  }

  private setPaused(paused: boolean): void {
    if (paused && this.sim.phase !== 'running') return;
    if (paused === this.paused) return;
    this.paused = paused;
    this.hud.setPaused(paused);
    this.audio.setPaused(paused);
    // Resuming starts the clock fresh; the time spent paused must not arrive as one huge frame.
    this.accumulator = 0;
  }

  /** Straight back into a new run. */
  private raceAgain(): void {
    this.restart();
    this.sim.start();
  }

  /** Back to the title screen and its garage. */
  private backToGarage(): void {
    this.restart();
  }

  // ─── World Tour ───────────────────────────────────────────────────────────────────────────

  /**
   * Keys on the map and the stage-clear card. Returns true when it handled the frame's keys, so
   * the same press does not also steer or pause the game.
   */
  private handleTourKeys(): boolean {
    const i = this.input;
    if (this.shop.open) {
      if (i.isJustPressed(InputAction.PAUSE)) this.closeShop();
      return true;
    }
    if (this.sim.phase === 'ready' && !this.pickerOpen && !this.tour.mapOpen && i.isJustPressed(InputAction.SHOP)) {
      this.openShop();
      return true;
    }
    if (this.tour.mapOpen) {
      if (i.isJustPressed(InputAction.STRAFE_LEFT)) this.selectOnMap(this.mapWorld, this.mapStop - 1);
      if (i.isJustPressed(InputAction.STRAFE_RIGHT)) this.selectOnMap(this.mapWorld, this.mapStop + 1);
      if (i.isJustPressed(InputAction.MOVE_FORWARD)) this.selectOnMap(this.mapWorld - 1, 0);
      if (i.isJustPressed(InputAction.MOVE_BACKWARD)) this.selectOnMap(this.mapWorld + 1, 0);
      if (i.isJustPressed(InputAction.JUMP) || i.isJustPressed(InputAction.CONFIRM)) {
        const stop = this.mapStops(this.mapWorld)[this.mapStop];
        if (stop) this.playStage(stop.id);
      }
      if (i.isJustPressed(InputAction.PAUSE)) this.closeMap();
      return true;
    }
    if (this.tour.resultOpen) {
      if (i.isJustPressed(InputAction.JUMP) || i.isJustPressed(InputAction.CONFIRM)) {
        if (this.sim.phase === 'clear' && this.stage && nextStage(this.progress, this.stage)) this.playNext();
        else if (this.stage) this.playStage(this.stage.id);
      } else if (i.isJustPressed(InputAction.RESTART) && this.stage) {
        this.playStage(this.stage.id);
      } else if (i.isJustPressed(InputAction.PAUSE)) {
        this.openMap(this.stage?.world);
      }
      return true;
    }
    if (this.sim.phase === 'ready' && !this.pickerOpen && i.isJustPressed(InputAction.CONFIRM)) {
      this.openMap();
      return true;
    }
    if (this.stage && this.sim.phase === 'running' && i.isJustPressed(InputAction.RESTART)) {
      this.playStage(this.stage.id);
      return true;
    }
    return false;
  }

  // ─── Garage shop ──────────────────────────────────────────────────────────────────────────

  private openShop(): void {
    if (this.sim.phase !== 'ready') this.restart();
    this.tour.setMenuVisible(false);
    this.shop.show(this.loadout, this.progress.bank);
  }

  private closeShop(): void {
    this.shop.hide();
    this.tour.setMenuVisible(true);
  }

  /** Takes coins from the shared bank after a purchase, saves, and redraws the shop. */
  private spend(coins: number): void {
    this.progress.bank -= coins;
    saveProgress(this.progress);
    saveLoadout(this.loadout);
    this.sim.car = statsFor(this.loadout);
    // New armor shows up straight away on the title screen, not only from the next run.
    if (this.sim.phase === 'ready') this.sim.hearts = this.sim.car.maxHearts;
    if (coins > 0) this.audio.play({ type: 'pickup', x: 0, y: 0, z: 0, amount: 0 });
    this.shop.show(this.loadout, this.progress.bank);
  }

  /** Map stops in path order: the regular stages and boss, then the secret. */
  private mapStops(world: number): StageDef[] {
    const stages = TOUR[world].stages;
    return [...stages.filter((s) => !s.secret), ...stages.filter((s) => s.secret)];
  }

  private openMap(world?: number): void {
    if (this.sim.phase !== 'ready') this.restart();
    // Open on the furthest world reached, at its first unfinished stop.
    let w = world ?? 0;
    if (world === undefined) for (let i = 0; i < TOUR.length; i++) if (worldUnlocked(this.progress, i)) w = i;
    const stops = this.mapStops(w);
    const firstOpen = stops.findIndex((s) => stageUnlocked(this.progress, s) && !this.progress.stages[s.id]?.cleared);
    this.selectOnMap(w, firstOpen >= 0 ? firstOpen : 0);
    this.tour.setMenuVisible(false);
  }

  private selectOnMap(world: number, stop: number): void {
    this.mapWorld = Math.max(0, Math.min(TOUR.length - 1, world));
    const count = this.mapStops(this.mapWorld).length;
    this.mapStop = ((stop % count) + count) % count;
    this.tour.showMap(this.progress, this.mapWorld, this.mapStop);
    this.audio.swerve(0);
  }

  private closeMap(): void {
    this.tour.hideMap();
    this.tour.setMenuVisible(true);
  }

  private playStage(id: string): void {
    const stage = findStage(id);
    if (!stage || !stageUnlocked(this.progress, stage)) return;
    this.restart();
    this.tour.hideMap();
    this.tour.setMenuVisible(false);
    this.stage = stage;
    const world = TOUR[stage.world];
    this.renderer.setFixedBiome(world.biome);
    this.renderer.setSeed(stage.seed);
    this.sim.startStage(
      { length: stage.length, difficulty: stage.difficulty, hasSecret: stage.hasSecret, boss: stage.boss, bonus: stage.secret },
      stage.seed
    );
    this.lastBiome = world.biome;
    this.hud.banner(`${world.name} · ${stage.name}`);
  }

  private playNext(): void {
    if (!this.stage) return;
    const next = nextStage(this.progress, this.stage);
    if (next) this.playStage(next.id);
    else this.openMap(this.stage.world);
  }

  /** Scores the attempt, saves progress, and shows the stage card. */
  private finishStage(cleared: boolean): void {
    const stage = this.stage;
    if (!stage) return;
    const sim = this.sim;
    const met = cleared && goalMet(stage.goal, { coins: sim.coins, droneKills: sim.droneKills, crashes: sim.crashes, elapsed: sim.elapsed });
    const { newStars, newSecret } = recordResult(this.progress, stage, {
      cleared,
      goalMet: met,
      starCoins: sim.starCoins,
      score: sim.score,
      coins: sim.coins,
      foundSecret: sim.foundSecret
    });
    saveProgress(this.progress);
    const record = this.progress.stages[stage.id];
    this.tour.setStageHud(null);
    this.tour.showResult({
      stage,
      cleared,
      goalMet: met,
      starCoinsThisRun: sim.starCoins,
      starCoinsBest: record?.starCoins ?? 0,
      starsNow: starsFor(record),
      newStars,
      newSecret,
      score: sim.score,
      hasNext: cleared && nextStage(this.progress, stage) !== null
    });
  }

  private updateStageHud(): void {
    const stage = this.stage;
    const sim = this.sim;
    if (!stage || sim.phase !== 'running') {
      if (!stage) this.tour.setStageHud(null);
      return;
    }
    let goal = goalText(stage.goal);
    let state: boolean | null = null;
    switch (stage.goal.kind) {
      case 'coins':
        goal = `Coins ${sim.coins}/${stage.goal.target}`;
        state = sim.coins >= stage.goal.target ? true : null;
        break;
      case 'drones':
        goal = `Drones ${sim.droneKills}/${stage.goal.target}`;
        state = sim.droneKills >= stage.goal.target ? true : null;
        break;
      case 'noCrash':
        goal = sim.crashes === 0 ? 'No crashes so far' : 'Crashed! Goal missed';
        state = sim.crashes === 0 ? null : false;
        break;
      case 'time':
        goal = `${sim.elapsed.toFixed(1)}s / ${stage.goal.target}s`;
        state = sim.elapsed > stage.goal.target ? false : null;
        break;
      case 'finish':
        break;
    }
    this.tour.setStageHud({
      name: `${TOUR[stage.world].name} · ${stage.name}`,
      progress: stage.length > 0 ? Math.min(sim.distance / stage.length, 1) : null,
      goal: stage.boss ? '' : goal,
      goalState: state,
      starCoins: sim.starCoins,
      boss: stage.boss ? { name: stage.name.toUpperCase(), hp: sim.bossHp, max: sim.bossMaxHp } : null
    });
  }

  // ─── Driving school ───────────────────────────────────────────────────────────────────────

  private openSchoolPicker(): void {
    if (this.sim.phase !== 'ready') this.restart();
    this.pickerOpen = true;
    this.hud.showGraduation(false);
    this.hud.showSchoolPicker(true);
  }

  private startSchool(track: SchoolTrack): void {
    this.pickerOpen = false;
    this.hud.showSchoolPicker(false);
    this.hud.showGraduation(false);
    this.restart();
    this.sim.practice = true;
    this.sim.start();
    this.school = new DrivingSchool(track);
  }

  private stepSchool(dt: number, firing: boolean, gaze: ReturnType<FaceTracker['update']> | null, hand: ReturnType<HandTracker['update']> | null): void {
    const school = this.school!;
    const sim = this.sim;
    school.update({
      dt,
      lane: sim.lane,
      jumps: this.frameJumps,
      smashes: this.frameSmashes,
      nitroActive: sim.nitroActive,
      firing,
      gaze: this.gazeEnabled
        ? {
            on: true,
            present: gaze?.present ?? false,
            rawX: gaze?.gazeX ?? 0,
            blinkStarted: gaze?.dilationStarted ?? false,
            dilating: gaze?.dilating ?? false,
            browsStarted: this.face.commands.jumpStarted,
            mouthOpen: this.face.commands.firing,
            smiling: this.face.commands.nitro,
            winkStarted: this.face.commands.itemStarted
          }
        : null,
      itemsUsed: this.frameItems,
      hand: this.handEnabled
        ? {
            on: true,
            present: hand?.present ?? false,
            fistStarted: hand?.fistStarted ?? false,
            pinching: hand?.pinching ?? false,
            nitro: (hand?.present ?? false) && hand!.thrust >= 0.85 && hand!.steerY >= 0.45,
            vSignStarted: hand?.vSignStarted ?? false,
            itemStarted: (hand?.fistStarted ?? false) && hand!.steerY >= 0.45
          }
        : null,
      eyesSteering: gaze?.present ?? false
    });

    if (school.calibration) {
      this.calibration = school.calibration;
      saveCalibration(school.calibration);
      school.calibration = null;
    }

    const state = school.state;
    const request = school.pendingRequest;
    school.pendingRequest = null;
    if (request === 'nitro') sim.nitro = 1;
    // An item lesson hands the player a shield, the item that is safest to fire off anywhere.
    if (request === 'item' || (state.lesson?.request === 'item' && !sim.heldItem)) sim.heldItem = 'shield';
    const wantsCrates = state.lesson?.request === 'crates';
    // Targets for a shooting lesson; replaced if the player drives past them all.
    if (request === 'crates' || (wantsCrates && !sim.entities.some((e) => e.alive && e.kind === 'crate'))) {
      [-1, 0, 1].forEach((lane, i) => sim.spawn('crate', lane * LANE_WIDTH, sim.z + 45 + i * 12));
    }
    this.renderer.setLaneHighlight(state.lesson?.highlightLane ?? null);
    this.hud.setLesson(state);

    if (state.done) {
      const names: Record<SchoolTrack, string> = { keys: 'keyboard and mouse', eyes: 'eye control', hands: 'hand control' };
      this.hud.showGraduation(true, `You have your ${names[school.track]} licence. Professor Owl is very proud.`);
      this.school = null;
      this.hud.setLesson(null);
      this.renderer.setLaneHighlight(null);
    }
  }

  /** The camera preview: what the trackers see, and what the game thinks you are doing. */
  private updatePreview(gaze: ReturnType<FaceTracker['update']> | null, hand: ReturnType<HandTracker['update']> | null): void {
    if (!this.gazeEnabled && !this.handEnabled) {
      this.preview.hide();
      return;
    }
    const readout: PreviewReadout[] = [];
    if (this.gazeEnabled) {
      if (!this.face.isRunning) readout.push({ text: `EYES: ${this.face.status.toUpperCase()}`, tone: this.face.status === 'error' || this.face.status === 'denied' ? 'warn' : 'plain' });
      else if (!gaze?.present) readout.push({ text: 'NO FACE', tone: 'warn' });
      else {
        const n = this.calibratedGaze.gazeX;
        readout.push({ text: n <= -0.5 ? 'LOOKING LEFT' : n >= 0.5 ? 'LOOKING RIGHT' : 'LOOKING CENTRE', tone: 'on' });
        const c = this.face.commands;
        if (gaze.dilating) readout.push({ text: 'BLINK: SLOW-MO', tone: 'on' });
        if (c.firing) readout.push({ text: 'MOUTH: FIRE', tone: 'on' });
        if (c.nitro) readout.push({ text: 'SMILE: NITRO', tone: 'on' });
        if (c.levels.brows > 0.3) readout.push({ text: 'BROWS: JUMP', tone: 'on' });
        // Live meters, so a player can see how close a gesture is to counting.
        readout.push({ text: `mouth ${meter(c.levels.mouth)} brows ${meter(c.levels.brows)} smile ${meter(c.levels.smile)}`, tone: 'plain' });
      }
    }
    if (this.handEnabled) {
      if (!this.hand.isRunning) readout.push({ text: `HANDS: ${this.hand.status.toUpperCase()}`, tone: this.hand.status === 'error' || this.hand.status === 'denied' ? 'warn' : 'plain' });
      else if (!hand?.present) readout.push({ text: 'NO HAND', tone: 'warn' });
      else {
        const raised = hand.thrust >= 0.85 && hand.steerY >= 0.45;
        readout.push({
          text: hand.fist ? (raised ? 'RAISED FIST: ITEM' : 'FIST: JUMP') : hand.pinching ? 'PINCH: FIRE' : hand.vSign ? 'PEACE: SLOW-MO' : raised ? 'RAISED: NITRO' : 'OPEN HAND',
          tone: 'on'
        });
      }
    }
    const video = this.hand.videoElement;
    this.preview.draw(
      video,
      this.handEnabled ? this.hand.landmarks : null,
      this.gazeEnabled ? this.face.landmarks : null,
      readout
    );
  }

  private restart(): void {
    this.sim.car = statsFor(this.loadout);
    this.setPaused(false);
    this.stage = null;
    this.renderer.setFixedBiome(null);
    this.tour.setStageHud(null);
    this.tour.hideResult();
    this.tour.setMenuVisible(true);
    this.sim.practice = false;
    this.school = null;
    this.pickerOpen = false;
    this.hud.setLesson(null);
    this.hud.showSchoolPicker(false);
    this.hud.showGraduation(false);
    this.renderer.setLaneHighlight(null);
    if (this.sim.score > this.best) this.best = this.sim.score;
    // A new road every run, like any endless runner — unless a specific one was asked for.
    const seed = this.fixedSeed ? this.sim.seedValue : (Math.random() * 0xffffffff) >>> 0;
    this.sim.reset(seed);
    this.renderer.setSeed(seed);
    this.lastBiome = 'meadow';
    this.controls.reset();
    this.overFor = 0;
    this.slowmo = 0;
    this.hitStop = 0;
    this.accumulator = 0;
  }

  /** Camera access is opt-in and reversible: asked for on request, released when switched off. */
  private async toggleGaze(): Promise<void> {
    if (this.gazeEnabled) {
      this.gazeEnabled = false;
      this.face.stop();
      return;
    }
    this.gazeEnabled = true;
    const ok = await this.face.start();
    if (!ok) this.gazeEnabled = this.face.status === 'loading';
  }

  private async toggleHand(): Promise<void> {
    if (this.handEnabled) {
      this.handEnabled = false;
      this.hand.stop();
      return;
    }
    this.handEnabled = true;
    const ok = await this.hand.start();
    if (!ok) this.handEnabled = this.hand.status === 'loading';
  }
}

/** A tiny text meter, 0–1 in five steps: "▮▮▯▯▯". */
function meter(level: number): string {
  const n = Math.max(0, Math.min(5, Math.round((level / 0.4) * 5)));
  return '▮'.repeat(n) + '▯'.repeat(5 - n);
}

function deviceStatus(enabled: boolean, status: string, present: boolean): DeviceStatus {
  if (!enabled) return status === 'error' ? 'error' : 'off';
  if (status === 'loading') return 'loading';
  if (status === 'error') return 'error';
  return present ? 'on' : 'lost';
}

function loadVehicle(): number {
  try {
    const stored = Number(window.localStorage.getItem(VEHICLE_KEY));
    return Number.isInteger(stored) && stored >= 0 && stored < VEHICLES.length ? stored : 0;
  } catch {
    return 0;
  }
}

function loadBest(): number {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    // Storage can be blocked (private windows, site-data settings). A best score is a nicety.
    return 0;
  }
}

function saveBest(score: number): void {
  try {
    window.localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // See loadBest.
  }
}
