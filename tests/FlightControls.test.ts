import { describe, it, expect } from 'vitest';
import { buildCourse } from '../src/game/Course';
import { PlayerController, type MoveIntent } from '../src/game/PlayerController';
import { CameraRig, type RigInput } from '../src/game/CameraRig';

/**
 * The flight-mode controls — brake and bank — exist because gaze takes over steering and frees
 * the hands for something else. They were written to the action bus before anything consumed
 * them, which meant an open palm and a hand tilt did precisely nothing while the start screen
 * advertised both.
 *
 * A control that is wired but has no effect looks identical to a working one in every screenshot,
 * in every typecheck and in every build. These are the tests that tell the difference.
 */

const TICK = 1 / 120;

function intent(overrides: Partial<MoveIntent> = {}): MoveIntent {
  return {
    forward: 0,
    strafe: 0,
    yaw: 0,
    jumpPressed: false,
    dashPressed: false,
    crouchHeld: false,
    ...overrides
  };
}

function rigInput(overrides: Partial<RigInput> = {}): RigInput {
  return {
    x: 0,
    y: 0,
    z: 0,
    eyeHeight: 1.6,
    yaw: 0,
    pitch: 0,
    speed: 0,
    strafe: 0,
    wallSide: 0,
    dashing: false,
    sliding: false,
    ...overrides
  };
}

/** Runs the player forward until it is moving at a steady pace. */
function runUpToSpeed(player: PlayerController, boxes = buildCourse().boxes): void {
  for (let i = 0; i < 240; i++) player.update(intent({ forward: 1 }), boxes, TICK);
}

describe('brake', () => {
  it('sheds speed faster than coasting does', () => {
    const boxes = buildCourse().boxes;

    const coasting = new PlayerController();
    runUpToSpeed(coasting, boxes);
    for (let i = 0; i < 30; i++) coasting.update(intent(), boxes, TICK);

    const braking = new PlayerController();
    runUpToSpeed(braking, boxes);
    for (let i = 0; i < 30; i++) braking.update(intent({ brake: 1 }), boxes, TICK);

    expect(braking.speed).toBeLessThan(coasting.speed);
  });

  it('is analog, not a switch', () => {
    const boxes = buildCourse().boxes;

    const half = new PlayerController();
    runUpToSpeed(half, boxes);
    for (let i = 0; i < 30; i++) half.update(intent({ brake: 0.5 }), boxes, TICK);

    const full = new PlayerController();
    runUpToSpeed(full, boxes);
    for (let i = 0; i < 30; i++) full.update(intent({ brake: 1 }), boxes, TICK);

    const none = new PlayerController();
    runUpToSpeed(none, boxes);
    for (let i = 0; i < 30; i++) none.update(intent(), boxes, TICK);

    // Easing off the palm has to land between coasting and a full stop, or the control is a
    // handbrake wearing an analog costume.
    expect(half.speed).toBeLessThan(none.speed);
    expect(half.speed).toBeGreaterThan(full.speed);
  });

  it('overrides forward input at full brake', () => {
    const boxes = buildCourse().boxes;
    const player = new PlayerController();
    runUpToSpeed(player, boxes);

    // Holding forward while braking must not fight to a stalemate.
    for (let i = 0; i < 90; i++) {
      player.update(intent({ forward: 1, brake: 1 }), boxes, TICK);
    }
    expect(player.speed).toBeLessThan(1.5);
  });

  it('leaves unbraked movement untouched', () => {
    const boxes = buildCourse().boxes;

    const withField = new PlayerController();
    const withoutField = new PlayerController();
    for (let i = 0; i < 120; i++) {
      withField.update(intent({ forward: 1, brake: 0 }), boxes, TICK);
      withoutField.update(intent({ forward: 1 }), boxes, TICK);
    }

    // brake is optional; omitting it and passing zero must behave identically, or every existing
    // keyboard caller silently changed behaviour.
    expect(withField.speed).toBeCloseTo(withoutField.speed, 10);
  });
});

describe('bank', () => {
  it('rolls the camera toward the bank direction', () => {
    const rig = new CameraRig();
    for (let i = 0; i < 60; i++) rig.update(rigInput({ bank: 1 }), 0, false, TICK, false, false);
    const right = rig.out.roll;

    const other = new CameraRig();
    for (let i = 0; i < 60; i++) other.update(rigInput({ bank: -1 }), 0, false, TICK, false, false);

    expect(right).not.toBeCloseTo(0, 3);
    expect(Math.sign(right)).toBe(-Math.sign(other.out.roll));
  });

  it('is proportional to how far the hand is tilted', () => {
    const full = new CameraRig();
    const half = new CameraRig();
    for (let i = 0; i < 60; i++) {
      full.update(rigInput({ bank: 1 }), 0, false, TICK, false, false);
      half.update(rigInput({ bank: 0.5 }), 0, false, TICK, false, false);
    }
    expect(Math.abs(half.out.roll)).toBeLessThan(Math.abs(full.out.roll));
    expect(Math.abs(half.out.roll)).toBeGreaterThan(0);
  });

  it('layers on top of wall-run lean rather than being replaced by it', () => {
    const plain = new CameraRig();
    const banked = new CameraRig();
    for (let i = 0; i < 60; i++) {
      plain.update(rigInput({ wallSide: 1 }), 0, false, TICK, false, false);
      banked.update(rigInput({ wallSide: 1, bank: -1 }), 0, false, TICK, false, false);
    }
    // Wall-run sets roll outright; if bank were applied before that it would be discarded.
    expect(banked.out.roll).not.toBeCloseTo(plain.out.roll, 3);
  });

  it('leaves unbanked play untouched', () => {
    const withField = new CameraRig();
    const withoutField = new CameraRig();
    for (let i = 0; i < 60; i++) {
      withField.update(rigInput({ bank: 0 }), 0, false, TICK, false, false);
      withoutField.update(rigInput(), 0, false, TICK, false, false);
    }
    expect(withField.out.roll).toBeCloseTo(withoutField.out.roll, 10);
  });
});
