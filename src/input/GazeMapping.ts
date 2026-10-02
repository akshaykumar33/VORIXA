/**
 * Turns face landmarks into steering intent.
 *
 * The counterpart to `GestureMapping`, and pure for the same reason: every decision about what a
 * face *means* lives here where it can be tested against fixture landmarks, while everything that
 * needs a camera lives in `FaceTracker`. Effects there, decisions here.
 *
 * Two signals are combined into one steering axis:
 *
 *   - **Eye-in-head**: where the iris sits inside its socket. Fast, precise, and how players
 *     expect to aim, but it saturates — an eye can only travel so far before the head follows.
 *   - **Head pose**: where the face is pointing. Slower and coarser, but unbounded.
 *
 * Using either alone feels wrong. Iris-only cannot reach the edges of a wide view and makes
 * players strain. Head-only ignores the flick of attention that makes gaze control feel telepathic.
 * Summing them reproduces how people actually look at things: eyes lead, head follows.
 *
 * Distances are normalised against facial spans — interocular width, face height — so that leaning
 * toward or away from the camera does not retune the controls, matching the hand mapper's use of
 * palm length.
 */

export interface FaceLandmark {
  x: number;
  y: number;
  z: number;
}

export type FaceLandmarks = readonly FaceLandmark[];

/**
 * The two blink scores from MediaPipe's blendshape head.
 *
 * Preferred over measuring eyelid geometry ourselves: the model was trained on closure directly,
 * so it stays honest through squints, glasses, and partial occlusion where an eyelid-distance
 * ratio quietly falls apart. Geometry remains as a fallback for when blendshapes are unavailable.
 */
export interface BlendshapeScores {
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
}

/**
 * MediaPipe Face Landmarker indices (478-point model, iris refinement enabled).
 * "Left" and "right" are the subject's own, which is how the model labels them — note that the
 * subject's right eye appears on the *left* of an unmirrored camera image.
 */
const RIGHT_IRIS_CENTER = 468;
const LEFT_IRIS_CENTER = 473;
const RIGHT_EYE_OUTER = 33;
const RIGHT_EYE_INNER = 133;
const LEFT_EYE_INNER = 362;
const LEFT_EYE_OUTER = 263;
const RIGHT_LID_UPPER = 159;
const RIGHT_LID_LOWER = 145;
const LEFT_LID_UPPER = 386;
const LEFT_LID_LOWER = 374;
const NOSE_TIP = 1;
const FACE_EDGE_RIGHT = 234;
const FACE_EDGE_LEFT = 454;
const FOREHEAD = 10;
const CHIN = 152;

/** Landmark count of the iris-refined model. Anything shorter lacks iris points entirely. */
export const REQUIRED_LANDMARKS = 478;

/**
 * How far the iris travels inside the socket at full comfortable deflection, as a fraction of
 * corner-to-corner eye width. Real eyes can exceed this; the ceiling is deliberately short of
 * anatomical maximum so the player is never asked to strain to reach full steering.
 */
const IRIS_RANGE = 0.17;
/** Head yaw at full deflection, as a fraction of face width. */
const HEAD_YAW_RANGE = 0.13;
/** Head pitch at full deflection, as a fraction of face height. */
const HEAD_PITCH_RANGE = 0.09;
/** Vertical iris travel is far shorter than horizontal, so it gets its own, tighter range. */
const IRIS_RANGE_Y = 0.09;

/**
 * Blend weights. Eyes dominate because they are what the player is consciously aiming; the head
 * contributes enough to extend reach past the iris ceiling without feeling like it drags.
 */
const EYE_WEIGHT = 0.68;
const HEAD_WEIGHT = 0.32;

/** Ignore micro-saccades near centre, or the view drifts while the player stares straight ahead. */
const GAZE_DEADZONE = 0.08;

/** Blink make/break pair. Split so a half-open eye does not chatter across the boundary. */
const BLINK_ENGAGE = 0.62;
const BLINK_RELEASE = 0.38;

/**
 * How long both eyes must stay shut before it counts as deliberate.
 *
 * An involuntary blink runs roughly 100–150 ms. Firing at anything under that would make the
 * ability trigger constantly while the player simply keeps their eyes wet, which is the fastest
 * way to make gaze control feel broken. 220 ms is comfortably past natural blink duration and
 * still fast enough to feel like a button.
 */
const DELIBERATE_HOLD_SECONDS = 0.22;

/** Smoothing rate. Higher tracks faster and jitters more; tuned against saccade noise at 30 fps. */
const SMOOTHING_RATE = 11;

