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

describe('InputEngine relative axes', () => {
  it('reports negative axis values that isPressed cannot express', () => {
    const input = new InputEngine({} as any);
    input.setActionState(InputAction.LOOK_X, -42);
    expect(input.getAxis(InputAction.LOOK_X)).toBe(-42);
  });

  it('clears look deltas at frame end so the view does not spin forever', () => {
    const input = new InputEngine({} as any);
    input.setActionState(InputAction.LOOK_X, 25);
    input.setActionState(InputAction.LOOK_Y, -10);

    input.endFrame();

    expect(input.getAxis(InputAction.LOOK_X)).toBe(0);
    expect(input.getAxis(InputAction.LOOK_Y)).toBe(0);
  });

  it('leaves held buttons alone when clearing relative axes', () => {
    const input = new InputEngine({} as any);
    input.setActionState(InputAction.MOVE_FORWARD, 1.0);
    input.setActionState(InputAction.LOOK_X, 25);

    input.endFrame();

    expect(input.getAxis(InputAction.LOOK_X)).toBe(0);
    expect(input.isPressed(InputAction.MOVE_FORWARD)).toBe(true);
  });

  it('returns zero for an axis it does not know about', () => {
    const input = new InputEngine({} as any);
    expect(input.getAxis('NOT_AN_ACTION' as InputAction)).toBe(0);
  });
});
