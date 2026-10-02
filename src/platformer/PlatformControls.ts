import { GAZE_ZONES, HAND_ZONES, zoneFor } from '../rush/RushControls';
import type { PlatformIntent } from './PlatformSim';

/**
 * Every input device, resolved into one `PlatformIntent` (ADR-0012).
 *
 * | Device   | Move                     | Jump                  | Fire              |
 * |----------|--------------------------|-----------------------|-------------------|
 * | Keys     | A/D, ←/→                 | Space, W, ↑           | J, K              |
 * | Mouse    |                          |                       | hold left button  |
 * | Face     | look left / right        | raise brows           | open mouth        |
 * | Hands    | palm left / right        | make a fist           | pinch             |
 *
 * Gestures are edges (a brow raise *starts*), but the jump is variable-height: holding the button
 * longer jumps higher. A gesture cannot be "held" the same way, so a gesture jump holds the jump
 * for `GESTURE_JUMP_HOLD` seconds, which is a full-height jump. The gesture player gets the
 * best jump, not the weakest.
 */

/** Longer than the whole ascent (JUMP_VELOCITY / rising gravity is about 0.38 s). */
export const GESTURE_JUMP_HOLD = 0.45;

export interface PlatformSources {
  leftHeld: boolean;
  rightHeld: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  fireHeld: boolean;
  /** Calibrated gaze, -1 (left) .. +1 (right). */
  gaze: { present: boolean; gazeX: number } | null;
  face: { jumpStarted: boolean; firing: boolean } | null;
  hand: { present: boolean; steerX: number; fistStarted: boolean; pinching: boolean } | null;
}

export class PlatformControls {
  public readonly intent: PlatformIntent = { move: 0, jumpPressed: false, jumpHeld: false, fire: false };
  private gazeZone = 0;
  private handZone = 0;
  private gestureHold = 0;

  public reset(): void {
    this.gazeZone = 0;
    this.handZone = 0;
    this.gestureHold = 0;
  }

  /** @param dt Seconds since the last call, for the gesture jump hold. */
  public resolve(src: PlatformSources, dt: number): PlatformIntent {
    const intent = this.intent;

    // Keys win over gestures when both are in use: a player reaching for the keyboard means it.
    let move = (src.rightHeld ? 1 : 0) - (src.leftHeld ? 1 : 0);
    const gazeOn = src.gaze?.present === true;
    if (gazeOn && src.gaze) this.gazeZone = zoneFor(src.gaze.gazeX, this.gazeZone, GAZE_ZONES);
    else this.gazeZone = 0;
    const hand = src.hand?.present ? src.hand : null;
    if (hand && !gazeOn) this.handZone = zoneFor(hand.steerX, this.handZone, HAND_ZONES);
    else this.handZone = 0;
    if (move === 0) move = gazeOn ? this.gazeZone : this.handZone;
    intent.move = move;

    const gestureJump = (src.face?.jumpStarted ?? false) || (hand?.fistStarted ?? false);
    if (gestureJump) this.gestureHold = GESTURE_JUMP_HOLD;
    else this.gestureHold = Math.max(0, this.gestureHold - dt);

    intent.jumpPressed = src.jumpPressed || gestureJump;
    intent.jumpHeld = src.jumpHeld || this.gestureHold > 0;
    intent.fire = src.fireHeld || (src.face?.firing ?? false) || (hand?.pinching ?? false);
    return intent;
  }
}
