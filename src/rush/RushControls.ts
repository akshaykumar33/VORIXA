import { MIN_LANE, MAX_LANE, type RushIntent } from './RushSim';

/**
 * Turns four very different devices into one `RushIntent`.
 *
 * The devices disagree about what "steer" means:
 *
 *   - **Keys** are relative: a press means "one lane over".
 *   - **Eyes and hands** are absolute: where you look, or where your hand is, *is* the lane you
 *     want. "Look at the lane you want" is the whole premise of the game.
 *
 * Applying an absolute device every frame would make the keyboard useless (the eyes would drag
 * the car straight back), so absolute devices act on **zone changes** only. Moving your gaze from
 * the centre zone to the left zone is a request for the left lane; holding it there is not a
 * request to cancel every key press. Hysteresis between zones stops tracker jitter at a boundary
 * from flicking the car between lanes.
 */

export interface ZoneThresholds {
  /** Beyond this a side zone engages. */
  engage: number;
  /** Inside this the centre zone re-engages. */
  release: number;
}

/**
 * Gaze arrives calibrated: -1 is where this player looks for the left lane, +1 the right. A lane
 * engages halfway there, and the centre re-engages well inside, so jitter at a boundary never
 * flicks the car.
 */
export const GAZE_ZONES: ZoneThresholds = { engage: 0.5, release: 0.22 };
export const HAND_ZONES: ZoneThresholds = { engage: 0.35, release: 0.15 };

/**
 * Which third of the screen a -1..1 signal is in, with hysteresis. Between the thresholds the
 * previous zone holds.
 */
export function zoneFor(value: number, previous: number, zones: ZoneThresholds): number {
  if (value <= -zones.engage) return -1;
  if (value >= zones.engage) return 1;
  if (Math.abs(value) <= zones.release) return 0;
  return previous;
}

export interface ControlSources {
  /** Edge-triggered lane presses from the keyboard. */
  leftPressed: boolean;
  rightPressed: boolean;
  jumpPressed: boolean;
  itemPressed: boolean;
  fireHeld: boolean;
  nitroHeld: boolean;
  /** Crosshair from the mouse, -1..1, or null when the mouse has not moved recently. */
  mouseAimX: number | null;
  /** Calibrated gaze: -1 at the left lane, +1 at the right. */
  gaze: { present: boolean; gazeX: number } | null;
  /** Face gestures: brows jump, mouth fires, smile boosts, wink uses the item. */
  face?: { jumpStarted: boolean; firing: boolean; nitro: boolean; itemStarted: boolean } | null;
  hand: {
    present: boolean;
    steerX: number;
    steerY: number;
    thrust: number;
    fistStarted: boolean;
    pinching: boolean;
  } | null;
}

/** An open hand raised high asks for nitro. Resting open hands are common, so both are needed. */
const HAND_NITRO_THRUST = 0.85;
const HAND_NITRO_RAISE = 0.45;

export class RushControls {
  public lane = 0;
  private gazeZone = 0;
  private handZone = 0;

  public readonly intent: RushIntent = { lane: 0, jump: false, fire: false, nitro: false, aimX: 0, useItem: false };

  public reset(): void {
    this.lane = 0;
    this.gazeZone = 0;
    this.handZone = 0;
  }

  public resolve(src: ControlSources): RushIntent {
    if (src.leftPressed) this.lane -= 1;
    if (src.rightPressed) this.lane += 1;

    // Eyes steer when they are on; hands steer only when the eyes are not, so the two never
    // fight over the same lane. With both on, the hands are free to shoot and jump.
    const gazeSteering = src.gaze?.present === true;
    if (gazeSteering && src.gaze) {
      const zone = zoneFor(src.gaze.gazeX, this.gazeZone, GAZE_ZONES);
      if (zone !== this.gazeZone) this.lane = zone;
      this.gazeZone = zone;
    }
    if (src.hand?.present && !gazeSteering) {
      const zone = zoneFor(src.hand.steerX, this.handZone, HAND_ZONES);
      if (zone !== this.handZone) this.lane = zone;
      this.handZone = zone;
    }
    this.lane = Math.max(MIN_LANE, Math.min(MAX_LANE, this.lane));

    const hand = src.hand?.present ? src.hand : null;
    const intent = this.intent;
    intent.lane = this.lane;
    // A fist is jump — unless the hand is raised high, where it uses the item instead.
    const raised = hand !== null && hand.steerY >= HAND_NITRO_RAISE;
    const face = src.face ?? null;
    intent.jump = src.jumpPressed || (hand?.fistStarted === true && !raised) || (face?.jumpStarted ?? false);
    intent.useItem = src.itemPressed || (hand?.fistStarted === true && raised) || (face?.itemStarted ?? false);
    intent.fire = src.fireHeld || (hand?.pinching ?? false) || (face?.firing ?? false);
    intent.nitro =
      src.nitroHeld ||
      (hand !== null && hand.thrust >= HAND_NITRO_THRUST && hand.steerY >= HAND_NITRO_RAISE) ||
      (face?.nitro ?? false);
    // With no mouse, the crosshair rides the car's lane and aim assist does the rest — eyes and
    // hands are already busy steering.
    intent.aimX = src.mouseAimX ?? this.lane / 1.6;
    return intent;
  }
}
