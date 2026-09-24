import { describe, it, expect } from 'vitest';
import {
  GestureMapper,
  curlAmount,
  handScale,
  pinchAmount,
  type Landmark
} from '../src/input/GestureMapping';

/**
 * Synthetic hands, so the decision logic can be verified without a webcam.
 *
 * Proportions follow a real MediaPipe hand: the palm (wrist → middle knuckle) is the unit, an
 * extended fingertip sits about 2 palm lengths from the wrist, and a curled one folds back to
 * about 1. Getting this scale wrong is exactly the kind of bug that is invisible until someone
 * stands in front of a camera, which is why it is pinned here.
 */
const PALM = 0.2;

interface HandOptions {
  /** Palm centre in image space. */
  cx?: number;
  cy?: number;
  /** Fingertip distance from the wrist, in palm lengths. 2.0 = extended, 1.0 = fist. */
  extension?: number;
  /** Thumb-tip to index-tip distance in palm lengths. */
  pinch?: number;
}

function makeHand(options: HandOptions = {}): Landmark[] {
  const { cx = 0.5, cy = 0.5, extension = 2.0, pinch = 1.0 } = options;

  const wrist = { x: cx, y: cy + PALM * 0.55, z: 0 };
  const point = (dx: number, dy: number): Landmark => ({
    x: wrist.x + dx * PALM,
    y: wrist.y + dy * PALM,
    z: 0
  });

  const hand: Landmark[] = new Array(21);
  hand[0] = wrist;
  // Middle knuckle one palm length straight up from the wrist defines the scale.
  hand[9] = point(0, -1);
  hand[5] = point(-0.28, -0.95);
  hand[17] = point(0.3, -0.92);

  const tipAt = (dx: number) => point(dx, -extension);
  hand[8] = tipAt(-0.3);
  hand[12] = tipAt(-0.02);
  hand[16] = tipAt(0.26);
  hand[20] = tipAt(0.5);

  // Thumb tip placed the requested distance from the index tip.
  hand[4] = { x: hand[8].x - pinch * PALM, y: hand[8].y, z: 0 };

  // Intermediate joints are not read by the mapper; fill them so the array is complete.
  for (let i = 0; i < 21; i++) {
    if (!hand[i]) hand[i] = point(0, -0.5);
  }
  return hand;
}

const OPEN = () => makeHand({ extension: 2.0, pinch: 1.0 });
const FIST = () => makeHand({ extension: 1.0, pinch: 1.0 });
const PINCHED = () => makeHand({ extension: 2.0, pinch: 0.2 });

describe('hand feature extraction', () => {
  it('uses the palm as a scale reference', () => {
    expect(handScale(OPEN())).toBeCloseTo(PALM, 4);
  });

  it('is scale invariant: the same pose at any distance reads the same', () => {
    const near = makeHand({ extension: 2.0 });
    // Shrink the whole hand toward its wrist, as moving away from the camera would.
    const wrist = near[0];
    const far = near.map((p) => ({
      x: wrist.x + (p.x - wrist.x) * 0.45,
      y: wrist.y + (p.y - wrist.y) * 0.45,
      z: 0
    }));
    expect(curlAmount(far)).toBeCloseTo(curlAmount(near), 4);
    expect(pinchAmount(far)).toBeCloseTo(pinchAmount(near), 4);
  });

  it('separates an open hand from a fist by curl', () => {
    expect(curlAmount(OPEN())).toBeGreaterThan(1.7);
    expect(curlAmount(FIST())).toBeLessThan(1.2);
  });

  it('separates a pinch from an open hand', () => {
    expect(pinchAmount(PINCHED())).toBeLessThan(0.35);
    expect(pinchAmount(OPEN())).toBeGreaterThan(0.8);
  });
});

