import { VisionGuard, withDelegateFallback } from './VisionGuard';
import { FaceGestureMapper, type ExpressionScores, type FaceCommands } from './FaceGestures';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { sharedCamera, type CameraSource } from './CameraSource';
import {
  GazeMapper,
  type BlendshapeScores,
  type FaceLandmarks,
  type GazeIntent
} from './GazeMapping';

/**
 * Webcam gaze tracking.
 *
 * The face-side twin of `HandTracker`: permissions, the WASM runtime, and the inference loop live
 * here so that `GazeMapping` stays pure and testable. Everything here is effects; everything there
 * is decisions.
 *
 * Unlike `HandTracker` this does not own a camera — it borrows the shared one, because gaze and
 * hand control are designed to run *together* and two independent `getUserMedia` calls cannot
 * reliably coexist on one device.
 *
 * The model and WASM runtime are served from `/public`, not a CDN, for the same reason as the hand
 * model: a game that silently breaks when a Google bucket is unreachable, or that phones out on
 * load, is not something to ship by default.
 */

export type FaceTrackerStatus =
  | 'idle'
  | 'loading'
  | 'requesting-camera'
  | 'running'
  | 'denied'
  | 'unsupported'
  | 'error';

const MODEL_URL = '/models/face_landmarker.task';
const WASM_PATH = '/wasm';

/** Blendshape category names for the two blink scores, as emitted by the model. */
const BLINK_LEFT = 'eyeBlinkLeft';
const BLINK_RIGHT = 'eyeBlinkRight';

export class FaceTracker {
  public status: FaceTrackerStatus = 'idle';
  public errorMessage = '';

  private landmarker: FaceLandmarker | null = null;
  private readonly mapper = new GazeMapper();
  private lastVideoTime = -1;
  private lastUpdate = 0;
  private acquired = false;

  /** Most recent landmarks, for the overlay to draw. Null when no face is visible. */
  public landmarks: FaceLandmarks | null = null;

  /**
   * Reused blendshape carrier. Rebuilt each frame from the model's category list, but never
   * reallocated — this runs inside the frame loop, where allocation is banned (AGENTS.md §2).
   */
  private readonly blend: BlendshapeScores = { eyeBlinkLeft: 0, eyeBlinkRight: 0 };
  private hasBlend = false;

  public constructor(private readonly camera: CameraSource = sharedCamera) {}

  public get intent(): GazeIntent {
    return this.mapper.intent;
  }

  public get isRunning(): boolean {
    return this.status === 'running';
  }

