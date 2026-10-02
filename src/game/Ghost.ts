/**
 * Ghost recording and playback.
 *
 * The ghost is the reason a solo time-attack game has tension. Without an opponent on screen, a
 * run is a number you compare afterwards; with one, you are losing to something *right now*, and
 * you can see exactly where. It is the cheapest multiplayer there is — you race yourself.
 *
 * Samples are taken on a fixed clock rather than per frame, so a recording made at 144 Hz replays
 * identically on a 60 Hz machine.
 */

const SAMPLE_RATE = 30;
const SAMPLE_INTERVAL = 1 / SAMPLE_RATE;
const STORAGE_KEY = 'vorixa.course-01.ghost';

export interface GhostFrame {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Flat `[x, y, z, yaw]` quads at `SAMPLE_RATE`. Flat because it serialises small and reads fast. */
export type GhostData = number[];

export class GhostRecorder {
  private data: GhostData = [];
  private nextSampleTime = 0;

  public start(): void {
    this.data = [];
    this.nextSampleTime = 0;
  }

  public sample(elapsed: number, x: number, y: number, z: number, yaw: number): void {
    // Catch up if a frame hitch skipped past several sample slots, so the recording's timeline
    // stays aligned with the clock rather than drifting short.
    while (elapsed >= this.nextSampleTime) {
      this.data.push(round(x), round(y), round(z), round(yaw));
      this.nextSampleTime += SAMPLE_INTERVAL;
    }
  }

  public take(): GhostData {
    return this.data;
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

export class GhostPlayback {
  private readonly data: GhostData;

  constructor(data: GhostData) {
    this.data = data;
  }

  public get frameCount(): number {
    return Math.floor(this.data.length / 4);
  }

  public get duration(): number {
    return this.frameCount / SAMPLE_RATE;
  }

  /** Interpolated pose at `elapsed`, or null once the ghost has finished its run. */
  public sampleAt(elapsed: number, out: GhostFrame): GhostFrame | null {
    const count = this.frameCount;
    if (count === 0) return null;

    const exact = elapsed * SAMPLE_RATE;
    const i0 = Math.floor(exact);
    if (i0 >= count - 1) {
      // Hold the final pose rather than vanishing: a ghost that blinks out at the finish line
      // reads as a bug, not as a result.
      const base = (count - 1) * 4;
      out.x = this.data[base];
      out.y = this.data[base + 1];
      out.z = this.data[base + 2];
      out.yaw = this.data[base + 3];
      return elapsed > this.duration + 1.5 ? null : out;
    }

    const t = exact - i0;
    const a = i0 * 4;
    const b = a + 4;
    out.x = lerp(this.data[a], this.data[b], t);
    out.y = lerp(this.data[a + 1], this.data[b + 1], t);
    out.z = lerp(this.data[a + 2], this.data[b + 2], t);
    out.yaw = lerpAngle(this.data[a + 3], this.data[b + 3], t);
    return out;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolates the short way round, so a ghost crossing ±π does not spin on the spot. */
function lerpAngle(a: number, b: number, t: number): number {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

export function saveGhost(data: GhostData): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded or private mode: the in-memory ghost still races this session.
  }
}

export function loadGhost(): GhostData | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length < 4) return null;
    return parsed as GhostData;
  } catch {
    return null;
  }
}
