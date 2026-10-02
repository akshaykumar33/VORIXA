import type { Box, Checkpoint } from '../game/Course';
import type { CourseSource } from '../game/CourseSource';
import { generateSegment, SEGMENT_LENGTH, type Segment } from './SegmentGenerator';

/**
 * A sliding window of live course segments.
 *
 * The course is infinite; memory is not. This keeps a bounded band of segments around the player,
 * generating ahead and discarding behind, so heap and GPU cost stay flat no matter how far anyone
 * runs — the property ADR-0005 calls "fixed, deterministic memory usage bounded by the active
 * radius".
 *
 * Two things this deliberately does *not* do:
 *
 *   - **Rebuild anything per frame.** `update()` is called every tick but almost always finds the
 *     window unchanged and returns immediately. The flattened box array — which collision reads
 *     every tick — is rebuilt only when the segment set actually changes, because reallocating a
 *     few hundred entries at 120 Hz is exactly the kind of garbage the engine rules forbid.
 *
 *   - **Keep segments alive because they were expensive.** Generation is pure and cheap, so a
 *     segment the player left is simply dropped. Backtracking regenerates it byte-identically —
 *     see `Rng.streamFor`. Caching would trade a guaranteed memory ceiling for a saving nobody
 *     can measure.
 *
 * Keeping segments *behind* the player matters as much as ahead: a run that respawns at the last
 * checkpoint must land on geometry that still exists, and a ghost replaying a few seconds back
 * needs something to be drawn against.
 */

/** Segments generated ahead of the player. At 60 m each, four is comfortably beyond fog. */
const DEFAULT_AHEAD = 4;
/** Segments retained behind. Enough for respawn and for the ghost to have a stage. */
const DEFAULT_BEHIND = 2;

export interface CourseStreamOptions {
  ahead?: number;
  behind?: number;
}

/** Segment index containing a world Z. The course runs toward -Z, so index grows as Z falls. */
export function segmentIndexFor(z: number): number {
  return Math.max(0, Math.floor(-z / SEGMENT_LENGTH));
}

export class CourseStream implements CourseSource {
  private readonly segments = new Map<number, Segment>();
  private readonly ahead: number;
  private readonly behind: number;

  /** Flattened view for collision. Rebuilt only when the window changes. */
  private flatBoxes: Box[] = [];
  private flatCheckpoints: Checkpoint[] = [];

  /**
   * Segments added and removed by the most recent `update`. Reused arrays, cleared in place —
   * the renderer reads these immediately after each update and never retains them.
   */
  public readonly added: Segment[] = [];
  public readonly removed: Segment[] = [];

  private centreIndex = -1;

  public constructor(
    public readonly seed: number,
    options: CourseStreamOptions = {}
  ) {
    this.ahead = options.ahead ?? DEFAULT_AHEAD;
    this.behind = options.behind ?? DEFAULT_BEHIND;
  }

  public get boxes(): readonly Box[] {
    return this.flatBoxes;
  }

  public get checkpoints(): readonly Checkpoint[] {
    return this.flatCheckpoints;
  }

  // ── CourseSource ────────────────────────────────────────────────────────────

  /**
   * Looked up by absolute index, not array position.
   *
   * This is the whole reason `CourseSource` exists: the window slides, so position 3 means a
   * different checkpoint after every eviction. Segment N owns checkpoint N, permanently.
   */
  public checkpointAt(index: number): Checkpoint | undefined {
    return this.segments.get(index)?.checkpoint;
  }

  /** Endless: there is no total to count toward. */
  public readonly totalCheckpoints = null;

  /** Endless: no Z is ever far enough to finish. */
  public readonly finishZ = -Infinity;

  /**
   * Higher than the authored course (-18): generated platforms never dip below track level, so a
   * player this far down has already missed and waiting longer only delays the respawn.
   */
  public readonly killY = -12;

  public readonly spawnX = 0;
  public readonly spawnY = 0.2;
  public readonly spawnZ = -2;

  /** Segments currently resident, ascending by index. */
  public get live(): Segment[] {
    return [...this.segments.values()].sort((a, b) => a.index - b.index);
  }

  /**
   * Moves the window to cover the player.
   *
   * @returns true when the resident set changed, so callers can skip work on the overwhelming
   *          majority of frames where nothing moved.
   */
  public update(playerZ: number): boolean {
    // Cleared before the early return, not after it. These describe *this* call, so a caller that
    // reads them every frame without checking the return value must see an empty list on the
    // frames where nothing happened — otherwise it rebuilds the same meshes forever.
    this.added.length = 0;
    this.removed.length = 0;

    const centre = segmentIndexFor(playerZ);
    if (centre === this.centreIndex && this.segments.size > 0) return false;
    this.centreIndex = centre;

    const first = Math.max(0, centre - this.behind);
    const last = centre + this.ahead;

    for (const [index, segment] of this.segments) {
      if (index < first || index > last) {
        this.removed.push(segment);
        this.segments.delete(index);
      }
    }

    for (let index = first; index <= last; index++) {
      if (this.segments.has(index)) continue;
      const segment = generateSegment(this.seed, index);
      this.segments.set(index, segment);
      this.added.push(segment);
    }

    if (this.added.length === 0 && this.removed.length === 0) return false;

    this.rebuildFlatViews();
    return true;
  }

  /**
   * Rebuilds the flattened collision and checkpoint views.
   *
   * Sorted by index so collision and checkpoint order match the direction of travel. Callers hold
   * the array by reference, so this mutates in place rather than replacing it — swapping the array
   * would leave anything that cached it reading a stale world.
   */
  private rebuildFlatViews(): void {
    const ordered = this.live;

    this.flatBoxes.length = 0;
    this.flatCheckpoints.length = 0;
    for (const segment of ordered) {
      for (const box of segment.boxes) this.flatBoxes.push(box);
      this.flatCheckpoints.push(segment.checkpoint);
    }
  }

  /**
   * The checkpoint a player at this Z should respawn to.
   *
   * Returns the last checkpoint they passed, or the earliest resident one if they somehow sit
   * before all of them — never undefined, because "nowhere to respawn" is not a state the game
   * can recover from mid-run.
   */
  public respawnFor(playerZ: number): Checkpoint | null {
    let best: Checkpoint | null = null;
    for (const checkpoint of this.flatCheckpoints) {
      if (checkpoint.triggerZ >= playerZ) {
        if (!best || checkpoint.triggerZ < best.triggerZ) best = checkpoint;
      }
    }
    return best ?? this.flatCheckpoints[0] ?? null;
  }

  /** Drops every resident segment. */
  public clear(): void {
    this.removed.length = 0;
    for (const segment of this.segments.values()) this.removed.push(segment);
    this.segments.clear();
    this.added.length = 0;
    this.flatBoxes.length = 0;
    this.flatCheckpoints.length = 0;
    this.centreIndex = -1;
  }
}
