import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { GestureMapper, type GestureIntent, type HandLandmarks } from './GestureMapping';

/**
 * Webcam hand tracking.
 *
 * Isolates every part of gesture input that cannot run without a camera — permissions, the WASM
 * runtime, the video element, the inference loop — so that `GestureMapping` stays pure and
 * testable. Everything here is effects; everything there is decisions.
 *
 * The model and WASM runtime are served from `/public`, not a CDN. A game that silently stops
 * working when a Google bucket is unreachable, or that phones out on load, is not something to
 * ship by default.
 */

export type TrackerStatus =
  | 'idle'
  | 'loading'
  | 'requesting-camera'
  | 'running'
  | 'denied'
  | 'unsupported'
  | 'error';

const MODEL_URL = '/models/hand_landmarker.task';
const WASM_PATH = '/wasm';

export class HandTracker {
  public status: TrackerStatus = 'idle';
  public errorMessage = '';

  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private readonly mapper = new GestureMapper();
  private lastVideoTime = -1;
  private lastUpdate = 0;

  /** Most recent landmarks, for the overlay to draw. Null when no hand is visible. */
  public landmarks: HandLandmarks | null = null;

  public get intent(): GestureIntent {
    return this.mapper.intent;
  }

  public get isRunning(): boolean {
    return this.status === 'running';
  }

  public async start(): Promise<boolean> {
    if (this.status === 'running' || this.status === 'loading') return this.isRunning;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.status = 'unsupported';
      this.errorMessage = 'This browser cannot access a camera.';
      return false;
    }

    try {
      this.status = 'loading';
      // Imported on demand: the vision runtime is a large dependency, and most players never
      // turn hand control on. Keeping it out of the initial bundle is the difference between
      // the game starting instantly and waiting on a feature nobody asked for yet.
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1,
        // Tracking confidence is kept lower than detection: re-acquiring a lost hand is expensive
        // and visible, whereas coasting through a couple of uncertain frames is not.
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.45
      });
    } catch (err) {
      this.status = 'error';
      this.errorMessage = `Hand model failed to load: ${(err as Error).message}`;
      return false;
    }

    try {
      this.status = 'requesting-camera';
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      });
    } catch (err) {
      const name = (err as Error).name;
      this.status = name === 'NotAllowedError' ? 'denied' : 'error';
      this.errorMessage =
        this.status === 'denied'
          ? 'Camera permission was declined.'
          : `Camera unavailable: ${(err as Error).message}`;
      return false;
    }

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = this.stream;
    // Kept out of the layout: the camera feed is drawn into the 2D overlay, not shown raw.
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(video);
    await video.play();

    this.video = video;
    this.status = 'running';
    this.lastUpdate = performance.now();
    return true;
  }

  public stop(): void {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.video?.remove();
    this.video = null;
    this.landmarks = null;
    this.mapper.reset();
    this.status = 'idle';
  }

  public get videoElement(): HTMLVideoElement | null {
    return this.video;
  }

  /**
   * Runs inference if a new camera frame is available and updates the intent.
   *
   * The camera runs at ~30 Hz while the game renders faster, so most calls find no new frame.
   * Re-running inference on an unchanged frame would burn GPU time for an identical answer, but
   * the mapper is still stepped so its smoothing and hysteresis advance on the real clock.
   */
  public update(): GestureIntent {
    const now = performance.now();
    const dt = Math.min((now - this.lastUpdate) / 1000, 0.1);
    this.lastUpdate = now;

    if (!this.landmarker || !this.video || this.status !== 'running') {
      return this.mapper.intent;
    }

    if (this.video.currentTime !== this.lastVideoTime && this.video.readyState >= 2) {
      this.lastVideoTime = this.video.currentTime;
      try {
        const result = this.landmarker.detectForVideo(this.video, now);
        this.landmarks = result.landmarks?.[0] ?? null;
      } catch {
        // A dropped frame is not worth tearing the session down; the next one usually succeeds.
        this.landmarks = null;
      }
    }

    return this.mapper.update(this.landmarks, dt);
  }
}
