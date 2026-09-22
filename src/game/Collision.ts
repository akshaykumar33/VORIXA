import type { Box, SurfaceKind } from './Course';

/**
 * Axis-separated swept AABB collision against a static box world.
 *
 * Deliberately not a physics engine. A movement game needs collision that is *predictable* far
 * more than it needs collision that is realistic: the player must be able to build a mental model
 * of exactly where they will end up, or precise routes become guesswork and the game stops being
 * fair. So there are no restitution, no friction impulses, and no solver iterations — each axis is
 * moved and resolved on its own, and a blocked axis simply stops.
 *
 * Movement is substepped so that a 22 m/s dash cannot tunnel through a 0.4 m rail at 60 Hz.
 */

/** The player's collision box: a 0.8 m square column, origin at the feet. */
export const PLAYER_HALF_WIDTH = 0.4;
export const PLAYER_STAND_HEIGHT = 1.8;
export const PLAYER_SLIDE_HEIGHT = 1.0;

/** No substep may advance further than this, in metres. */
const MAX_SUBSTEP = 0.2;
/**
 * Obstacles up to this height are climbed automatically instead of blocking.
 *
 * Without this, a 10 cm kerb stops a sprinting player dead — which is both unrealistic and,
 * much worse, unreadable: the player sees nothing in their way and concludes the controls
 * are broken. Every first-person game has this assist; it is invisible when it works.
 */
const STEP_HEIGHT = 0.55;
/** How far to probe for a wall the player is running along but not yet inside. */
const WALL_PROBE = 0.2;
/** How far below the feet still counts as standing on something. */
const GROUND_PROBE = 0.12;

export interface MoveResult {
  grounded: boolean;
  groundedKind: SurfaceKind | null;
  /** True if the head hit something this move — used to keep the player down in the slide tunnel. */
  ceilingHit: boolean;
  /** Outward normal of the wall on the player's side: -1, 0, or +1 per axis. */
  wallNormalX: number;
  wallNormalZ: number;
  /** Downward speed at the instant of landing, for landing effects. Zero if no landing occurred. */
  landingSpeed: number;
  /** True if forward motion was stopped by geometry, for a light crunch cue. */
  blocked: boolean;
  /** True if the player touched or bumped into a hazard. */
  hazardHit: boolean;
}

export interface MutableBody {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  height: number;
}

function anyOverlap(
  boxes: readonly Box[],
  x: number,
  y: number,
  z: number,
  height: number
): boolean {
  for (const box of boxes) {
    if (overlaps(box, x, y, z, height)) return true;
  }
  return false;
}

/**
 * Attempts to climb over a blocking obstacle.
 *
 * Only offered to a grounded player who is not moving upward — stepping up in mid-air would let
 * the player climb a wall by running at it, which is the classic way this assist turns into an
 * exploit.
 *
 * @returns true if the body was raised and the horizontal move should be kept.
 */
function tryStepUp(
  boxes: readonly Box[],
  body: MutableBody,
  candidateX: number,
  candidateZ: number,
  grounded: boolean
): boolean {
  if (!grounded || body.vy > 0.01) return false;
  const raised = body.y + STEP_HEIGHT;
  if (anyOverlap(boxes, candidateX, raised, candidateZ, body.height)) return false;

  body.y = raised;
  body.x = candidateX;
  body.z = candidateZ;
  return true;
}

function overlaps(
  box: Box,
  x: number,
  y: number,
  z: number,
  height: number,
  expand = 0
): boolean {
  // `goal` volumes are gates you run through, never surfaces you stand on.
  if (box.kind === 'goal') return false;
  return (
    x + PLAYER_HALF_WIDTH + expand > box.minX &&
    x - PLAYER_HALF_WIDTH - expand < box.maxX &&
    y + height + expand > box.minY &&
    y - expand < box.maxY &&
    z + PLAYER_HALF_WIDTH + expand > box.minZ &&
    z - PLAYER_HALF_WIDTH - expand < box.maxZ
  );
}

/** True if a standing player would fit here. Used to refuse to un-crouch inside a ceiling. */
export function canStandAt(boxes: readonly Box[], x: number, y: number, z: number): boolean {
  for (const box of boxes) {
    if (overlaps(box, x, y, z, PLAYER_STAND_HEIGHT)) return false;
  }
  return true;
}

export function isGrounded(boxes: readonly Box[], body: MutableBody): boolean {
  for (const box of boxes) {
    if (box.kind === 'goal') continue;
    if (overlaps(box, body.x, body.y - GROUND_PROBE, body.z, GROUND_PROBE)) return true;
  }
  return false;
}

export function getGroundedSurface(boxes: readonly Box[], body: MutableBody): SurfaceKind | null {
  let found: SurfaceKind | null = null;
  for (const box of boxes) {
    if (box.kind === 'goal') continue;
    if (
      body.x + PLAYER_HALF_WIDTH > box.minX &&
      body.x - PLAYER_HALF_WIDTH < box.maxX &&
      body.z + PLAYER_HALF_WIDTH > box.minZ &&
      body.z - PLAYER_HALF_WIDTH < box.maxZ &&
      body.y >= box.minY - GROUND_PROBE &&
      body.y <= box.maxY + GROUND_PROBE + 0.1
    ) {
      if (box.kind === 'boost' || box.kind === 'jump_pad' || box.kind === 'hazard') {
        return box.kind;
      }
      found = box.kind;
    }
  }
  return found;
}

