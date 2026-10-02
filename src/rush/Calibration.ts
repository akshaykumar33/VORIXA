/**
 * Per-player gaze calibration.
 *
 * How far a signal moves when someone looks at the left lane depends on their eyes, their
 * glasses, their camera and how far they sit from it. A fixed threshold that suits one player is
 * out of reach for the next — which reads as "eye steering doesn't work". Calibration records
 * where *this* player's gaze sits when they look left, centre and right, and steering is measured
 * against that.
 *
 * Pure: samples in, calibration out. The driving school collects the samples.
 */

export interface GazeCalibration {
  left: number;
  center: number;
  right: number;
}

/**
 * Used until the player calibrates. Deliberately generous: most people's raw gaze signal spans
 * roughly ±0.3 looking at the edges of a laptop screen.
 */
export const DEFAULT_GAZE_CALIBRATION: GazeCalibration = { left: -0.3, center: 0, right: 0.3 };

/** The smallest usable span. Anything narrower is a failed calibration, not a real player. */
const MIN_SPAN = 0.06;

/**
 * Maps a raw gaze value onto -1 (looking at the left lane), 0 (centre), +1 (right lane),
 * piecewise-linearly so an asymmetric player (camera off to one side) still gets symmetric lanes.
 */
export function normalizeGaze(raw: number, cal: GazeCalibration): number {
  if (raw >= cal.center) {
    const span = Math.max(cal.right - cal.center, MIN_SPAN);
    return (raw - cal.center) / span;
  }
  const span = Math.max(cal.center - cal.left, MIN_SPAN);
  return (raw - cal.center) / span;
}

/** Median: robust to the blinks and glances that land in any hold. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Checks a finished calibration. Returns a reason when it is unusable, so the school can ask the
 * player to try again with a specific hint rather than silently storing nonsense.
 */
export function validateCalibration(cal: GazeCalibration): string | null {
  if (cal.right - cal.center < MIN_SPAN || cal.center - cal.left < MIN_SPAN) {
    return 'Your eyes barely moved between lanes. Try turning your head a little as you look.';
  }
  if (cal.left >= cal.right) {
    return 'Left and right came out swapped. Look at the highlighted lane each time.';
  }
  return null;
}

const STORAGE_KEY = 'vorixa.rush.gazeCalibration';

export function loadCalibration(): GazeCalibration {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GAZE_CALIBRATION;
    const parsed = JSON.parse(raw) as Partial<GazeCalibration>;
    const cal = { left: Number(parsed.left), center: Number(parsed.center), right: Number(parsed.right) };
    if (![cal.left, cal.center, cal.right].every(Number.isFinite) || validateCalibration(cal)) {
      return DEFAULT_GAZE_CALIBRATION;
    }
    return cal;
  } catch {
    return DEFAULT_GAZE_CALIBRATION;
  }
}

export function saveCalibration(cal: GazeCalibration): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cal));
  } catch {
    // Calibration simply lasts for this visit only.
  }
}
