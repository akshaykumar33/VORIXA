import { InputAction } from './ActionTypes';
import type { InputEngine } from './InputEngine';
import type { GestureIntent } from './GestureMapping';

/**
 * Feeds gesture intent into the normalized input bus.
 *
 * This is the payoff for having had an action bus in the first place: a webcam becomes one more
 * device sitting alongside keyboard and gamepad, and neither the movement controller nor the game
 * loop needs to know a camera exists. Nothing downstream changes.
 *
 * Steering is converted into the same "pixels of mouse movement" unit the look system already
 * consumes. That keeps one sensitivity model for every device rather than two that drift apart.
 */

/** Pixel-equivalents per second at full hand deflection. Tuned to feel like a firm mouse sweep. */
const YAW_RATE = 900;
/** Pitch is slower than yaw: vertical hand travel is shorter and easier to overshoot. */
const PITCH_RATE = 520;
/** Open-palm throttle has to exceed this before it counts as "forward". */
const THRUST_THRESHOLD = 0.28;

/**
 * Hands mean different things depending on whether the eyes are also driving.
 *
 * - `'steer'` — hands own the camera. This is the original mapping and the fallback whenever gaze
 *   is off, unsupported, or refused: hand position aims, open palm is the throttle.
 * - `'flight'` — gaze owns the camera, so the hands are freed for the controls that actually suit
 *   them. Lateral hand position banks the craft, an open palm brakes, and a pinch boosts.
 *
 * Splitting the two matters because both modes want to write `LOOK_X`. Two devices writing the
 * same axis in one frame means last-writer-wins, which would show up as the camera fighting
 * itself — the kind of bug that is miserable to diagnose from a bug report.
 */
export type HandRole = 'steer' | 'flight';

export function applyGestureIntent(
  input: InputEngine,
  intent: GestureIntent,
  dt: number,
  role: HandRole = 'steer'
): void {
  if (!intent.present) {
    input.setActionState(InputAction.MOVE_FORWARD, 0);
    input.setActionState(InputAction.BRAKE, 0);
    input.setActionState(InputAction.ROLL, 0);
    // Only surrender the look axes in the mode that owns them, or a dropped hand would yank the
    // camera away from a perfectly healthy gaze track.
    if (role === 'steer') {
      input.setActionState(InputAction.LOOK_X, 0);
      input.setActionState(InputAction.LOOK_Y, 0);
    }
    return;
  }

  if (role === 'steer') {
    input.setActionState(InputAction.LOOK_X, intent.steerX * YAW_RATE * dt);
    // Screen Y grows downward, and look pitch is inverted relative to it, so raising your hand
    // must look up.
    input.setActionState(InputAction.LOOK_Y, -intent.steerY * PITCH_RATE * dt);

    input.setActionState(
      InputAction.MOVE_FORWARD,
      intent.thrust > THRUST_THRESHOLD ? 1 : 0
    );
    input.setActionState(InputAction.BRAKE, 0);
    input.setActionState(InputAction.ROLL, 0);
  } else {
    // Flight: forward motion is continuous, so the hand modulates rather than supplies it.
    input.setActionState(InputAction.MOVE_FORWARD, 1);
    // Lateral hand position banks the craft — leaning into a turn, which is what the hand wants
    // to do anyway once the eyes have taken over aiming.
    input.setActionState(InputAction.ROLL, intent.steerX);
    // An open palm is the air brake. Analog, so easing off is a glide rather than a switch.
    input.setActionState(InputAction.BRAKE, intent.thrust);
  }

  // Discrete actions are re-armed by dropping to zero first, so the bus sees a genuine edge
  // rather than a level that was already high.
  if (intent.pinchStarted) {
    input.setActionState(InputAction.DASH, 0);
    input.setActionState(InputAction.DASH, 1);
  } else {
    input.setActionState(InputAction.DASH, 0);
  }

  if (intent.fistStarted) {
    input.setActionState(InputAction.JUMP, 0);
    input.setActionState(InputAction.JUMP, 1);
  } else {
    input.setActionState(InputAction.JUMP, 0);
  }
}

export { YAW_RATE, PITCH_RATE, THRUST_THRESHOLD };
