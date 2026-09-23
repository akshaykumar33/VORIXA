export enum InputAction {
  MOVE_FORWARD = 'MOVE_FORWARD',
  MOVE_BACKWARD = 'MOVE_BACKWARD',
  STRAFE_LEFT = 'STRAFE_LEFT',
  STRAFE_RIGHT = 'STRAFE_RIGHT',
  JUMP = 'JUMP',
  DASH = 'DASH',
  /** Held to shoot (Rush). Mouse button or J/K. */
  FIRE = 'FIRE',
  CROUCH = 'CROUCH',
  RESTART = 'RESTART',
  GESTURE_TOGGLE = 'GESTURE_TOGGLE',
  GAZE_TOGGLE = 'GAZE_TOGGLE',
  MUTE_TOGGLE = 'MUTE_TOGGLE',
  LOOK_X = 'LOOK_X',
  LOOK_Y = 'LOOK_Y',
  /** Open-palm deceleration. Analog 0–1, so easing off is not a binary stop. */
  BRAKE = 'BRAKE',
  /** Hand tilt banking. Analog -1 (left) to +1 (right). */
  ROLL = 'ROLL',
  /** Deliberate hard blink. Digital, edge-triggered. */
  TIME_DILATE = 'TIME_DILATE',
  PAUSE = 'PAUSE'
}

export interface ActionState {
  value: number; // 0.0 or 1.0 for digital; -1.0 to 1.0 for analog axes
  justPressed: boolean;
  justReleased: boolean;
}
