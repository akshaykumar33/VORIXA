export enum InputAction {
  MOVE_FORWARD = 'MOVE_FORWARD',
  MOVE_BACKWARD = 'MOVE_BACKWARD',
  STRAFE_LEFT = 'STRAFE_LEFT',
  STRAFE_RIGHT = 'STRAFE_RIGHT',
  JUMP = 'JUMP',
  DASH = 'DASH',
  LOOK_X = 'LOOK_X',
  LOOK_Y = 'LOOK_Y',
  PAUSE = 'PAUSE'
}

export interface ActionState {
  value: number; // 0.0 or 1.0 for digital; -1.0 to 1.0 for analog axes
  justPressed: boolean;
  justReleased: boolean;
}
