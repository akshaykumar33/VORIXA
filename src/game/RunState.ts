import type { CourseSource } from './CourseSource';

/**
 * Run lifecycle: the timer, the checkpoints, and the record.
 *
 * Two rules here exist purely to protect the retry loop, which is the whole game:
 *
 *   1. **The clock starts when you move, not when the page loads.** Otherwise every run is
 *      polluted by however long you spent reading the HUD, and no time is comparable to another.
 *   2. **Falling costs time, not progress.** A missed jump respawns you at the last checkpoint
 *      with the clock still running. Sending the player back to the start would make a 40-second
 *      course punish a 35-second mistake, and they would close the tab instead of retrying.
 */

export type RunPhase = 'ready' | 'running' | 'finished';

const STORAGE_KEY = 'vorixa.course-01.record';

interface StoredRecord {
  time: number;
  splits: number[];
}

export interface RunSnapshot {
  phase: RunPhase;
  elapsed: number;
  checkpointIndex: number;
  /** Null on an endless course, where there is no total to count toward. */
  totalCheckpoints: number | null;
  bestTime: number | null;
  /** Seconds ahead (negative) or behind (positive) the record at the last checkpoint passed. */
  deltaAtLastSplit: number | null;
  /** True on the tick a run ends in a new record, for the celebration. */
  isNewRecord: boolean;
}

export class RunState {
  private readonly course: CourseSource;

  public phase: RunPhase = 'ready';
  public elapsed = 0;
  public checkpointIndex = 0;
  public isNewRecord = false;
  public deltaAtLastSplit: number | null = null;

  private splits: number[] = [];
  private bestTime: number | null = null;
  private bestSplits: number[] = [];

  /** Set on the tick the player falls, so the presentation layer can flash a reset. */
  public justRespawned = false;
  /** Set on the tick a checkpoint is passed. */
  public justPassedCheckpoint = false;
  /** Set on the tick the run completes. */
  public justFinished = false;

  constructor(course: CourseSource) {
    this.course = course;
    this.loadRecord();
  }

  public get bestTimeSeconds(): number | null {
    return this.bestTime;
  }

  public restart(): void {
    this.phase = 'ready';
    this.elapsed = 0;
    this.checkpointIndex = 0;
    this.splits = [];
    this.isNewRecord = false;
    this.deltaAtLastSplit = null;
    this.clearEvents();
  }

  private clearEvents(): void {
    this.justRespawned = false;
    this.justPassedCheckpoint = false;
    this.justFinished = false;
  }

  /** Where the player should be placed right now — spawn, or the last checkpoint after a fall. */
  public get respawn(): { x: number; y: number; z: number } {
    const cp = this.course.checkpointAt(this.checkpointIndex);
    if (!cp) return { x: this.course.spawnX, y: this.course.spawnY, z: this.course.spawnZ };
    return { x: cp.spawnX, y: cp.spawnY, z: cp.spawnZ };
  }

  /**
   * @param moving Whether the player is giving movement input, which is what starts the clock.
   * @returns true if the player must be teleported to `respawn` (they fell).
   */
  public update(
    x: number,
    y: number,
    z: number,
    moving: boolean,
    deltaTime: number
  ): boolean {
    this.clearEvents();

    if (this.phase === 'finished') return false;

    if (this.phase === 'ready') {
      if (!moving) return false;
      this.phase = 'running';
    }

    this.elapsed += deltaTime;

    // Checkpoints arm in order. Out-of-order or off-course crossings are ignored, so the
    // course cannot be short-cut by falling past a trigger plane.
    const next = this.course.checkpointAt(this.checkpointIndex + 1);
    if (next && z <= next.triggerZ && Math.abs(x - next.spawnX) <= next.halfWidth) {
      this.checkpointIndex++;
      this.splits[this.checkpointIndex] = this.elapsed;
      this.justPassedCheckpoint = true;
      const reference = this.bestSplits[this.checkpointIndex];
      this.deltaAtLastSplit = reference === undefined ? null : this.elapsed - reference;
    }

    if (z <= this.course.finishZ) {
      this.finish();
      return false;
    }

    if (y < this.course.killY) {
      this.justRespawned = true;
      return true;
    }

    return false;
  }

  private finish(): void {
    this.phase = 'finished';
    this.justFinished = true;
    this.splits[this.checkpointIndex] = this.elapsed;

    if (this.bestTime === null || this.elapsed < this.bestTime) {
      this.bestTime = this.elapsed;
      this.bestSplits = [...this.splits];
      this.isNewRecord = true;
      this.saveRecord();
    } else {
      this.isNewRecord = false;
    }
  }

  public snapshot(): RunSnapshot {
    return {
      phase: this.phase,
      elapsed: this.elapsed,
      checkpointIndex: this.checkpointIndex,
      totalCheckpoints: this.course.totalCheckpoints,
      bestTime: this.bestTime,
      deltaAtLastSplit: this.deltaAtLastSplit,
      isNewRecord: this.isNewRecord
    };
  }

  private loadRecord(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredRecord;
      if (typeof parsed.time === 'number' && Number.isFinite(parsed.time)) {
        this.bestTime = parsed.time;
        this.bestSplits = Array.isArray(parsed.splits) ? parsed.splits : [];
      }
    } catch {
      // A corrupt record is not worth failing a page load over; the player just starts fresh.
    }
  }

  private saveRecord(): void {
    if (typeof localStorage === 'undefined' || this.bestTime === null) return;
    try {
      const record: StoredRecord = { time: this.bestTime, splits: this.bestSplits };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Private browsing and full quotas both land here. The run still counts in-session.
    }
  }
}

/** `M:SS.mmm`, the format a player can read at a glance mid-run. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--:--.--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

/** `+1.24` / `-0.37`, always signed so the sign carries the meaning at a glance. */
export function formatDelta(seconds: number): string {
  const sign = seconds >= 0 ? '+' : '-';
  return `${sign}${Math.abs(seconds).toFixed(2)}`;
}
