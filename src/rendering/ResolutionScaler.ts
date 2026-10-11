/**
 * Dynamic resolution scaling.
 *
 * A fixed render scale forces a choice between looking good on a desktop GPU and being playable on
 * a laptop, and whichever you pick is wrong for half your players. DRS makes the trade per-machine
 * and per-moment: when frames get expensive the renderer draws fewer pixels rather than fewer
 * frames.
 *
 * That direction matters. In a movement game, frame *rate* is input latency — a dropped frame is a
 * dropped input window, and at 200 km/h that is a missed jump. Resolution is just softness. Trading
 * the second for the first is nearly always right.
 *
 * ## Why the asymmetry
 *
 * Scaling down is quick and scaling up is slow and cautious. The failure mode of a symmetric
 * controller is oscillation: raise the scale, blow the budget, lower it, come in under, raise it
 * again — a visible pulsing that is far more objectionable than simply running a little soft.
 * Backing off fast and creeping back reproduces how a human would tune it.
 *
 * ## Why a high percentile, not an average
 *
 * An average hides exactly the frames that hurt. A run at a steady 9 ms with one 40 ms hitch every
 * ten frames averages comfortably inside budget while feeling terrible. The controller reacts to
 * the 90th percentile so it responds to the frames the player actually notices.
 *
 * Pure and frame-rate agnostic: give it frame times, get back a scale. No renderer, no DOM, no
 * clock — so the policy is testable, which a controller wired directly into a render loop is not.
 */

export interface ScalerOptions {
  /** Frame budget in milliseconds. 16.67 for 60 Hz, 6.94 for 144 Hz. */
  targetMs?: number;
  /** Lower bound. Below roughly half, the image is soft enough to be its own problem. */
  minScale?: number;
  maxScale?: number;
  /** Frames sampled before any decision, and the window the percentile is taken over. */
  windowSize?: number;
  /** Frames to wait after a change before considering another. */
  cooldownFrames?: number;
}

const DEFAULTS = {
  targetMs: 16.67,
  minScale: 0.55,
  maxScale: 1,
  windowSize: 45,
  cooldownFrames: 45
} as const;

/** Over budget by this factor before scaling down. A little headroom absorbs ordinary variance. */
const DOWNSCALE_TRIGGER = 1.08;
/** Must be this far *under* budget before scaling up, leaving room to grow into. */
const UPSCALE_TRIGGER = 0.7;
/** Down in meaningful bites, up in small ones. */
const DOWN_STEP = 0.1;
const UP_STEP = 0.05;

export class ResolutionScaler {
  private readonly targetMs: number;
  private readonly minScale: number;
  private readonly maxScale: number;
  private readonly windowSize: number;
  private readonly cooldownFrames: number;

  /** Ring buffer of recent frame times. Fixed size, so sampling never allocates. */
  private readonly samples: number[];
  private writeIndex = 0;
  private filled = 0;
  private cooldown = 0;

  private currentScale: number;

  public constructor(options: ScalerOptions = {}) {
    this.targetMs = options.targetMs ?? DEFAULTS.targetMs;
    this.minScale = options.minScale ?? DEFAULTS.minScale;
    this.maxScale = options.maxScale ?? DEFAULTS.maxScale;
    this.windowSize = options.windowSize ?? DEFAULTS.windowSize;
    this.cooldownFrames = options.cooldownFrames ?? DEFAULTS.cooldownFrames;
    this.samples = new Array<number>(this.windowSize).fill(0);
    this.currentScale = this.maxScale;
  }

  public get scale(): number {
    return this.currentScale;
  }

  /**
   * Feeds one frame time in.
   *
   * @returns The new scale when it changed this frame, otherwise null — so the caller can resize
   *          only when there is something to do. Resizing a WebGL target reallocates its buffers,
   *          which is exactly the work this is trying to avoid doing every frame.
   */
  public sample(frameMs: number): number | null {
    // A tab regaining focus reports a frame time of seconds. Treating that as load would slam the
    // scale to minimum for something that was never a rendering cost at all.
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) return null;

    this.samples[this.writeIndex] = frameMs;
    this.writeIndex = (this.writeIndex + 1) % this.windowSize;
    if (this.filled < this.windowSize) this.filled++;

    if (this.cooldown > 0) {
      this.cooldown--;
      return null;
    }
    // Decide on a full window only. Acting on a partial one means reacting to the load spike of
    // startup itself, when shaders are still compiling.
    if (this.filled < this.windowSize) return null;

    const p90 = this.percentile(0.9);
    let next = this.currentScale;

    if (p90 > this.targetMs * DOWNSCALE_TRIGGER) {
      next = Math.max(this.minScale, this.currentScale - DOWN_STEP);
    } else if (p90 < this.targetMs * UPSCALE_TRIGGER) {
      next = Math.min(this.maxScale, this.currentScale + UP_STEP);
    }

    if (next === this.currentScale) return null;

    this.currentScale = next;
    this.cooldown = this.cooldownFrames;
    // Discard the window: the frames just measured were rendered at the old scale and say nothing
    // about the new one. Keeping them would trigger a second change before the first took effect.
    this.filled = 0;
    return next;
  }

  /** Copies and sorts, so the ring buffer's order is preserved for later samples. */
  private percentile(fraction: number): number {
    const sorted = this.samples.slice(0, this.filled).sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
    return sorted[index];
  }

  /** Forgets history without changing the current scale. For a scene rebuild. */
  public reset(): void {
    this.filled = 0;
    this.writeIndex = 0;
    this.cooldown = 0;
  }
}
