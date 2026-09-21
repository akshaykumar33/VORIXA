import type { HandLandmarks } from '../input/GestureMapping';
import type { GestureIntent } from '../input/GestureMapping';
import type { TrackerStatus } from '../input/HandTracker';
import type { CourseData } from '../game/Course';

/**
 * The 2D instrument layer, drawn on a canvas above the 3D world.
 *
 * Two jobs, and the second is the important one:
 *
 *   1. Show information that is genuinely 2D — a route map, a gauge, a hand skeleton — where a
 *      flat, precise, always-legible projection beats anything placed in the scene.
 *   2. **Close the feedback loop on gesture input.** This is what separates camera controls that
 *      feel magical from ones that feel broken. When the game does not respond to a gesture, the
 *      player must be able to see *why*: hand not detected, hand off the edge of frame, pinch not
 *      quite closed. Without that, every tracking failure reads as the game ignoring them, and
 *      they have no way to learn the gesture. The skeleton and the state chips are not decoration;
 *      they are the manual.
 *
 * Everything is drawn in CSS pixels and scaled by device pixel ratio, so it stays crisp on
 * high-density displays without the layout maths changing.
 */

const ACCENT = '#00f0ff';
const GOOD = '#00f59b';
const WARN = '#ffb703';
const BAD = '#ff0055';
const DIM = '#5d6b7e';
const MONO = '600 11px ui-monospace, "JetBrains Mono", Menlo, monospace';

/** MediaPipe hand skeleton, as bone pairs. */
const BONES: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

export interface OverlayState {
  course: CourseData;
  playerX: number;
  playerZ: number;
  ghostX: number | null;
  ghostZ: number | null;
  checkpointIndex: number;
  speed: number;
  maxSpeed: number;
  gestureEnabled: boolean;
  trackerStatus: TrackerStatus;
  trackerError: string;
  intent: GestureIntent | null;
  landmarks: HandLandmarks | null;
  video: HTMLVideoElement | null;
}

export class Overlay2D {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;

  public attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  public resize(width: number, height: number): void {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.width = width;
    this.height = height;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public draw(state: OverlayState): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawRouteMap(ctx, state);
    this.drawSpeedArc(ctx, state);
    if (state.gestureEnabled) this.drawHandPanel(ctx, state);
  }

  // ── Route map ─────────────────────────────────────────────────────────────
  /**
   * A top-down strip of the whole course. In a time-attack game the player is always asking "how
   * much is left?", and a map answers it without them having to look away from the crosshair.
   */
  private drawRouteMap(ctx: CanvasRenderingContext2D, s: OverlayState): void {
    const panelW = 58;
    const panelH = Math.min(this.height * 0.52, 420);
    const x = this.width - panelW - 26;
    const y = (this.height - panelH) / 2;

    const startZ = s.course.spawnZ;
    const endZ = s.course.finishZ;
    const toY = (z: number) => y + ((z - startZ) / (endZ - startZ)) * panelH;
    const toX = (wx: number) => x + panelW / 2 + (wx / 9) * (panelW / 2 - 8);

    ctx.save();
    ctx.fillStyle = 'rgba(8, 12, 20, 0.55)';
    this.roundRect(ctx, x, y - 14, panelW, panelH + 28, 10);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + panelW / 2, y);
    ctx.lineTo(x + panelW / 2, y + panelH);
    ctx.stroke();

