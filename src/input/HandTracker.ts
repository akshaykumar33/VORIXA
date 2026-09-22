import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { sharedCamera, type CameraSource } from './CameraSource';
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
  private readonly mapper = new GestureMapper();
  private lastVideoTime = -1;
  private lastUpdate = 0;
  private acquired = false;

  /** Most recent landmarks, for the overlay to draw. Null when no hand is visible. */
  public landmarks: HandLandmarks | null = null;

  /**
   * The camera is borrowed, not owned. Gaze tracking needs the same stream at the same time, and
   * two `getUserMedia` calls against one device waste a decode at best and fail outright at worst.
   */
  public constructor(private readonly camera: CameraSource = sharedCamera) {}

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

    this.status = 'requesting-camera';
    const ok = await this.camera.acquire();
    if (!ok) {
      // acquire() takes a reference even when it fails, so stop() has to run to give it back.
      this.acquired = true;
      this.stop();
      this.status =
        this.camera.status === 'denied'
          ? 'denied'
          : this.camera.status === 'unsupported'
            ? 'unsupported'
            : 'error';
      this.errorMessage = this.camera.errorMessage;
      return false;
    }

    this.acquired = true;
    this.status = 'running';
    this.lastUpdate = performance.now();
    return true;
  }

  public stop(): void {
    if (this.acquired) {
      this.camera.release();
      this.acquired = false;
    }
    this.landmarks = null;
    this.lastVideoTime = -1;
    this.mapper.reset();
    this.status = 'idle';
  }

  public get videoElement(): HTMLVideoElement | null {
    return this.camera.element;
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

    const video = this.camera.element;
    if (!this.landmarker || !video || this.status !== 'running') {
      return this.mapper.intent;
    }

    if (video.currentTime !== this.lastVideoTime && video.readyState >= 2) {
      this.lastVideoTime = video.currentTime;
      try {
        const result = this.landmarker.detectForVideo(video, now);
        this.landmarks = result.landmarks?.[0] ?? null;
      } catch {
        // A dropped frame is not worth tearing the session down; the next one usually succeeds.
        this.landmarks = null;
      }
    }

    return this.mapper.update(this.landmarks, dt);
  }
}