describe('GestureMapper steering', () => {
  // `update` returns its own mutable intent object, so anything compared across frames must be
  // snapshotted rather than held by reference.
  const step = (mapper: GestureMapper, hand: Landmark[] | null, frames = 40) => {
    for (let i = 0; i < frames; i++) mapper.update(hand, 1 / 30);
    return { ...mapper.intent };
  };

  it('reports no input when there is no hand', () => {
    const mapper = new GestureMapper();
    const intent = mapper.update(null, 1 / 30);
    expect(intent.present).toBe(false);
    expect(intent.steerX).toBe(0);
    expect(intent.thrust).toBe(0);
  });

  it('zeroes the controls the moment the hand leaves frame', () => {
    const mapper = new GestureMapper();
    step(mapper, makeHand({ cx: 0.85 }));
    expect(mapper.intent.thrust).toBeGreaterThan(0);

    const dropped = mapper.update(null, 1 / 30);
    // A stuck throttle because a hand left the frame is the worst failure mode here.
    expect(dropped.thrust).toBe(0);
    expect(dropped.steerX).toBe(0);
  });

  it('steers right when the hand moves to the player’s right', () => {
    const mapper = new GestureMapper();
    // Selfie cameras mirror, so the player's right is the low end of image x.
    const intent = step(mapper, makeHand({ cx: 0.2 }));
    expect(intent.steerX).toBeGreaterThan(0.3);
  });

  it('steers left when the hand moves the other way', () => {
    const mapper = new GestureMapper();
    expect(step(mapper, makeHand({ cx: 0.8 })).steerX).toBeLessThan(-0.3);
  });

  it('holds still inside the dead zone', () => {
    const mapper = new GestureMapper();
    const intent = step(mapper, makeHand({ cx: 0.5, cy: 0.5 }));
    expect(intent.steerX).toBe(0);
    expect(intent.steerY).toBe(0);
  });

  it('never exceeds full deflection', () => {
    const mapper = new GestureMapper();
    const intent = step(mapper, makeHand({ cx: 0.02 }));
    expect(intent.steerX).toBeLessThanOrEqual(1);
    expect(intent.steerX).toBeGreaterThan(0.9);
  });

  it('smooths rather than snapping, so tracking jitter is not a twitchy camera', () => {
    const mapper = new GestureMapper();
    step(mapper, makeHand({ cx: 0.5 }));
    const firstFrame = { ...mapper.update(makeHand({ cx: 0.1 }), 1 / 30) };
    const settled = step(mapper, makeHand({ cx: 0.1 }));
    expect(Math.abs(firstFrame.steerX)).toBeLessThan(Math.abs(settled.steerX));
  });
});

describe('GestureMapper discrete gestures', () => {
  it('fires a pinch once, not every frame it is held', () => {
    const mapper = new GestureMapper();
    mapper.update(OPEN(), 1 / 30);

    let starts = 0;
    for (let i = 0; i < 20; i++) {
      if (mapper.update(PINCHED(), 1 / 30).pinchStarted) starts++;
    }
    expect(starts).toBe(1);
    expect(mapper.intent.pinching).toBe(true);
  });

  it('re-arms the pinch only after a clear release', () => {
    const mapper = new GestureMapper();
    mapper.update(OPEN(), 1 / 30);
    expect(mapper.update(PINCHED(), 1 / 30).pinchStarted).toBe(true);

    // A value between the make and break thresholds must not re-trigger.
    const marginal = makeHand({ pinch: 0.45 });
    for (let i = 0; i < 5; i++) mapper.update(marginal, 1 / 30);
    expect(mapper.intent.pinching).toBe(true);

    for (let i = 0; i < 5; i++) mapper.update(OPEN(), 1 / 30);
    expect(mapper.intent.pinching).toBe(false);
    expect(mapper.update(PINCHED(), 1 / 30).pinchStarted).toBe(true);
  });

  it('does not chatter when the hand hovers on the pinch threshold', () => {
    const mapper = new GestureMapper();
    mapper.update(OPEN(), 1 / 30);

    let starts = 0;
    // Oscillate across the engage threshold but never past the release threshold.
    for (let i = 0; i < 30; i++) {
      const hand = makeHand({ pinch: i % 2 === 0 ? 0.36 : 0.44 });
      if (mapper.update(hand, 1 / 30).pinchStarted) starts++;
    }
    expect(starts).toBe(1);
  });

  it('fires a fist once and reports it as held', () => {
    const mapper = new GestureMapper();
    mapper.update(OPEN(), 1 / 30);

    let starts = 0;
    for (let i = 0; i < 15; i++) {
      if (mapper.update(FIST(), 1 / 30).fistStarted) starts++;
    }
    expect(starts).toBe(1);
    expect(mapper.intent.fist).toBe(true);
  });
});