    // Checkpoint ticks, filled once banked.
    for (const cp of s.course.checkpoints) {
      if (cp.index === 0) continue;
      const cy = toY(cp.triggerZ);
      const passed = cp.index <= s.checkpointIndex;
      ctx.strokeStyle = passed ? GOOD : 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = passed ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x + 10, cy);
      ctx.lineTo(x + panelW - 10, cy);
      ctx.stroke();
    }

    // Finish line.
    ctx.strokeStyle = GOOD;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + panelH);
    ctx.lineTo(x + panelW - 6, y + panelH);
    ctx.stroke();

    if (s.ghostX !== null && s.ghostZ !== null) {
      ctx.fillStyle = 'rgba(0, 240, 255, 0.45)';
      ctx.beginPath();
      ctx.arc(toX(s.ghostX), toY(s.ghostZ), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const px = toX(s.playerX);
    const py = toY(s.playerZ);
    ctx.fillStyle = '#e8eef5';
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = MONO;
    ctx.fillStyle = DIM;
    ctx.textAlign = 'center';
    ctx.fillText('ROUTE', x + panelW / 2, y - 20);
    ctx.restore();
  }

  // ── Speed arc ─────────────────────────────────────────────────────────────
  private drawSpeedArc(ctx: CanvasRenderingContext2D, s: OverlayState): void {
    const cx = this.width / 2;
    const cy = this.height - 62;
    const radius = 74;
    const start = Math.PI * 0.78;
    const end = Math.PI * 2.22;
    const fraction = Math.min(s.speed / s.maxSpeed, 1);

    ctx.save();
    ctx.lineCap = 'round';

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, end);
    ctx.stroke();

    // Colour shifts toward warning at the top of the range, so peak speed is felt as an event.
    const colour = fraction > 0.85 ? WARN : ACCENT;
    ctx.strokeStyle = colour;
    ctx.shadowColor = colour;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + (end - start) * fraction);
    ctx.stroke();
    ctx.restore();
  }

  // ── Hand tracking panel ───────────────────────────────────────────────────
  private drawHandPanel(ctx: CanvasRenderingContext2D, s: OverlayState): void {
    const w = 190;
    const h = 143;
    const x = 26;
    const y = this.height - h - 26;

    ctx.save();
    ctx.fillStyle = 'rgba(8, 12, 20, 0.72)';
    this.roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = s.intent?.present ? 'rgba(0, 240, 255, 0.45)' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const feedY = y + 22;
    const feedH = h - 46;

    // Mirrored camera feed, so the player sees themselves as in a mirror and the mapping from
    // "move my hand right" to "the marker goes right" is immediate.
    if (s.video && s.video.readyState >= 2) {
      ctx.save();
      this.roundRect(ctx, x + 10, feedY, w - 20, feedH, 8);
      ctx.clip();
      ctx.translate(x + 10 + (w - 20), feedY);
      ctx.scale(-1, 1);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(s.video, 0, 0, w - 20, feedH);
      ctx.restore();
    }

    if (s.landmarks && s.landmarks.length >= 21) {
      this.drawSkeleton(ctx, s.landmarks, x + 10, feedY, w - 20, feedH, s.intent);
    }

    ctx.font = MONO;
    ctx.textAlign = 'left';
    ctx.fillStyle = DIM;
    ctx.fillText('HAND CONTROL', x + 12, y + 15);

    const status = this.statusLabel(s);
    ctx.textAlign = 'right';
    ctx.fillStyle = status.colour;
    ctx.fillText(status.text, x + w - 12, y + 15);

    // Thrust bar, plus chips for the two discrete gestures.
    const barY = y + h - 15;
    const barW = w - 24;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    this.roundRect(ctx, x + 12, barY, barW, 5, 2.5);
    ctx.fill();
    if (s.intent?.present) {
      ctx.fillStyle = s.intent.thrust > 0.28 ? GOOD : DIM;
      this.roundRect(ctx, x + 12, barY, barW * s.intent.thrust, 5, 2.5);
      ctx.fill();
    }

    if (s.intent?.pinching) this.chip(ctx, x + w - 58, y + h - 36, 'DASH', WARN);
    if (s.intent?.fist) this.chip(ctx, x + w - 112, y + h - 36, 'JUMP', ACCENT);
    ctx.restore();
  }

  private statusLabel(s: OverlayState): { text: string; colour: string } {
    switch (s.trackerStatus) {
      case 'running':
        if (!s.intent?.present) return { text: 'SHOW HAND', colour: WARN };
        if (s.intent.quality < 0.4) return { text: 'MOVE CLOSER', colour: WARN };
        return { text: 'TRACKING', colour: GOOD };
      case 'loading':
        return { text: 'LOADING', colour: DIM };
      case 'requesting-camera':
        return { text: 'ALLOW CAMERA', colour: WARN };
      case 'denied':
        return { text: 'NO PERMISSION', colour: BAD };
      case 'unsupported':
        return { text: 'UNSUPPORTED', colour: BAD };
      case 'error':
        return { text: 'ERROR', colour: BAD };
      default:
        return { text: 'OFF', colour: DIM };
    }
  }

  private drawSkeleton(
    ctx: CanvasRenderingContext2D,
    hand: HandLandmarks,
    x: number,
    y: number,
    w: number,
    h: number,
    intent: GestureIntent | null
  ): void {
    // Mirror x to match the flipped feed.
    const px = (i: number) => x + (1 - hand[i].x) * w;
    const py = (i: number) => y + hand[i].y * h;

    ctx.save();
    ctx.strokeStyle = intent?.present ? ACCENT : DIM;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (const [a, b] of BONES) {
      ctx.moveTo(px(a), py(a));
      ctx.lineTo(px(b), py(b));
    }
    ctx.stroke();

    ctx.fillStyle = '#e8eef5';
    for (let i = 0; i < 21; i++) {
      ctx.beginPath();
      ctx.arc(px(i), py(i), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Highlight the pinch pair, because "how close is close enough" is the hardest thing to
    // learn about a pinch gesture and the only way to teach it is to show it.
    const pinching = intent?.pinching ?? false;
    ctx.strokeStyle = pinching ? WARN : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = pinching ? 2.6 : 1.2;
    ctx.beginPath();
    ctx.moveTo(px(4), py(4));
    ctx.lineTo(px(8), py(8));
    ctx.stroke();
    ctx.restore();
  }

  private chip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    colour: string
  ): void {
    ctx.save();
    ctx.fillStyle = colour;
    ctx.globalAlpha = 0.18;
    this.roundRect(ctx, x, y, 48, 16, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colour;
    ctx.font = MONO;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + 24, y + 11.5);
    ctx.restore();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
}
