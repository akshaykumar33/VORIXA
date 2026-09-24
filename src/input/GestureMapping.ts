/**
 * Hand landmarks → game intent.
 *
 * Deliberately separated from the camera and the MediaPipe runtime so that the part that makes
 * *decisions* can be tested without a webcam. Everything below is pure: give it 21 landmarks, get
 * back an intent.
 *
 * Designing for hands rather than pretending they are a keyboard:
 *
 *   - **Continuous where hands are good, discrete where they are not.** Tracking gives smooth,
 *     high-quality position and a noisy, laggy notion of "an event happened". So position drives
 *     steering (continuous, self-correcting — you see the error and move your hand back), while
 *     discrete actions use poses held across several frames rather than instantaneous flicks.
 *   - **Every threshold has hysteresis.** A single threshold sitting near the noise floor produces
 *     a machine-gun of on/off events the moment a player holds their hand still at the boundary.
 *     Separate make/break thresholds are the difference between "responsive" and "possessed".
 *   - **Scale-invariant features.** Every measurement is divided by the hand's own size, so
 *     leaning toward or away from the camera does not silently retune the gestures.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type HandLandmarks = readonly Landmark[];

/** MediaPipe hand landmark indices. */
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_TIP = 20;
const INDEX_PIP = 6;
const MIDDLE_PIP = 10;
const RING_PIP = 14;
const PINKY_PIP = 18;
/** A finger counts as extended when its tip is this much further from the wrist than its middle joint. */
const EXTENDED_RATIO = 1.18;

export interface GestureIntent {
  present: boolean;
  /** -1 (left) to +1 (right). Already dead-zoned and mirrored for a selfie camera. */
  steerX: number;
  /** -1 (down) to +1 (up). */
  steerY: number;
  /** 0 to 1. An open palm means go. */
  thrust: number;
  /** True while pinching — edge-detected by the caller if needed. */
  pinching: boolean;
  /** True while a fist is held. */
  fist: boolean;
  /** Fires once when a pinch begins. */
  pinchStarted: boolean;
  /** Fires once when a fist closes. */
  fistStarted: boolean;
  /** True while a peace sign (index and middle up, ring and pinky down) is held. */
  vSign: boolean;
  /** Fires once when a peace sign is made: slow motion, for players without eye control. */
  vSignStarted: boolean;
  /** 0–1 confidence-ish quality measure, used to fade the overlay rather than to gate input. */
  quality: number;
}

/** Pinch closes below this (relative to hand size) and reopens above `PINCH_RELEASE`. */
const PINCH_ENGAGE = 0.38;
const PINCH_RELEASE = 0.55;
/**
 * Curl is measured as mean fingertip-to-wrist distance in units of palm length. An extended
 * finger sits around 2.0 palm lengths from the wrist; a curled one folds back to roughly 1.0.
 * The make/break pair therefore straddles the midpoint rather than sitting near zero.
 */
const CURL_ENGAGE = 1.35;
const CURL_RELEASE = 1.62;
/** Mean ratio of a fully splayed hand, used as the top of the throttle ramp. */
const CURL_OPEN = 2.0;
/** Ignore hand tremor near the centre, or the view drifts while the player holds still. */
const STEER_DEADZONE = 0.07;
/** Hand offset, in units of hand width, that corresponds to full steering deflection. */
const STEER_RANGE = 0.26;

function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Hand size reference: wrist to middle-finger knuckle. Chosen because it is a rigid bone span —
 * it does not change when the fingers move, unlike anything measured to a fingertip.
 */
export function handScale(hand: HandLandmarks): number {
  return Math.max(distance(hand[WRIST], hand[MIDDLE_MCP]), 1e-4);
}

/** Palm centre from the three knuckle anchors, which is far steadier than the wrist point alone. */
export function palmCenter(hand: HandLandmarks): { x: number; y: number } {
  const a = hand[INDEX_MCP];
  const b = hand[PINKY_MCP];
  const c = hand[WRIST];
  return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
}

export function pinchAmount(hand: HandLandmarks): number {
  return distance(hand[THUMB_TIP], hand[INDEX_TIP]) / handScale(hand);
}

function extended(hand: HandLandmarks, tip: number, pip: number): boolean {
  const wrist = hand[WRIST];
  return distance(hand[tip], wrist) > distance(hand[pip], wrist) * EXTENDED_RATIO;
}

/**
 * A peace sign: index and middle fingers up, ring and pinky folded. Distinct from an open palm
 * (all four up), a fist (none up) and a pinch (thumb on index), so it never collides with them.
 */
export function isVSign(hand: HandLandmarks): boolean {
  return (
    extended(hand, INDEX_TIP, INDEX_PIP) &&
    extended(hand, MIDDLE_TIP, MIDDLE_PIP) &&
    !extended(hand, RING_TIP, RING_PIP) &&
    !extended(hand, PINKY_TIP, PINKY_PIP)
  );
}

