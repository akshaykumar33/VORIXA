import { InputAction } from './ActionTypes';
import type { InputEngine } from './InputEngine';
import type { GazeIntent } from './GazeMapping';

/**
 * Feeds gaze intent into the normalized input bus.
 *
 * Same contract as `GestureBridge`: a webcam becomes one more device alongside keyboard and
 * gamepad, and nothing downstream learns that a camera exists. Steering is converted into the
 * "pixels of mouse movement" unit the look system already consumes, so one sensitivity model
 * covers every device rather than two that drift apart.
 *
 * Gaze is deliberately *slower* per unit of deflection than the hand mapping. Eyes move in
 * saccades — sudden jumps with no intermediate positions — and translating that literally into
 * camera motion is nauseating. A gentler rate turns a flick of attention into a lean rather than
 * a snap, which is what makes the control read as intentional instead of twitchy.
 */

/** Pixel-equivalents per second at full gaze deflection. Well under the hand mapping's 900. */
const GAZE_YAW_RATE = 620;
/** Pitch is slower still: vertical eye travel is shorter and overshoots more easily. */
const GAZE_PITCH_RATE = 360;

export function applyGazeIntent(input: InputEngine, intent: GazeIntent, dt: number): void {
  if (!intent.present) {
    // Losing the face must not leave the camera drifting at the last heading.
    input.setActionState(InputAction.LOOK_X, 0);
    input.setActionState(InputAction.LOOK_Y, 0);
    input.setActionState(InputAction.TIME_DILATE, 0);
    return;
  }

  input.setActionState(InputAction.LOOK_X, intent.gazeX * GAZE_YAW_RATE * dt);
  // Screen Y grows downward and look pitch is inverted relative to it, so looking up must
  // raise the view.
  input.setActionState(InputAction.LOOK_Y, -intent.gazeY * GAZE_PITCH_RATE * dt);

  // Re-armed by dropping to zero first, so the bus sees a genuine edge rather than a level that
  // was already high.
  if (intent.dilationStarted) {
    input.setActionState(InputAction.TIME_DILATE, 0);
    input.setActionState(InputAction.TIME_DILATE, 1);
  } else {
    input.setActionState(InputAction.TIME_DILATE, 0);
  }
}

export { GAZE_YAW_RATE, GAZE_PITCH_RATE };
