/**
 * Keeps a MediaPipe landmarker alive.
 *
 * Two failure modes made camera control look "broken" with no explanation:
 *
 *  1. **Timestamps.** A VIDEO-mode landmarker requires strictly increasing timestamps. One
 *     out-of-order or repeated timestamp (a clock hiccup, a tab resuming) raises "Packet
 *     timestamp mismatch" and leaves the graph permanently errored — every later frame fails.
 *     `timestamp()` makes them strictly increasing no matter what the clock does.
 *  2. **Silent death.** Detection errors were caught per frame and treated as "no face / no
 *     hand", so a dead graph looked exactly like the player being out of view. `failed()` counts
 *     consecutive failures so the tracker can rebuild itself, and report an error if it can't.
 *
 * Also: some machines cannot run the models on the GPU. `withDelegateFallback` retries on the CPU.
 */
export class VisionGuard {
  private lastTimestamp = 0;
  private failures = 0;

  /** Consecutive failed frames before the landmarker is rebuilt. */
  public static readonly REBUILD_AFTER = 8;

  /** A strictly increasing timestamp (ms) for the next detection. */
  public timestamp(now: number): number {
    const ts = Math.max(Math.floor(now), this.lastTimestamp + 1);
    this.lastTimestamp = ts;
    return ts;
  }

  public succeeded(): void {
    this.failures = 0;
  }

  /** Records a failed frame; true when it is time to rebuild. */
  public failed(): boolean {
    this.failures++;
    return this.failures >= VisionGuard.REBUILD_AFTER;
  }

  public reset(): void {
    this.failures = 0;
    this.lastTimestamp = 0;
  }
}

export type Delegate = 'GPU' | 'CPU';

/** Tries the GPU first, then the CPU. The error from the last attempt is rethrown. */
export async function withDelegateFallback<T>(create: (delegate: Delegate) => Promise<T>): Promise<{ value: T; delegate: Delegate }> {
  try {
    return { value: await create('GPU'), delegate: 'GPU' };
  } catch {
    return { value: await create('CPU'), delegate: 'CPU' };
  }
}