/** Mean extension of the four fingers. Low means a closed fist. */
export function curlAmount(hand: HandLandmarks): number {
  const scale = handScale(hand);
  const wrist = hand[WRIST];
  const tips = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];
  let total = 0;
  for (const tip of tips) total += distance(hand[tip], wrist) / scale;
  return total / tips.length;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Applies a dead zone and rescales so output still reaches ±1 at full deflection. */
function deadzone(value: number): number {
  const sign = Math.sign(value);
  const magnitude = Math.abs(value);
  if (magnitude < STEER_DEADZONE) return 0;
  return sign * clamp((magnitude - STEER_DEADZONE) / (STEER_RANGE - STEER_DEADZONE), 0, 1);
}

export class GestureMapper {
  private pinching = false;
  private fist = false;
  private vSign = false;
  private smoothX = 0;
  private smoothY = 0;
  private hasSmoothed = false;

  public readonly intent: GestureIntent = {
    present: false,
    steerX: 0,
    steerY: 0,
    thrust: 0,
    pinching: false,
    fist: false,
    pinchStarted: false,
    fistStarted: false,
    vSign: false,
    vSignStarted: false,
    quality: 0
  };

  public reset(): void {
    this.pinching = false;
    this.fist = false;
    this.vSign = false;
    this.hasSmoothed = false;
    const i = this.intent;
    i.present = false;
    i.steerX = 0;
    i.steerY = 0;
    i.thrust = 0;
    i.pinching = false;
    i.fist = false;
    i.pinchStarted = false;
    i.fistStarted = false;
    i.vSign = false;
    i.vSignStarted = false;
    i.quality = 0;
  }

  /**
   * @param hand   21 landmarks, or null when no hand is detected this frame.
   * @param dt     Seconds since the last update, for frame-rate-independent smoothing.
   * @returns The mapper's own `intent` object, mutated in place — this runs every frame and must
   *          not allocate. Callers that need to compare across frames have to copy it.
   */
  public update(hand: HandLandmarks | null, dt: number): GestureIntent {
    const i = this.intent;
    i.pinchStarted = false;
    i.fistStarted = false;
    i.vSignStarted = false;

    if (!hand || hand.length < 21) {
      // Losing the hand must zero the controls rather than freeze them: a stuck "full throttle"
      // because the player's hand left the frame is the worst possible failure here.
      this.reset();
      return i;
    }

    i.present = true;

    const center = palmCenter(hand);
    // The raw camera image is *not* mirrored: a front-facing camera looks back at the player, so
    // moving a hand to your own right moves it toward low image x. Negating recovers the mapping
    // the player expects — hand right, view right.
    const rawX = 0.5 - center.x;
    // Image y grows downward, so this is already "up is positive".
    const rawY = 0.5 - center.y;

    // Exponential smoothing: tracking jitter of a pixel or two reads as a twitchy camera.
    const alpha = 1 - Math.exp(-14 * dt);
    if (!this.hasSmoothed) {
      this.smoothX = rawX;
      this.smoothY = rawY;
      this.hasSmoothed = true;
    } else {
      this.smoothX += (rawX - this.smoothX) * alpha;
      this.smoothY += (rawY - this.smoothY) * alpha;
    }

    i.steerX = deadzone(this.smoothX);
    i.steerY = deadzone(this.smoothY);

    const pinch = pinchAmount(hand);
    if (!this.pinching && pinch < PINCH_ENGAGE) {
      this.pinching = true;
      i.pinchStarted = true;
    } else if (this.pinching && pinch > PINCH_RELEASE) {
      this.pinching = false;
    }
    i.pinching = this.pinching;

    const curl = curlAmount(hand);
    if (!this.fist && curl < CURL_ENGAGE) {
      this.fist = true;
      i.fistStarted = true;
    } else if (this.fist && curl > CURL_RELEASE) {
      this.fist = false;
    }
    i.fist = this.fist;

    const v = !this.fist && !this.pinching && isVSign(hand);
    i.vSignStarted = v && !this.vSign;
    this.vSign = v;
    i.vSign = v;

    // An open palm is the throttle. Ramp between the fist threshold and a clearly open hand so
    // thrust is proportional rather than a switch — half-open means half speed.
    i.thrust = this.fist ? 0 : clamp((curl - CURL_ENGAGE) / (CURL_OPEN - CURL_ENGAGE), 0, 1);

    // Quality drops when the hand is tiny (too far away) or clipped by the frame edge.
    const scale = handScale(hand);
    const edge = Math.min(center.x, 1 - center.x, center.y, 1 - center.y);
    i.quality = clamp(Math.min(scale / 0.09, 1) * clamp(edge / 0.06, 0, 1), 0, 1);

    return i;
  }
}
