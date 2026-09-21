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

export function applyGestureIntent(
  input: InputEngine,
  intent: GestureIntent,
  dt: number
): void {
  if (!intent.present) {
    input.setActionState(InputAction.MOVE_FORWARD, 0);
    input.setActionState(InputAction.LOOK_X, 0);
    input.setActionState(InputAction.LOOK_Y, 0);
    return;
  }

  input.setActionState(InputAction.LOOK_X, intent.steerX * YAW_RATE * dt);
  // Screen Y grows downward, and look pitch is inverted relative to it, so raising your hand
  // must look up.
  input.setActionState(InputAction.LOOK_Y, -intent.steerY * PITCH_RATE * dt);

  input.setActionState(
    InputAction.MOVE_FORWARD,
    intent.thrust > THRUST_THRESHOLD ? 1 : 0
  );

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
