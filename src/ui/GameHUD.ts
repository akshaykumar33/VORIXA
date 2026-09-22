import { formatDelta, formatTime, type RunSnapshot } from '../game/RunState';

export interface HudData {
  run: RunSnapshot;
  speed: number;
  dashReady: boolean;
  /** 0 to 1 as the dash recharges. */
  dashCharge: number;
  dashRefused: boolean;
  wallRunning: boolean;
  sliding: boolean;
  grounded: boolean;
  lookCaptured: boolean;
}

/**
 * The HUD.
 *
 * A time-attack HUD has exactly one job: at any instant, tell the player whether this run is
 * worth continuing. Everything on screen serves that or is cut. The timer is large because it is
 * read in peripheral vision at speed; the split delta is the only coloured element because it is
 * the one number that carries a verdict; the speed readout exists because in a game where speed
 * is the skill, hiding it would be hiding the score.
 *
 * Debug telemetry from the old engine shell (frame times, backend names, entity counts) is gone.
 * It told the developer how the engine was doing and the player nothing about how *they* were
 * doing.
 */
export class GameHUD {
  private timerEl: HTMLElement | null = null;
  private bestEl: HTMLElement | null = null;
  private deltaEl: HTMLElement | null = null;
  private speedEl: HTMLElement | null = null;
  private checkpointEl: HTMLElement | null = null;
  private dashEl: HTMLElement | null = null;
  private stateEl: HTMLElement | null = null;
  private lockPromptEl: HTMLElement | null = null;
  private reticleEl: HTMLElement | null = null;
  private finishEl: HTMLElement | null = null;
  private finishTimeEl: HTMLElement | null = null;
  private finishNoteEl: HTMLElement | null = null;
  private speedLinesEl: HTMLElement | null = null;

  private readonly lastText = new Map<HTMLElement, string>();
  private lastLock: boolean | null = null;
  private lastPhase: string | null = null;
  private deltaShownAt = 0;

  constructor() {
    if (typeof document === 'undefined') return;
    const byId = (id: string) => document.getElementById(id);
    this.timerEl = byId('hud-timer');
    this.bestEl = byId('hud-best');
    this.deltaEl = byId('hud-delta');
    this.speedEl = byId('hud-speed');
    this.checkpointEl = byId('hud-checkpoint');
    this.dashEl = byId('hud-dash');
    this.stateEl = byId('hud-state');
    this.lockPromptEl = byId('lock-prompt');
    this.reticleEl = byId('reticle');
    this.finishEl = byId('finish-panel');
    this.finishTimeEl = byId('finish-time');
    this.finishNoteEl = byId('finish-note');
    this.speedLinesEl = byId('speed-lines');
  }

  private setText(el: HTMLElement | null, text: string): void {
    if (!el) return;
    if (this.lastText.get(el) === text) return;
    this.lastText.set(el, text);
    el.textContent = text;
  }

  public update(data: HudData): void {
    const { run } = data;

    this.setText(this.timerEl, formatTime(run.elapsed));
    this.setText(this.bestEl, run.bestTime === null ? '—' : formatTime(run.bestTime));
    this.setText(this.checkpointEl, `${run.checkpointIndex} / ${run.totalCheckpoints}`);
    this.setText(this.speedEl, Math.round(data.speed * 3.6).toString());

    this.updateDelta(run);
    this.updateDash(data);
    this.updateStateChip(data);
    this.updateSpeedLines(data.speed);
    this.updateLockState(data.lookCaptured);
    this.updatePhase(run);
  }

  /**
   * The split delta appears for a few seconds after each checkpoint, then clears. Leaving it up
   * permanently would make it wallpaper; the player stops seeing it precisely when it changes.
   */
  private updateDelta(run: RunSnapshot): void {
    if (!this.deltaEl) return;

    if (run.deltaAtLastSplit !== null && run.checkpointIndex !== this.deltaShownAt) {
      this.deltaShownAt = run.checkpointIndex;
      this.deltaEl.textContent = formatDelta(run.deltaAtLastSplit);
      this.deltaEl.className = run.deltaAtLastSplit <= 0 ? 'delta ahead show' : 'delta behind show';
      window.setTimeout(() => this.deltaEl?.classList.remove('show'), 2200);
    }

    if (run.phase === 'ready') {
      this.deltaEl.classList.remove('show');
      this.deltaShownAt = 0;
    }
  }

  private updateDash(data: HudData): void {
    if (!this.dashEl) return;
    const pct = Math.round(Math.min(Math.max(data.dashCharge, 0), 1) * 100);
    this.dashEl.style.setProperty('--charge', `${pct}%`);
    this.dashEl.classList.toggle('ready', data.dashReady);
    if (data.dashRefused) {
      // A refused input must be visibly refused, or the player concludes the key is broken.
      this.dashEl.classList.remove('refused');
      void this.dashEl.offsetWidth; // restart the animation
      this.dashEl.classList.add('refused');
    }
  }

  private updateStateChip(data: HudData): void {
    if (!this.stateEl) return;
    let label = '';
    if (data.speed > 20) label = 'BOOSTED';
    else if (data.wallRunning) label = 'WALL RUN';
    else if (data.sliding) label = 'SLIDE';
    else if (!data.grounded) label = 'AIRBORNE';
    this.setText(this.stateEl, label);
    this.stateEl.classList.toggle('show', label !== '');
  }

  /** Streaks fade in only above running pace, so they mark "fast" rather than "moving". */
  private updateSpeedLines(speed: number): void {
    if (!this.speedLinesEl) return;
    const intensity = Math.min(Math.max((speed - 11) / 16, 0), 1);
    this.speedLinesEl.style.opacity = intensity.toFixed(3);
  }

  private updateLockState(captured: boolean): void {
    if (captured === this.lastLock) return;
    this.lastLock = captured;
    this.lockPromptEl?.classList.toggle('is-hidden', captured);
    this.reticleEl?.classList.toggle('is-active', captured);
  }

  private updatePhase(run: RunSnapshot): void {
    if (run.phase === this.lastPhase) return;
    this.lastPhase = run.phase;

    const finished = run.phase === 'finished';
    this.finishEl?.classList.toggle('show', finished);
    if (!finished) return;

    this.setText(this.finishTimeEl, formatTime(run.elapsed));
    if (this.finishNoteEl) {
      this.finishNoteEl.textContent = run.isNewRecord
        ? 'NEW RECORD — your ghost just got faster'
        : run.bestTime === null
          ? 'Run complete'
          : `Best ${formatTime(run.bestTime)}`;
      this.finishNoteEl.className = run.isNewRecord ? 'finish-note record' : 'finish-note';
    }
  }
}
