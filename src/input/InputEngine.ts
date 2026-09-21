import { InputAction, ActionState } from './ActionTypes';

export class InputEngine {
  private actions: Map<InputAction, ActionState> = new Map();
  private keyMap: Map<string, InputAction> = new Map();
  private element: HTMLElement | Window;

  constructor(targetElement: HTMLElement | Window = typeof window !== 'undefined' ? window : ({} as any)) {
    this.element = targetElement;
    this.initDefaultActions();
    this.initDefaultBindings();
    this.attachEventListeners();
  }

  private initDefaultActions(): void {
    for (const action of Object.values(InputAction)) {
      this.actions.set(action, { value: 0, justPressed: false, justReleased: false });
    }
  }

  private initDefaultBindings(): void {
    this.keyMap.set('KeyW', InputAction.MOVE_FORWARD);
    this.keyMap.set('ArrowUp', InputAction.MOVE_FORWARD);
    this.keyMap.set('KeyS', InputAction.MOVE_BACKWARD);
    this.keyMap.set('ArrowDown', InputAction.MOVE_BACKWARD);
    this.keyMap.set('KeyA', InputAction.STRAFE_LEFT);
    this.keyMap.set('ArrowLeft', InputAction.STRAFE_LEFT);
    this.keyMap.set('KeyD', InputAction.STRAFE_RIGHT);
    this.keyMap.set('ArrowRight', InputAction.STRAFE_RIGHT);
    this.keyMap.set('Space', InputAction.JUMP);
    this.keyMap.set('ShiftLeft', InputAction.DASH);
    this.keyMap.set('ShiftRight', InputAction.DASH);
    this.keyMap.set('ControlLeft', InputAction.CROUCH);
    this.keyMap.set('ControlRight', InputAction.CROUCH);
    this.keyMap.set('KeyC', InputAction.CROUCH);
    this.keyMap.set('KeyR', InputAction.RESTART);
    this.keyMap.set('KeyG', InputAction.GESTURE_TOGGLE);
    this.keyMap.set('Escape', InputAction.PAUSE);
    this.keyMap.set('KeyP', InputAction.PAUSE);
  }

  private attachEventListeners(): void {
    if (typeof window === 'undefined' || !this.element.addEventListener) return;

    this.element.addEventListener('keydown', (e: any) => {
      const action = this.keyMap.get(e.code);
      if (action) {
        const state = this.actions.get(action)!;
        if (state.value === 0) {
          state.justPressed = true;
        }
        state.value = 1.0;
      }
    });

    this.element.addEventListener('keyup', (e: any) => {
      const action = this.keyMap.get(e.code);
      if (action) {
        const state = this.actions.get(action)!;
        state.value = 0.0;
        state.justReleased = true;
      }
    });

    this.element.addEventListener('mousemove', (e: any) => {
      if (typeof document !== 'undefined' && document.pointerLockElement) {
        // Accumulate rather than overwrite: a browser can deliver several mousemove events
        // between two animation frames, and overwriting would silently drop all but the last.
        this.actions.get(InputAction.LOOK_X)!.value += e.movementX;
        this.actions.get(InputAction.LOOK_Y)!.value += e.movementY;
      }
    });
  }

  /**
   * Relative axes report movement *since the last frame*, so they must be cleared once consumed.
   * Digital buttons are level-triggered and must not be.
   */
  private static readonly RELATIVE_AXES: readonly InputAction[] = [
    InputAction.LOOK_X,
    InputAction.LOOK_Y
  ];

  public getAction(action: InputAction): ActionState {
    return this.actions.get(action) || { value: 0, justPressed: false, justReleased: false };
  }

  public isPressed(action: InputAction): boolean {
    return (this.actions.get(action)?.value || 0) > 0;
  }

  public isJustPressed(action: InputAction): boolean {
    return !!this.actions.get(action)?.justPressed;
  }

  public endFrame(): void {
    for (const state of this.actions.values()) {
      state.justPressed = false;
      state.justReleased = false;
    }
    // Without this the last mouse delta persists and the camera spins forever after the mouse stops.
    for (const axis of InputEngine.RELATIVE_AXES) {
      this.actions.get(axis)!.value = 0;
    }
  }

  /** Reads a raw axis value, including negative deltas that `isPressed` cannot express. */
  public getAxis(action: InputAction): number {
    return this.actions.get(action)?.value ?? 0;
  }

  public setActionState(action: InputAction, value: number): void {
    const state = this.actions.get(action);
    if (state) {
      if (state.value === 0 && value > 0) state.justPressed = true;
      if (state.value > 0 && value === 0) state.justReleased = true;
      state.value = value;
    }
  }
}
