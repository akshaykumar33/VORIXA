import { describe, it, expect } from 'vitest';
import {
  GazeMapper,
  faceScale,
  irisOffset,
  lidClosure,
  REQUIRED_LANDMARKS,
  DELIBERATE_HOLD_SECONDS,
  type FaceLandmark
} from '../src/input/GazeMapping';

/**
 * Synthetic faces, so gaze decisions can be verified without a webcam.
 *
 * Geometry follows an unmirrored front-facing camera, which is the detail most likely to be got
 * backwards: the camera looks *at* the player, so the subject's right eye lands on the low-x side
 * of the image and looking right moves the irises toward low x too. Pinning that here is what
 * stops a sign error from surviving until someone sits in front of a camera and steers the wrong
 * way.
 *
 * Interocular span is the unit. Outer corner to outer corner is 0.2 of the frame, matching a
 * player sitting at a normal desk distance.
 */
const EYE_SPAN = 0.2;
const EYE_WIDTH = 0.06;

interface FaceOptions {
  /** Iris displacement inside the socket, in units of eye width. Negative = looking right. */
  irisX?: number;
  irisY?: number;
  /** Nose displacement from face centre, in units of interocular span. Negative = turned right. */
  headYaw?: number;
  /** Nose displacement from face mid-height, in units of face height. Negative = tilted up. */
  headPitch?: number;
  /** Eyelid aperture as a fraction of eye width. 0.35 = open, 0.08 = shut. */
  aperture?: number;
  /** Face centre, for framing-quality tests. */
  cx?: number;
  cy?: number;
}

function makeFace(options: FaceOptions = {}): FaceLandmark[] {
  const {
    irisX = 0,
    irisY = 0,
    headYaw = 0,
    headPitch = 0,
    aperture = 0.35,
    cx = 0.5,
    cy = 0.5
  } = options;

  const p = (x: number, y: number): FaceLandmark => ({ x, y, z: 0 });
  const face: FaceLandmark[] = new Array(REQUIRED_LANDMARKS);

  const eyeY = cy - 0.05;
  // Subject's right eye sits on the low-x side of an unmirrored image.
  const rightOuter = cx - EYE_SPAN / 2;
  const rightInner = rightOuter + EYE_WIDTH;
  const leftOuter = cx + EYE_SPAN / 2;
  const leftInner = leftOuter - EYE_WIDTH;

  face[33] = p(rightOuter, eyeY);
  face[133] = p(rightInner, eyeY);
  face[362] = p(leftInner, eyeY);
  face[263] = p(leftOuter, eyeY);

  // Irises start centred between their corners, then displace by the requested fraction.
  face[468] = p((rightOuter + rightInner) / 2 + irisX * EYE_WIDTH, eyeY + irisY * EYE_WIDTH);
  face[473] = p((leftOuter + leftInner) / 2 + irisX * EYE_WIDTH, eyeY + irisY * EYE_WIDTH);

  const halfLid = (aperture * EYE_WIDTH) / 2;
  face[159] = p(rightInner, eyeY - halfLid);
  face[145] = p(rightInner, eyeY + halfLid);
  face[386] = p(leftInner, eyeY - halfLid);
  face[374] = p(leftInner, eyeY + halfLid);

  // Face box: edges define the horizontal midpoint, forehead and chin the vertical one.
  face[234] = p(cx - 0.12, cy);
  face[454] = p(cx + 0.12, cy);
  face[10] = p(cx, cy - 0.15);
  face[152] = p(cx, cy + 0.15);
  const faceHeight = 0.3;

  face[1] = p(cx + headYaw * EYE_SPAN, cy + headPitch * faceHeight);

  for (let i = 0; i < REQUIRED_LANDMARKS; i++) {
    if (!face[i]) face[i] = p(cx, cy);
  }
  return face;
}

const OPEN = { eyeBlinkLeft: 0.02, eyeBlinkRight: 0.02 };
const SHUT = { eyeBlinkLeft: 0.95, eyeBlinkRight: 0.95 };
const FRAME = 1 / 30;