  public async start(): Promise<boolean> {
    if (this.status === 'running' || this.status === 'loading') return this.isRunning;

    try {
      this.status = 'loading';
      // Imported on demand: the vision runtime is large and most players never turn gaze control
      // on. Keeping it out of the initial bundle is the difference between the game starting
      // instantly and waiting on a feature nobody asked for yet.
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
      this.create = async () => (await withDelegateFallback((delegate) => FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        // Iris refinement is what lifts the model from 468 to 478 landmarks. Without it there are
        // no iris points at all and gaze steering has nothing to read.
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.45
      }))).value;
      this.landmarker = await this.create();
      this.guard.reset();
      this.gestureMapper.reset();
    } catch (err) {
      this.status = 'error';
      this.errorMessage = `Face model failed to load: ${(err as Error).message}`;
      return false;
    }

    this.status = 'requesting-camera';
    const ok = await this.camera.acquire();
    if (!ok) {
      this.acquired = true; // acquire() incremented the count even on failure; release balances it.
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
    this.hasBlend = false;
    this.lastVideoTime = -1;
    this.mapper.reset();
    this.status = 'idle';
  }

  /**
   * Runs inference if a new camera frame is available and updates the intent.
   *
   * The camera runs at ~30 Hz while the game renders faster, so most calls find no new frame.
   * Re-running inference on an unchanged frame would burn GPU time for an identical answer, but
   * the mapper is still stepped so its smoothing and blink timing advance on the real clock.
   */
  private readonly guard = new VisionGuard();
  private create: (() => Promise<NonNullable<typeof this.landmarker>>) | null = null;
  private rebuilding = false;
  private readonly gestureMapper = new FaceGestureMapper();
  private readonly expressions: ExpressionScores = { jawOpen: 0, browInnerUp: 0, mouthSmileLeft: 0, mouthSmileRight: 0, eyeBlinkLeft: 0, eyeBlinkRight: 0 };
  private hasExpressions = false;

  /** Face gestures for this frame: brows jump, mouth fires, smile boosts, wink uses the item. */
  public get commands(): FaceCommands {
    return this.gestureMapper.commands;
  }

  private async rebuild(): Promise<void> {
    if (this.rebuilding || !this.create) return;
    this.rebuilding = true;
    try {
      this.landmarker?.close();
      this.landmarker = await this.create();
      this.guard.reset();
    } catch (err) {
      this.status = 'error';
      this.errorMessage = `Eye tracking stopped and could not restart (${(err as Error).message}). Press E to try again.`;
    } finally {
      this.rebuilding = false;
    }
  }

  public update(): GazeIntent {
    const now = performance.now();
    const dt = Math.min((now - this.lastUpdate) / 1000, 0.1);
    this.lastUpdate = now;

    const video = this.camera.element;
    if (!this.landmarker || !video || this.status !== 'running') {
      return this.mapper.intent;
    }

    if (!this.rebuilding && video.currentTime !== this.lastVideoTime && video.readyState >= 2) {
      this.lastVideoTime = video.currentTime;
      try {
        const result = this.landmarker.detectForVideo(video, this.guard.timestamp(now));
        this.landmarks = result.faceLandmarks?.[0] ?? null;
        this.readBlendshapes(result.faceBlendshapes?.[0]?.categories);
        this.guard.succeeded();
      } catch {
        // One dropped frame is fine; a run of them means the graph is dead, so rebuild it.
        this.landmarks = null;
        this.hasBlend = false;
        this.hasExpressions = false;
        if (this.guard.failed()) void this.rebuild();
      }
    }

    this.gestureMapper.update(this.landmarks && this.hasExpressions ? this.expressions : null, dt);
    return this.mapper.update(this.landmarks, this.hasBlend ? this.blend : null, dt);
  }

  /**
   * Pulls the two blink scores out of the model's category list.
   *
   * The list carries ~52 expressions and is searched rather than indexed because the ordering is
   * a model detail, not a contract — a future model revision that inserts a category would
   * silently shift a hardcoded index onto the wrong expression.
   */
  private readBlendshapes(
    categories: ReadonlyArray<{ categoryName?: string; score: number }> | undefined
  ): void {
    if (!categories) {
      this.hasBlend = false;
      return;
    }

    let found = 0;
    let expressions = 0;
    const e = this.expressions;
    for (const category of categories) {
      switch (category.categoryName) {
        case BLINK_LEFT:
          this.blend.eyeBlinkLeft = e.eyeBlinkLeft = category.score;
          found++;
          break;
        case BLINK_RIGHT:
          this.blend.eyeBlinkRight = e.eyeBlinkRight = category.score;
          found++;
          break;
        case 'jawOpen':
          e.jawOpen = category.score;
          expressions++;
          break;
        case 'browInnerUp':
          e.browInnerUp = category.score;
          expressions++;
          break;
        case 'mouthSmileLeft':
          e.mouthSmileLeft = category.score;
          expressions++;
          break;
        case 'mouthSmileRight':
          e.mouthSmileRight = category.score;
          expressions++;
          break;
      }
    }
    this.hasExpressions = found === 2 && expressions === 4;
    // Partial results would mean judging "both eyes shut" off one eye, so fall back to geometry.
    this.hasBlend = found === 2;
  }
}