export interface GazeIntent {
  present: boolean;
  /** -1 (left) to +1 (right), already dead-zoned and in player space. */
  gazeX: number;
  /** -1 (down) to +1 (up). */
  gazeY: number;
  /** 0–1 closure per eye, exposed for the overlay and for one-eyed gestures later. */
  blinkLeft: number;
  blinkRight: number;
  /** True while both eyes are held shut past the deliberate threshold. */
  dilating: boolean;
  /** Fires once on the frame a deliberate hard blink is recognised. */
  dilationStarted: boolean;
  /** 0–1 tracking confidence, used to fade the overlay rather than to gate input. */
  quality: number;
}

function distance(a: FaceLandmark, b: FaceLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Applies a dead zone and rescales so output still reaches ±1 at full deflection. */
function deadzone(value: number): number {
  const sign = Math.sign(value);
  const magnitude = Math.abs(value);
  if (magnitude < GAZE_DEADZONE) return 0;
  return sign * clamp((magnitude - GAZE_DEADZONE) / (1 - GAZE_DEADZONE), 0, 1);
}

/** Interocular span: outer corner to outer corner. A rigid reference that ignores expression. */
export function faceScale(face: FaceLandmarks): number {
  return Math.max(distance(face[RIGHT_EYE_OUTER], face[LEFT_EYE_OUTER]), 1e-4);
}

/**
 * Signed iris offset within one eye socket, in units of that eye's width.
 *
 * Zero means centred between the corners. Positive means displaced toward increasing image x.
 */
export function irisOffset(
  face: FaceLandmarks,
  irisIndex: number,
  cornerA: number,
  cornerB: number
): { x: number; y: number } {
  const a = face[cornerA];
  const b = face[cornerB];
  const iris = face[irisIndex];
  const width = Math.max(distance(a, b), 1e-4);
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  return { x: (iris.x - midX) / width, y: (iris.y - midY) / width };
}

/**
 * Eyelid aperture as a fraction of eye width — the classic eye-aspect-ratio blink measure.
 *
 * Only used when blendshapes are absent. Returned as *closure* (1 = shut) so it composes with the
 * blendshape path without the caller needing to know which produced it.
 */
export function lidClosure(
  face: FaceLandmarks,
  upper: number,
  lower: number,
  cornerA: number,
  cornerB: number
): number {
  const width = Math.max(distance(face[cornerA], face[cornerB]), 1e-4);
  const aperture = distance(face[upper], face[lower]) / width;
  // An open eye sits near 0.35 of its width; a shut one collapses toward 0.08. Map that span to
  // 0–1 closure rather than reporting a raw ratio nothing downstream could interpret.
  return clamp(1 - (aperture - 0.08) / (0.35 - 0.08), 0, 1);
}

export class GazeMapper {
  private bothShut = false;
  private shutSeconds = 0;
  private dilationFired = false;
  private smoothX = 0;
  private smoothY = 0;
  private hasSmoothed = false;

  public readonly intent: GazeIntent = {
    present: false,
    gazeX: 0,
    gazeY: 0,
    blinkLeft: 0,
    blinkRight: 0,
    dilating: false,
    dilationStarted: false,
    quality: 0
  };

  public reset(): void {
    this.bothShut = false;
    this.shutSeconds = 0;
    this.dilationFired = false;
    this.hasSmoothed = false;
    const i = this.intent;
    i.present = false;
    i.gazeX = 0;
    i.gazeY = 0;
    i.blinkLeft = 0;
    i.blinkRight = 0;
    i.dilating = false;
    i.dilationStarted = false;
    i.quality = 0;
  }

  /**
   * @param face  478 landmarks, or null when no face is detected this frame.
   * @param blend Blendshape blink scores, or null to fall back to eyelid geometry.
   * @param dt    Seconds since the last update, for frame-rate-independent smoothing.
   * @returns The mapper's own `intent`, mutated in place — this runs every frame and must not
   *          allocate. Callers needing cross-frame comparison have to copy it.
   */
  public update(
    face: FaceLandmarks | null,
    blend: BlendshapeScores | null,
    dt: number
  ): GazeIntent {
    const i = this.intent;
    i.dilationStarted = false;

    if (!face || face.length < REQUIRED_LANDMARKS) {
      // Losing the face must zero steering rather than freeze it. A player who leans out of frame
      // at speed should coast straight, not keep turning into a wall at the last angle seen.
      this.reset();
      return i;
    }

    i.present = true;

    const closureLeft = blend
      ? clamp(blend.eyeBlinkLeft, 0, 1)
      : lidClosure(face, LEFT_LID_UPPER, LEFT_LID_LOWER, LEFT_EYE_INNER, LEFT_EYE_OUTER);
    const closureRight = blend
      ? clamp(blend.eyeBlinkRight, 0, 1)
      : lidClosure(face, RIGHT_LID_UPPER, RIGHT_LID_LOWER, RIGHT_EYE_OUTER, RIGHT_EYE_INNER);

    i.blinkLeft = closureLeft;
    i.blinkRight = closureRight;

    this.updateDilation(closureLeft, closureRight, dt);

    // Behind shut eyelids the iris landmarks are guesses. Holding the last good heading is far
    // better than steering on invented data — and during a deliberate hard blink the player is
    // not trying to steer at all.
    const eyesUsable = closureLeft < BLINK_ENGAGE && closureRight < BLINK_ENGAGE;

    if (eyesUsable) {
      const right = irisOffset(face, RIGHT_IRIS_CENTER, RIGHT_EYE_OUTER, RIGHT_EYE_INNER);
      const left = irisOffset(face, LEFT_IRIS_CENTER, LEFT_EYE_INNER, LEFT_EYE_OUTER);
      const irisX = (right.x + left.x) / 2;
      const irisY = (right.y + left.y) / 2;

      const scale = faceScale(face);
      const faceMidX = (face[FACE_EDGE_RIGHT].x + face[FACE_EDGE_LEFT].x) / 2;
      const faceHeight = Math.max(distance(face[FOREHEAD], face[CHIN]), 1e-4);
      const faceMidY = (face[FOREHEAD].y + face[CHIN].y) / 2;

      const headYaw = (face[NOSE_TIP].x - faceMidX) / scale;
      const headPitch = (face[NOSE_TIP].y - faceMidY) / faceHeight;

      // The camera image is not mirrored: a front-facing camera looks back at the player, so
      // looking to your own right moves both iris and nose toward *low* image x. Negating
      // recovers the mapping the player expects — look right, steer right.
      const rawX = -(
        EYE_WEIGHT * (irisX / IRIS_RANGE) +
        HEAD_WEIGHT * (headYaw / HEAD_YAW_RANGE)
      );
      // Image y grows downward while "up" must be positive, so this negates too.
      const rawY = -(
        EYE_WEIGHT * (irisY / IRIS_RANGE_Y) +
        HEAD_WEIGHT * (headPitch / HEAD_PITCH_RANGE)
      );

      const alpha = 1 - Math.exp(-SMOOTHING_RATE * dt);
      if (!this.hasSmoothed) {
        this.smoothX = rawX;
        this.smoothY = rawY;
        this.hasSmoothed = true;
      } else {
        this.smoothX += (rawX - this.smoothX) * alpha;
        this.smoothY += (rawY - this.smoothY) * alpha;
      }
    }

    i.gazeX = deadzone(clamp(this.smoothX, -1, 1));
    i.gazeY = deadzone(clamp(this.smoothY, -1, 1));

    // Quality falls off when the face is small (too far to resolve an iris) or near the frame
    // edge, mirroring the hand mapper so the overlay behaves consistently across both trackers.
    const scale = faceScale(face);
    const nose = face[NOSE_TIP];
    const edge = Math.min(nose.x, 1 - nose.x, nose.y, 1 - nose.y);
    i.quality = clamp(Math.min(scale / 0.11, 1) * clamp(edge / 0.08, 0, 1), 0, 1);

    return i;
  }

  /**
   * Recognises a deliberate hard blink.
   *
   * Hysteresis on the closure threshold stops a fluttering eyelid from re-arming, and the hold
   * timer separates intent from reflex. The trigger fires once on crossing the hold threshold —
   * not on release — so the effect lands while the player's eyes are still shut, which is what
   * makes it feel like a button rather than a delayed gesture.
   */
  private updateDilation(closureLeft: number, closureRight: number, dt: number): void {
    const i = this.intent;
    const shutNow = this.bothShut
      ? closureLeft > BLINK_RELEASE && closureRight > BLINK_RELEASE
      : closureLeft > BLINK_ENGAGE && closureRight > BLINK_ENGAGE;

    if (!shutNow) {
      this.bothShut = false;
      this.shutSeconds = 0;
      this.dilationFired = false;
      i.dilating = false;
      return;
    }

    this.bothShut = true;
    this.shutSeconds += dt;

    if (this.shutSeconds >= DELIBERATE_HOLD_SECONDS) {
      if (!this.dilationFired) {
        this.dilationFired = true;
        i.dilationStarted = true;
      }
      i.dilating = true;
    }
  }
}

export {
  BLINK_ENGAGE,
  BLINK_RELEASE,
  DELIBERATE_HOLD_SECONDS,
  GAZE_DEADZONE,
  EYE_WEIGHT,
  HEAD_WEIGHT
};