/** Steps the mapper for a duration, as a real camera would. */
function hold(
  mapper: GazeMapper,
  face: FaceLandmark[] | null,
  blend: typeof OPEN | null,
  seconds: number
): void {
  const steps = Math.round(seconds / FRAME);
  for (let s = 0; s < steps; s++) mapper.update(face, blend, FRAME);
}

describe('geometry helpers', () => {
  it('measures interocular span as the face scale', () => {
    expect(faceScale(makeFace())).toBeCloseTo(EYE_SPAN, 5);
  });

  it('reports a centred iris as zero offset', () => {
    const offset = irisOffset(makeFace(), 468, 33, 133);
    expect(offset.x).toBeCloseTo(0, 5);
  });

  it('reports iris displacement in units of eye width', () => {
    const offset = irisOffset(makeFace({ irisX: 0.5 }), 468, 33, 133);
    expect(offset.x).toBeCloseTo(0.5, 5);
  });

  it('reads an open eye as near-zero closure and a shut one as near-one', () => {
    expect(lidClosure(makeFace({ aperture: 0.35 }), 159, 145, 33, 133)).toBeLessThan(0.05);
    expect(lidClosure(makeFace({ aperture: 0.08 }), 159, 145, 33, 133)).toBeGreaterThan(0.95);
  });
});

describe('gaze steering', () => {
  it('reports nothing when no face is present', () => {
    const mapper = new GazeMapper();
    const intent = mapper.update(null, null, FRAME);
    expect(intent.present).toBe(false);
    expect(intent.gazeX).toBe(0);
    expect(intent.gazeY).toBe(0);
  });

  it('rejects a landmark set without iris refinement', () => {
    const mapper = new GazeMapper();
    // The 468-point model lacks iris points entirely; steering from it would be invented data.
    const shortened = makeFace().slice(0, 468);
    expect(mapper.update(shortened, OPEN, FRAME).present).toBe(false);
  });

  it('holds still when the player looks straight ahead', () => {
    const mapper = new GazeMapper();
    const intent = mapper.update(makeFace(), OPEN, FRAME);
    expect(intent.present).toBe(true);
    expect(intent.gazeX).toBe(0);
    expect(intent.gazeY).toBe(0);
  });

  it('steers right when the eyes look right', () => {
    const mapper = new GazeMapper();
    // Looking right moves the irises toward low image x on an unmirrored camera.
    const intent = mapper.update(makeFace({ irisX: -0.1 }), OPEN, FRAME);
    expect(intent.gazeX).toBeGreaterThan(0.2);
  });

  it('steers left when the eyes look left', () => {
    const mapper = new GazeMapper();
    const intent = mapper.update(makeFace({ irisX: 0.1 }), OPEN, FRAME);
    expect(intent.gazeX).toBeLessThan(-0.2);
  });

  it('steers up when the eyes look up', () => {
    const mapper = new GazeMapper();
    // Image y grows downward, so looking up moves the irises to lower y. Vertical iris travel is
    // much shorter than horizontal, hence the smaller displacement.
    const intent = mapper.update(makeFace({ irisY: -0.05 }), OPEN, FRAME);
    expect(intent.gazeY).toBeGreaterThan(0.2);
  });

  it('lets head turn extend reach past the iris ceiling', () => {
    // Deliberately inside the unsaturated range: past full iris deflection the axis is already
    // clamped to 1 and the head contribution would be invisible, which says nothing about whether
    // the two signals actually sum.
    const eyesOnly = new GazeMapper().update(makeFace({ irisX: -0.08 }), OPEN, FRAME).gazeX;
    const withHead = new GazeMapper().update(
      makeFace({ irisX: -0.08, headYaw: -0.05 }),
      OPEN,
      FRAME
    ).gazeX;
    expect(eyesOnly).toBeLessThan(1);
    expect(withHead).toBeGreaterThan(eyesOnly);
  });

  it('clamps to the steering range however far the player turns', () => {
    const mapper = new GazeMapper();
    const intent = mapper.update(makeFace({ irisX: -3, headYaw: -2 }), OPEN, FRAME);
    expect(intent.gazeX).toBeLessThanOrEqual(1);
    expect(intent.gazeX).toBeGreaterThan(0.85);
  });

  it('zeroes steering the moment the face is lost', () => {
    const mapper = new GazeMapper();
    hold(mapper, makeFace({ irisX: -0.1 }), OPEN, 0.5);
    expect(mapper.intent.gazeX).toBeGreaterThan(0.2);

    // Leaning out of frame at speed must coast straight, not keep turning at the last angle.
    const intent = mapper.update(null, null, FRAME);
    expect(intent.gazeX).toBe(0);
    expect(intent.present).toBe(false);
  });

  it('holds the last heading rather than steering on landmarks behind shut eyelids', () => {
    const mapper = new GazeMapper();
    const looking = makeFace({ irisX: -0.1 });
    hold(mapper, looking, OPEN, 0.5);
    const heading = mapper.intent.gazeX;

    // Iris points are guesses once the lids close; the heading must not lurch. The shut face is
    // built looking hard the *other* way, so a regression here would be unmissable.
    const shutFace = makeFace({ irisX: 0.6, aperture: 0.08 });
    const intent = mapper.update(shutFace, SHUT, FRAME);
    expect(intent.gazeX).toBeCloseTo(heading, 5);
  });

  it('fades quality as the face nears the frame edge', () => {
    const mapper = new GazeMapper();
    const centred = mapper.update(makeFace(), OPEN, FRAME).quality;
    mapper.reset();
    const edge = mapper.update(makeFace({ cx: 0.02 }), OPEN, FRAME).quality;
    expect(centred).toBeGreaterThan(0.9);
    expect(edge).toBeLessThan(centred);
  });
});

