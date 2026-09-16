import { describe, it, expect } from 'vitest';
import { InputEngine } from '../src/input/InputEngine';
import { InputAction } from '../src/input/ActionTypes';

describe('InputEngine', () => {
  it('should initialize with zeroed action states', () => {
    const input = new InputEngine({} as any);
    expect(input.isPressed(InputAction.MOVE_FORWARD)).toBe(false);
    expect(input.isJustPressed(InputAction.JUMP)).toBe(false);
  });

  it('should correctly set and clear action states', () => {
    const input = new InputEngine({} as any);

    input.setActionState(InputAction.MOVE_FORWARD, 1.0);
    expect(input.isPressed(InputAction.MOVE_FORWARD)).toBe(true);
    expect(input.isJustPressed(InputAction.MOVE_FORWARD)).toBe(true);

    input.endFrame();
    expect(input.isPressed(InputAction.MOVE_FORWARD)).toBe(true);
    expect(input.isJustPressed(InputAction.MOVE_FORWARD)).toBe(false);

    input.setActionState(InputAction.MOVE_FORWARD, 0.0);
    expect(input.isPressed(InputAction.MOVE_FORWARD)).toBe(false);
  });
});
