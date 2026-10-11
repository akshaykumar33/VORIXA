/**
 * Third-person presentation decisions: where the camera sits, and what the runner is doing.
 *
 * Pure on purpose. The first-person game never showed a character, and the thing that made the
 * world read as geometry rather than a place was exactly that: most of every frame was floor. A
 * follow camera fixes it, but only if the camera never clips into the runner, never swings through
 * the track, and never lags so far behind that the player loses the line — failures that are all
 * invisible to a typecheck and obvious within a second of play. Keeping the maths free of Three.js
 * lets every one of them be tested.
 *
 * Gameplay is untouched. Collision, input and the camera rig still work in eye space; this layer
 * only decides how that state is *shown*.
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface FollowCameraOptions {
  /** Distance behind the runner. */
  distance: number;
  /** Height above the runner's eye line. */
  height: number;
  /** How far ahead of the runner the camera aims, so the line ahead stays in frame. */
  lookAhead: number;
  /**
   * How much of the player's pitch the camera inherits, 0–1. Full pitch swings the camera through
   * the floor when looking down; none makes looking up and down do nothing.
   */
  pitchInfluence: number;
}

export const DEFAULT_FOLLOW: FollowCameraOptions = {
  distance: 5.2,
  height: 1.6,
  lookAhead: 6,
  pitchInfluence: 0.45
};

/**
 * Where the camera should be, given the runner's eye and view angles.
 *
 * Yaw follows the three.js convention the rig already uses: at yaw 0 the view faces -Z, which is
 * the direction the course runs. `out` is written in place so the frame loop never allocates.
 */
export function followCamera(
  eye: Vec3Like,
  yaw: number,
  pitch: number,
  options: FollowCameraOptions,
  outPosition: Vec3Like,
  outTarget: Vec3Like
): void {
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);

  // Pitch lifts the camera when looking down and lowers it when looking up, orbiting the runner
  // rather than tilting in place — which keeps the runner on screen through a steep look.
  const tilt = pitch * options.pitchInfluence;
  const back = options.distance * Math.cos(tilt);
  const lift = options.height - options.distance * Math.sin(tilt);

  outPosition.x = eye.x - forwardX * back;
  outPosition.y = eye.y + lift;
  outPosition.z = eye.z - forwardZ * back;

  outTarget.x = eye.x + forwardX * options.lookAhead;
  outTarget.y = eye.y + Math.sin(tilt) * options.lookAhead;
  outTarget.z = eye.z + forwardZ * options.lookAhead;
}

/**
 * Frame-rate-independent exponential smoothing toward a target.
 *
 * `rate` is per second: higher tracks more tightly. A per-frame lerp constant would make the
 * camera heavier at 60 Hz than at 144 Hz, which is the kind of difference players feel and cannot
 * name.
 */
export function smoothToward(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

// ── Runner animation ─────────────────────────────────────────────────────────

export type RunnerAction = 'idle' | 'run' | 'jump' | 'slide';

export interface RunnerState {
  speed: number;
  grounded: boolean;
  sliding: boolean;
}

/** Below this ground speed the runner stands rather than jogging on the spot. */
const RUN_THRESHOLD = 0.8;

export function runnerAction(state: RunnerState): RunnerAction {
  if (state.sliding) return 'slide';
  if (!state.grounded) return 'jump';
  return state.speed > RUN_THRESHOLD ? 'run' : 'idle';
}

/**
 * Playback rate for the run cycle, so feet match ground speed.
 *
 * A fixed-rate run over a variable speed is the most recognisable tell in character animation:
 * the feet skate. Scaling the clip keeps stride and speed in step, clamped so a crawl is not a
 * slow-motion jog and a dash is not a blur of legs.
 */
export function runPlaybackRate(speed: number, clipSpeed: number): number {
  if (clipSpeed <= 0) return 1;
  const rate = speed / clipSpeed;
  return rate < 0.6 ? 0.6 : rate > 2.2 ? 2.2 : rate;
}

/**
 * Finds the clip for an action by name.
 *
 * Packs name their clips differently — "Run", "Running", "CharacterArmature|Run" — so matching is
 * by keyword rather than exact name, most specific keyword first. Returns -1 when nothing matches,
 * and the caller falls back to whatever the model has, because a runner with one generic clip is
 * still better than one frozen in a T-pose.
 */
const CLIP_KEYWORDS: Record<RunnerAction, readonly string[]> = {
  idle: ['idle', 'stand', 'survey', 'breath'],
  run: ['run', 'sprint', 'jog', 'walk'],
  jump: ['jump', 'fall', 'air'],
  slide: ['slide', 'roll', 'duck', 'crouch']
};

export function findClip(names: readonly string[], action: RunnerAction): number {
  const lowered = names.map((name) => name.toLowerCase());
  for (const keyword of CLIP_KEYWORDS[action]) {
    const index = lowered.findIndex((name) => name.includes(keyword));
    if (index !== -1) return index;
  }
  return -1;
}