describe('GestureMapper throttle', () => {
  it('runs at full throttle with an open palm', () => {
    const mapper = new GestureMapper();
    for (let i = 0; i < 10; i++) mapper.update(OPEN(), 1 / 30);
    expect(mapper.intent.thrust).toBeGreaterThan(0.85);
  });

  it('cuts the throttle completely when the hand closes', () => {
    const mapper = new GestureMapper();
    for (let i = 0; i < 10; i++) mapper.update(FIST(), 1 / 30);
    expect(mapper.intent.thrust).toBe(0);
  });

  it('is proportional between the two, not a switch', () => {
    const mapper = new GestureMapper();
    for (let i = 0; i < 10; i++) mapper.update(makeHand({ extension: 1.68 }), 1 / 30);
    const half = mapper.intent.thrust;
    expect(half).toBeGreaterThan(0.1);
    expect(half).toBeLessThan(0.9);
  });
});

describe('GestureMapper tracking quality', () => {
  it('reports good quality for a large, centred hand', () => {
    const mapper = new GestureMapper();
    for (let i = 0; i < 5; i++) mapper.update(makeHand({ cx: 0.5, cy: 0.5 }), 1 / 30);
    expect(mapper.intent.quality).toBeGreaterThan(0.8);
  });

  it('drops quality when the hand is clipped by the frame edge', () => {
    const mapper = new GestureMapper();
    for (let i = 0; i < 5; i++) mapper.update(makeHand({ cx: 0.01 }), 1 / 30);
    expect(mapper.intent.quality).toBeLessThan(0.4);
  });
});

import { isVSign } from '../src/input/GestureMapping';

/** A hand with each finger set separately, middle joints where a real hand has them. */
function fingers(ext: { index: number; middle: number; ring: number; pinky: number }): Landmark[] {
  const hand = makeHand({ extension: 2, pinch: 1 });
  const wrist = hand[0];
  const at = (dx: number, reach: number): Landmark => ({ x: wrist.x + dx * PALM, y: wrist.y - reach * PALM, z: 0 });
  // Middle joints sit about 1.3 palm lengths out on a real hand.
  hand[6] = at(-0.3, 1.3);
  hand[10] = at(-0.02, 1.35);
  hand[14] = at(0.26, 1.3);
  hand[18] = at(0.5, 1.2);
  hand[8] = at(-0.3, ext.index);
  hand[12] = at(-0.02, ext.middle);
  hand[16] = at(0.26, ext.ring);
  hand[20] = at(0.5, ext.pinky);
  return hand;
}

describe('peace sign', () => {
  it('is index and middle up, ring and pinky down', () => {
    expect(isVSign(fingers({ index: 2, middle: 2.1, ring: 1, pinky: 0.95 }))).toBe(true);
  });

  it('is not an open palm, a fist, or one finger pointing', () => {
    expect(isVSign(fingers({ index: 2, middle: 2.1, ring: 2, pinky: 1.8 }))).toBe(false);
    expect(isVSign(fingers({ index: 1, middle: 1, ring: 1, pinky: 0.95 }))).toBe(false);
    expect(isVSign(fingers({ index: 2, middle: 1, ring: 1, pinky: 0.95 }))).toBe(false);
  });

  it('fires slow motion once per sign', () => {
    const m = new GestureMapper();
    const v = fingers({ index: 2, middle: 2.1, ring: 1, pinky: 0.95 });
    expect(m.update(v, 1 / 30).vSignStarted).toBe(true);
    expect(m.update(v, 1 / 30).vSignStarted).toBe(false);
    expect(m.update(v, 1 / 30).vSign).toBe(true);
  });
});