describe('deliberate blink', () => {
  it('ignores an involuntary blink', () => {
    const mapper = new GazeMapper();
    hold(mapper, makeFace(), OPEN, 0.3);
    // A natural blink runs 100-150 ms. Firing on one would make the ability constant noise.
    hold(mapper, makeFace({ aperture: 0.08 }), SHUT, 0.13);
    expect(mapper.intent.dilating).toBe(false);
    expect(mapper.intent.dilationStarted).toBe(false);
  });

  it('fires once a hard blink passes the deliberate hold', () => {
    const mapper = new GazeMapper();
    hold(mapper, makeFace(), OPEN, 0.3);
    hold(mapper, makeFace({ aperture: 0.08 }), SHUT, DELIBERATE_HOLD_SECONDS + 0.08);
    expect(mapper.intent.dilating).toBe(true);
  });

  it('fires the trigger exactly once while the eyes stay shut', () => {
    const mapper = new GazeMapper();
    const shutFace = makeFace({ aperture: 0.08 });
    let fired = 0;
    for (let s = 0; s < 30; s++) {
      if (mapper.update(shutFace, SHUT, FRAME).dilationStarted) fired++;
    }
    expect(fired).toBe(1);
  });

  it('re-arms after the eyes reopen', () => {
    const mapper = new GazeMapper();
    const shutFace = makeFace({ aperture: 0.08 });

    hold(mapper, shutFace, SHUT, DELIBERATE_HOLD_SECONDS + 0.05);
    expect(mapper.intent.dilating).toBe(true);

    hold(mapper, makeFace(), OPEN, 0.2);
    expect(mapper.intent.dilating).toBe(false);

    let fired = 0;
    const steps = Math.round((DELIBERATE_HOLD_SECONDS + 0.05) / FRAME);
    for (let s = 0; s < steps; s++) {
      if (mapper.update(shutFace, SHUT, FRAME).dilationStarted) fired++;
    }
    expect(fired).toBe(1);
  });

  it('falls back to eyelid geometry when blendshapes are unavailable', () => {
    const mapper = new GazeMapper();
    // Same behaviour with no blendshape head — closure comes from lid aperture instead.
    hold(mapper, makeFace({ aperture: 0.08 }), null, DELIBERATE_HOLD_SECONDS + 0.08);
    expect(mapper.intent.dilating).toBe(true);
  });

  it('does not fire when only one eye closes', () => {
    const mapper = new GazeMapper();
    const wink = { eyeBlinkLeft: 0.95, eyeBlinkRight: 0.02 };
    hold(mapper, makeFace(), wink, 0.6);
    expect(mapper.intent.dilating).toBe(false);
    expect(mapper.intent.blinkLeft).toBeGreaterThan(0.9);
    expect(mapper.intent.blinkRight).toBeLessThan(0.1);
  });
});
