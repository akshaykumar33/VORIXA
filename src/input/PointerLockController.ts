/**
 * Mouse capture for first-person look.
 *
 * Pointer lock is the difference between "a 3D demo" and "a game you are standing inside", but it
 * is also the single most user-hostile browser API to get wrong: it hijacks the cursor, and the
 * only way out is a key the page cannot intercept. Three rules follow from that, and they are the
 * reason this is a class rather than three lines in `main.ts`:
 *
 *   1. **Lock is always opt-in.** It happens on a deliberate click, never on load.
 *   2. **Lock state is observable.** The HUD has to be able to tell the player whether the mouse is
 *      captured and how to get it back, so the state is broadcast rather than kept private.
 *   3. **A denied request is a normal outcome, not an error.** Chrome rejects `requestPointerLock`
 *      for about a second after the user presses Escape, specifically so a page cannot trap them by
 *      re-locking instantly. We surface that as "unlocked" and let the player click again.
 */
export type PointerLockListener = (locked: boolean) => void;

/** The subset of `Document` this controller touches, so tests can supply a stand-in. */
export interface PointerLockDocument {
  pointerLockElement: Element | null;
  addEventListener(type: string, listener: (event: any) => void): void;
  exitPointerLock?(): void;
}

/** The subset of the lock target this controller touches. */
export interface PointerLockTarget {
  addEventListener(type: string, listener: (event: any) => void): void;
  requestPointerLock?(): void | Promise<void>;
}

export class PointerLockController {
  private readonly target: PointerLockTarget;
  private readonly doc: PointerLockDocument;
  private readonly listeners: PointerLockListener[] = [];
  private locked = false;

  constructor(target: PointerLockTarget, doc: PointerLockDocument) {
    this.target = target;
    this.doc = doc;

    this.target.addEventListener('click', () => this.request());
    this.doc.addEventListener('pointerlockchange', () => this.syncFromDocument());

    // Firing the listeners here keeps the HUD honest: a refused request must visibly stay unlocked
    // rather than leaving a stale "captured" indicator on screen.
    this.doc.addEventListener('pointerlockerror', () => this.syncFromDocument());
  }

  public get isLocked(): boolean {
    return this.locked;
  }

  /** Subscribes to lock changes and immediately receives the current state. */
  public onChange(listener: PointerLockListener): void {
    this.listeners.push(listener);
    listener(this.locked);
  }

  /**
   * Requests capture. Safe to call when already locked or immediately after an Escape exit — both
   * are no-ops rather than exceptions.
   */
  public request(): void {
    if (this.locked || !this.target.requestPointerLock) return;
    try {
      // Chrome returns a promise that rejects on the post-Escape cooldown; Safari returns void.
      const result = this.target.requestPointerLock();
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => this.syncFromDocument());
      }
    } catch {
      this.syncFromDocument();
    }
  }

  /** Releases capture. The browser also does this on Escape, which routes through the same event. */
  public release(): void {
    this.doc.exitPointerLock?.();
  }

  private syncFromDocument(): void {
    const next = this.doc.pointerLockElement !== null && this.doc.pointerLockElement !== undefined;
    if (next === this.locked) return;
    this.locked = next;
    for (const listener of this.listeners) listener(next);
  }
}

/**
 * Wires a controller to the real document, or returns `null` outside the browser so the engine can
 * be constructed headlessly in tests without a DOM shim.
 */
export function createPointerLockController(
  target: HTMLElement | null
): PointerLockController | null {
  if (!target || typeof document === 'undefined') return null;
  return new PointerLockController(
    target as unknown as PointerLockTarget,
    document as unknown as PointerLockDocument
  );
}
