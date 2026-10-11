import type { Box, Checkpoint, CourseData } from './Course';

/**
 * What the run logic needs from a course, whether it is finite or endless.
 *
 * `RunState` used to read `CourseData` directly, indexing `checkpoints[i + 1]` by **array
 * position**. That is correct for a fixed course and silently wrong for a streamed one: the live
 * window slides, so position 3 means a different checkpoint every time a segment is evicted, and
 * the run would arm checkpoints it had already passed.
 *
 * Addressing by absolute index instead makes both shapes satisfy one contract. A checkpoint's
 * identity is its number in the course, not where it currently sits in an array.
 */
export interface CourseSource {
  /** Collision geometry. For a stream this is the live window and changes as the player moves. */
  readonly boxes: readonly Box[];
  /** The checkpoint with this absolute index, or undefined if it is not known or not resident. */
  checkpointAt(index: number): Checkpoint | undefined;
  /** How many checkpoints the course has, or null when it never ends. */
  readonly totalCheckpoints: number | null;
  /** Z past which the run is complete. `-Infinity` for an endless course. */
  readonly finishZ: number;
  /** Falling below this means the player missed. */
  readonly killY: number;
  readonly spawnX: number;
  readonly spawnY: number;
  readonly spawnZ: number;
}

/**
 * Wraps the authored finite course.
 *
 * Its checkpoints are already stored in index order, so absolute index and array position happen
 * to coincide — but the lookup goes through `index` rather than assuming that, because the day
 * they diverge it would otherwise fail silently.
 */
export function staticCourseSource(course: CourseData): CourseSource {
  return {
    boxes: course.boxes,
    checkpointAt: (index) => course.checkpoints.find((cp) => cp.index === index),
    totalCheckpoints: course.checkpoints.length - 1,
    finishZ: course.finishZ,
    killY: course.killY,
    spawnX: course.spawnX,
    spawnY: course.spawnY,
    spawnZ: course.spawnZ
  };
}
