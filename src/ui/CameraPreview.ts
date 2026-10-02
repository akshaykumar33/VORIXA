import type { HandLandmarks } from '../input/GestureMapping';
import type { FaceLandmarks } from '../input/GazeMapping';

/**
 * A small mirrored webcam view with what the trackers see drawn on top.
 *
 * Without it, gaze and gesture control are a black box: when a fist does not jump, the player
 * cannot tell whether the camera lost their hand, the gesture was misread, or the game ignored
 * it. With it they can see their hand skeleton, their irises, and a plain-words readout of what
 * the game thinks they are doing — and fix it themselves (move into the light, bring the hand
 * into frame) instead of concluding the feature is broken.
 */

/** Finger chains of the 21-point hand model, from the wrist out. */
const HAND_BONES: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [5, 9, 10, 11, 12],
  [9, 13, 14, 15, 16],
  [13, 17, 18, 19, 20],
  [0, 17]
];
const IRISES = [468, 473];
const FACE_OUTLINE = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];

const CSS = /* css */ `
#rush-hud .camera {
  position: absolute; left: 20px; bottom: calc(max(20px, env(safe-area-inset-bottom)) + 96px);
  width: 208px; border-radius: 16px; overflow: hidden; background: #1d1b33;
  box-shadow: 0 0 0 3px var(--ink), 0 5px 0 3px var(--ink);
}
#rush-hud .camera canvas { display: block; width: 100%; height: auto; }
#rush-hud .camera .read {
  display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 8px; background: var(--cream); color: var(--ink);
  font-size: 12px; letter-spacing: 0.03em;
}
#rush-hud .camera .read span { padding: 1px 7px; border-radius: 999px; background: #fff; box-shadow: 0 0 0 2px var(--ink); }
#rush-hud .camera .read span.on { background: #3ddc84; }
#rush-hud .camera .read span.warn { background: #ffb3b3; }
@media (max-width: 900px) { #rush-hud .camera { width: 150px; } }
`;

export interface PreviewReadout {
  text: string;
  tone: 'on' | 'warn' | 'plain';
}

export class CameraPreview {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly read: HTMLElement;
  private lastReadout = '';

  public constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.className = 'camera';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Camera preview');
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 240;
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable for the camera preview');
    this.g = g;
    this.read = document.createElement('div');
    this.read.className = 'read';
    this.read.setAttribute('role', 'status');
    this.read.setAttribute('aria-live', 'polite');
    this.root.append(this.canvas, this.read);
    parent.appendChild(this.root);
  }

  public hide(): void {
    this.root.hidden = true;
  }

  public draw(
    video: HTMLVideoElement | null,
    hand: HandLandmarks | null,
    face: FaceLandmarks | null,
    readout: readonly PreviewReadout[]
  ): void {
    this.root.hidden = false;
    const { g, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    g.fillStyle = '#1d1b33';
    g.fillRect(0, 0, w, h);

    g.save();
    // Mirrored, like a mirror: move your right hand and it moves right on screen.
    g.translate(w, 0);
    g.scale(-1, 1);
    if (video && video.readyState >= 2) g.drawImage(video, 0, 0, w, h);

    if (face) {
      g.strokeStyle = 'rgba(63,247,255,0.6)';
      g.lineWidth = 2;
      g.beginPath();
      FACE_OUTLINE.forEach((index, i) => {
        const p = face[index];
        if (!p) return;
        if (i === 0) g.moveTo(p.x * w, p.y * h);
        else g.lineTo(p.x * w, p.y * h);
      });
      g.stroke();
      g.fillStyle = '#ff4fd8';
      for (const index of IRISES) {
        const p = face[index];
        if (!p) continue;
        g.beginPath();
        g.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
        g.fill();
      }
    }

    if (hand) {
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 3;
      for (const chain of HAND_BONES) {
        g.beginPath();
        chain.forEach((index, i) => {
          const p = hand[index];
          if (i === 0) g.moveTo(p.x * w, p.y * h);
          else g.lineTo(p.x * w, p.y * h);
        });
        g.stroke();
      }
      g.fillStyle = '#ff5a36';
      for (const p of hand) {
        g.beginPath();
        g.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();

    if (!video || video.readyState < 2) {
      g.fillStyle = '#fff7e0';
      g.font = '16px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Starting camera…', w / 2, h / 2);
    }

    // The DOM readout only changes when the words do.
    const key = readout.map((r) => `${r.tone}:${r.text}`).join('|');
    if (key !== this.lastReadout) {
      this.lastReadout = key;
      this.read.replaceChildren(
        ...readout.map((r) => {
          const chip = document.createElement('span');
          chip.textContent = r.text;
          if (r.tone !== 'plain') chip.className = r.tone;
          return chip;
        })
      );
    }
  }
}