/**
 * Advances the body by its velocity, resolving against the world.
 *
 * Mutates `body` in place and returns what it touched, because the movement controller needs to
 * know *why* it stopped — landing, head-bonk, and wall contact all drive different behaviour.
 */
export function moveAndCollide(
  boxes: readonly Box[],
  body: MutableBody,
  deltaTime: number
): MoveResult {
  const result: MoveResult = {
    grounded: false,
    groundedKind: null,
    ceilingHit: false,
    wallNormalX: 0,
    wallNormalZ: 0,
    landingSpeed: 0,
    blocked: false,
    hazardHit: false
  };

  const distance = Math.hypot(body.vx * deltaTime, body.vy * deltaTime, body.vz * deltaTime);
  const steps = Math.max(1, Math.ceil(distance / MAX_SUBSTEP));
  const dt = deltaTime / steps;

  for (let step = 0; step < steps; step++) {
    const groundedNow = isGrounded(boxes, body);

    // ── X ────────────────────────────────────────────────────────────────────
    if (body.vx !== 0) {
      const candidateX = body.x + body.vx * dt;
      body.x = candidateX;
      for (const box of boxes) {
        if (!overlaps(box, body.x, body.y, body.z, body.height)) continue;
        if (box.kind === 'hazard') result.hazardHit = true;
        if (tryStepUp(boxes, body, candidateX, body.z, groundedNow)) break;
        // Snap back to the face we came through; the sign of travel removes any ambiguity
        // about which side we are on.
        body.x =
          body.vx > 0
            ? box.minX - PLAYER_HALF_WIDTH
            : box.maxX + PLAYER_HALF_WIDTH;
        result.wallNormalX = body.vx > 0 ? -1 : 1;
        body.vx = 0;
        result.blocked = true;
        break;
      }
    }

    // ── Z ────────────────────────────────────────────────────────────────────
    if (body.vz !== 0) {
      const candidateZ = body.z + body.vz * dt;
      body.z = candidateZ;
      for (const box of boxes) {
        if (!overlaps(box, body.x, body.y, body.z, body.height)) continue;
        if (box.kind === 'hazard') result.hazardHit = true;
        if (tryStepUp(boxes, body, body.x, candidateZ, groundedNow)) break;
        body.z =
          body.vz > 0
            ? box.minZ - PLAYER_HALF_WIDTH
            : box.maxZ + PLAYER_HALF_WIDTH;
        result.wallNormalZ = body.vz > 0 ? -1 : 1;
        body.vz = 0;
        result.blocked = true;
        break;
      }
    }

    // ── Y ────────────────────────────────────────────────────────────────────
    if (body.vy !== 0) {
      body.y += body.vy * dt;
      for (const box of boxes) {
        if (!overlaps(box, body.x, body.y, body.z, body.height)) continue;
        if (box.kind === 'hazard') result.hazardHit = true;
        if (body.vy > 0) {
          body.y = box.minY - body.height;
          result.ceilingHit = true;
        } else {
          body.y = box.maxY;
          result.grounded = true;
          result.groundedKind = box.kind;
          // Report the speed *before* it is cancelled, so the landing can be felt.
          result.landingSpeed = Math.max(result.landingSpeed, -body.vy);
        }
        body.vy = 0;
        break;
      }
    }
  }

  if (!result.grounded) {
    result.grounded = isGrounded(boxes, body);
  }
  const groundKind = getGroundedSurface(boxes, body);
  if (groundKind) {
    result.groundedKind = groundKind;
  }

  // Probe outward for a wall the player is travelling alongside. Wall-running needs contact
  // detection that survives the frame where velocity into the wall has already been zeroed.
  if (result.wallNormalX === 0) {
    if (touches(boxes, body, WALL_PROBE, 0)) result.wallNormalX = -1;
    else if (touches(boxes, body, -WALL_PROBE, 0)) result.wallNormalX = 1;
  }
  if (result.wallNormalZ === 0) {
    if (touches(boxes, body, 0, WALL_PROBE)) result.wallNormalZ = -1;
    else if (touches(boxes, body, 0, -WALL_PROBE)) result.wallNormalZ = 1;
  }

  return result;
}

function touches(
  boxes: readonly Box[],
  body: MutableBody,
  offsetX: number,
  offsetZ: number
): boolean {
  for (const box of boxes) {
    // Probe the upper body only: a kerb at ankle height is not a wall to run on.
    if (
      overlaps(
        box,
        body.x + offsetX,
        body.y + 0.4,
        body.z + offsetZ,
        Math.max(body.height - 0.5, 0.2)
      )
    ) {
      return true;
    }
  }
  return false;
}
