/**
 * One camera, many consumers.
 *
 * Hand tracking and gaze tracking both need the player's webcam. Calling `getUserMedia` once per
 * tracker looks harmless and is not: the browser decodes a second video stream, doubling GPU work
 * for an identical picture, and on a meaningful share of hardware the second request fails
 * outright because the device is already held exclusively. Two trackers that each own a camera
 * cannot both run, which is precisely the combination this game is built around.
 *
 * So the stream is owned here and reference-counted. Trackers `acquire()` and `release()`; the
 * hardware opens on the first acquire and closes on the last release. The video element is shared
 * too, since a second `<video>` bound to the same track buys nothing but another decode.
 *
 * Permission state is cached across acquires. A player who declined the camera should see the
 * refusal immediately on the next attempt rather than triggering a fresh browser prompt each time
 * they toggle a mode.
 */

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'ready'
  | 'denied'
  | 'unsupported'
  | 'error';

/** Requested capture size. 640x480 is the sweet spot: enough detail for iris landmarks, cheap
 *  enough that inference keeps up on integrated graphics. */
const CAPTURE_WIDTH = 640;
const CAPTURE_HEIGHT = 480;

export class CameraSource {
  public status: CameraStatus = 'idle';
  public errorMessage = '';

  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private refCount = 0;
  /** In-flight acquire, so two trackers starting on the same frame share one permission prompt. */
  private pending: Promise<boolean> | null = null;

  public get element(): HTMLVideoElement | null {
    return this.video;
  }

  public get isReady(): boolean {
    return this.status === 'ready' && this.video !== null;
  }

  /**
   * Opens the camera if it is not already open and registers one more consumer.
   *
   * Safe to call repeatedly. Returns false when the camera is unavailable for any reason; callers
   * are expected to degrade rather than treat this as fatal.
   */
  public async acquire(): Promise<boolean> {
    this.refCount++;

    if (this.isReady) return true;
    // A previous refusal is remembered. Re-prompting a player who already said no is hostile,
    // and browsers increasingly ignore the request anyway.
    if (this.status === 'denied' || this.status === 'unsupported') return false;
    if (this.pending) return this.pending;

    this.pending = this.open();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }

  private async open(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.status = 'unsupported';
      this.errorMessage = 'This browser cannot access a camera.';
      return false;
    }

    try {
      this.status = 'requesting';
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, facingMode: 'user' },
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
    // Kept out of the layout: the feed is drawn into the 2D overlay, never shown raw.
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(video);

    try {
      await video.play();
    } catch (err) {
      // Autoplay refusal leaves a video element that will never produce frames. Tear it down
      // rather than leaving trackers polling a permanently blank source.
      video.remove();
      this.stopTracks();
      this.status = 'error';
      this.errorMessage = `Camera stream could not start: ${(err as Error).message}`;
      return false;
    }

    this.video = video;
    this.status = 'ready';
    return true;
  }

  /**
   * Drops one consumer, closing the hardware when the last one leaves.
   *
   * The camera light staying on after a player turns tracking off reads as a privacy breach even
   * when nothing is being read, so the teardown is unconditional at zero.
   */
  public release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount > 0) return;

    this.stopTracks();
    this.video?.remove();
    this.video = null;
    // Permission verdicts outlive the stream; a transient failure should not be sticky.
    if (this.status === 'ready' || this.status === 'requesting' || this.status === 'error') {
      this.status = 'idle';
      this.errorMessage = '';
    }
  }

  private stopTracks(): void {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
  }
}

/**
 * The process-wide camera.
 *
 * A module singleton rather than an injected dependency: the browser exposes exactly one camera
 * permission per origin, so pretending several independent instances could coexist would be
 * modelling something the platform does not offer. Tests construct `CameraSource` directly.
 */
export const sharedCamera = new CameraSource();
