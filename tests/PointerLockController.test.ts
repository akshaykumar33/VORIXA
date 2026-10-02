import { describe, it, expect, vi } from 'vitest';
import {
  PointerLockController,
  type PointerLockDocument,
  type PointerLockTarget
} from '../src/input/PointerLockController';

class FakeEventSource {
  public handlers = new Map<string, ((event: any) => void)[]>();

  addEventListener(type: string, listener: (event: any) => void): void {
    const existing = this.handlers.get(type) ?? [];
    existing.push(listener);
    this.handlers.set(type, existing);
  }

  emit(type: string): void {
    for (const handler of this.handlers.get(type) ?? []) handler({});
  }
}

class FakeTarget extends FakeEventSource implements PointerLockTarget {
  public requests = 0;
  constructor(private readonly doc: FakeDocument, private readonly grant = true) {
    super();
  }

  requestPointerLock(): void {
    this.requests++;
    if (!this.grant) {
      this.doc.emit('pointerlockerror');
      return;
    }
    this.doc.pointerLockElement = {} as Element;
    this.doc.emit('pointerlockchange');
  }
}

class FakeDocument extends FakeEventSource implements PointerLockDocument {
  public pointerLockElement: Element | null = null;
  public exitCalls = 0;

  exitPointerLock(): void {
    this.exitCalls++;
    this.pointerLockElement = null;
    this.emit('pointerlockchange');
  }
}

function setup(grant = true) {
  const doc = new FakeDocument();
  const target = new FakeTarget(doc, grant);
  const controller = new PointerLockController(target, doc);
  return { doc, target, controller };
}

describe('PointerLockController', () => {
  it('starts unlocked and never captures the mouse on its own', () => {
    const { controller, target } = setup();
    expect(controller.isLocked).toBe(false);
    expect(target.requests).toBe(0);
  });

  it('captures the mouse on a deliberate click', () => {
    const { controller, target } = setup();
    target.emit('click');
    expect(controller.isLocked).toBe(true);
  });

  it('reports the current state to a new subscriber immediately', () => {
    const { controller, target } = setup();
    target.emit('click');

    const listener = vi.fn();
    controller.onChange(listener);
    expect(listener).toHaveBeenCalledWith(true);
  });

  it('notifies subscribers when the browser releases the lock', () => {
    const { controller, target, doc } = setup();
    const listener = vi.fn();
    controller.onChange(listener);

    target.emit('click');
    expect(listener).toHaveBeenLastCalledWith(true);

    // What Escape does: the browser drops the lock without asking us first.
    doc.pointerLockElement = null;
    doc.emit('pointerlockchange');
    expect(listener).toHaveBeenLastCalledWith(false);
    expect(controller.isLocked).toBe(false);
  });

  it('stays unlocked when the browser refuses the request', () => {
    const { controller, target } = setup(false);
    target.emit('click');
    expect(controller.isLocked).toBe(false);
  });

  it('does not re-request while already locked', () => {
    const { target } = setup();
    target.emit('click');
    target.emit('click');
    expect(target.requests).toBe(1);
  });

  it('releases through the document so Escape and code take the same path', () => {
    const { controller, doc, target } = setup();
    target.emit('click');
    controller.release();
    expect(doc.exitCalls).toBe(1);
    expect(controller.isLocked).toBe(false);
  });

  it('only fires listeners on genuine state changes', () => {
    const { controller, doc } = setup();
    const listener = vi.fn();
    controller.onChange(listener);
    listener.mockClear();

    doc.emit('pointerlockchange'); // still unlocked
    expect(listener).not.toHaveBeenCalled();
  });
});
