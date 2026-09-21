import { describe, it, expect } from 'vitest';
import { Engine } from '../src/core/Engine';
import { Renderer } from '../src/rendering/Renderer';
import { Camera } from '../src/rendering/Camera';
import { World } from '../src/ecs/World';
import { InputEngine } from '../src/input/InputEngine';
import { InputAction } from '../src/input/ActionTypes';
import { CapabilitiesReport } from '../src/core/DeviceCapabilities';

class MockRenderer implements Renderer {
  public renderCalls: number = 0;
  async initialize(): Promise<void> {}
  resize(): void {}
  render(): void {
    this.renderCalls++;
  }
  getBackendName(): string {
    return 'MockRenderer';
  }
  dispose(): void {}
}

const mockCapabilities: CapabilitiesReport = {
  hasWebGPU: true,
  hasWebGL2: true,
  maxTextureDimension2D: 8192,
  hardwareConcurrency: 8,
  devicePixelRatio: 1,
  hasTouch: false,
  tier: 'tier-1'
};

function makeEngine(): { engine: Engine; world: World; input: InputEngine; camera: Camera } {
  const world = new World();
  const input = new InputEngine({} as any);
  const camera = new Camera();
  const engine = new Engine(
    new MockRenderer(),
    mockCapabilities,
    world,
    input,
    undefined,
    undefined,
    camera
  );
  return { engine, world, input, camera };
}

/** Runs `count` fixed ticks, clearing edge-triggered input between them as the frame loop does. */
function runTicks(engine: Engine, input: InputEngine, count: number): void {
  for (let i = 0; i < count; i++) {
    engine.tick(1 / 60);
    input.endFrame();
  }
}

const TICK = 1 / 60;

describe('Engine Kernel', () => {
  it('should initialize player entity and execute simulation ticks', () => {
    const { engine, world, input } = makeEngine();

    expect(engine.playerEntityId).toBeGreaterThan(0);
    expect(engine.simTicks).toBe(0);

    input.setActionState(InputAction.MOVE_FORWARD, 1.0);
    engine.tick(TICK);

    expect(engine.simTicks).toBe(1);
    expect(world.posZ[engine.playerEntityId]).toBeLessThan(0); // Moved forward (-Z)
  });

  it('spawns the camera on the player rather than easing in from the origin', () => {
    const { engine, camera } = makeEngine();
    expect(camera.eyeX).toBe(0);
    expect(camera.eyeY).toBeCloseTo(camera.eyeHeight, 6);
    expect(engine.lookCaptured).toBe(false);
  });
});

describe('Engine movement is relative to where the player is looking', () => {
  it('walks down -Z when facing the default direction', () => {
    const { engine, world, input } = makeEngine();
    input.setActionState(InputAction.MOVE_FORWARD, 1.0);
    engine.tick(TICK);

    const id = engine.playerEntityId;
    expect(world.velZ[id]).toBeCloseTo(-Engine.WALK_SPEED, 5);
    expect(world.velX[id]).toBeCloseTo(0, 5);
  });

  it('walks down -X after turning a quarter turn', () => {
    const { engine, world, input, camera } = makeEngine();
    camera.yaw = Math.PI / 2;
    input.setActionState(InputAction.MOVE_FORWARD, 1.0);
    engine.tick(TICK);

    const id = engine.playerEntityId;
    expect(world.velX[id]).toBeCloseTo(-Engine.WALK_SPEED, 4);
    expect(world.velZ[id]).toBeCloseTo(0, 4);
  });

  it('strafes perpendicular to the look direction', () => {
    const { engine, world, input } = makeEngine();
    input.setActionState(InputAction.STRAFE_RIGHT, 1.0);
    engine.tick(TICK);

    const id = engine.playerEntityId;
    expect(world.velX[id]).toBeCloseTo(Engine.WALK_SPEED, 5);
    expect(world.velZ[id]).toBeCloseTo(0, 5);
  });

  it('does not let diagonal movement outrun cardinal movement', () => {
    const { engine, world, input } = makeEngine();
    input.setActionState(InputAction.MOVE_FORWARD, 1.0);
    input.setActionState(InputAction.STRAFE_RIGHT, 1.0);
    engine.tick(TICK);

    const id = engine.playerEntityId;
    const speed = Math.hypot(world.velX[id], world.velZ[id]);
    expect(speed).toBeCloseTo(Engine.WALK_SPEED, 4);
  });

  it('cancels opposing inputs instead of drifting', () => {
    const { engine, world, input } = makeEngine();
    input.setActionState(InputAction.MOVE_FORWARD, 1.0);
    input.setActionState(InputAction.MOVE_BACKWARD, 1.0);
    engine.tick(TICK);

    const id = engine.playerEntityId;
    expect(Math.hypot(world.velX[id], world.velZ[id])).toBeCloseTo(0, 6);
  });

  it('sprints faster than it walks', () => {
    const { engine, world, input } = makeEngine();
    input.setActionState(InputAction.MOVE_FORWARD, 1.0);
    input.setActionState(InputAction.DASH, 1.0);
    engine.tick(TICK);

    const id = engine.playerEntityId;
    expect(Math.hypot(world.velX[id], world.velZ[id])).toBeCloseTo(Engine.SPRINT_SPEED, 4);
  });
});

describe('Engine jump', () => {
  it('actually leaves the ground rather than only playing a sound', () => {
    const { engine, world, input } = makeEngine();
    const id = engine.playerEntityId;

    input.setActionState(InputAction.JUMP, 1.0);
    engine.tick(TICK);

    expect(world.posY[id]).toBeGreaterThan(0);
  });

  it('falls back to the ground and settles there', () => {
    const { engine, world, input } = makeEngine();
    const id = engine.playerEntityId;

    input.setActionState(InputAction.JUMP, 1.0);
    engine.tick(TICK);
    input.endFrame();
    input.setActionState(InputAction.JUMP, 0);

    runTicks(engine, input, 120);

    expect(world.posY[id]).toBe(0);
    expect(world.velY[id]).toBe(0);
  });

  it('refuses to jump again in mid-air however hard the key is mashed', () => {
    const { engine, world, input } = makeEngine();
    const id = engine.playerEntityId;

    let peak = 0;
    for (let i = 0; i < 120; i++) {
      // Re-press every tick: a naive implementation would climb indefinitely.
      input.setActionState(InputAction.JUMP, 0);
      input.setActionState(InputAction.JUMP, 1.0);
      engine.tick(TICK);
      input.endFrame();
      peak = Math.max(peak, world.posY[id]);
    }

    // Single-jump apex is v^2 / 2g ≈ 1.11 m; anything near double that is a double-jump bug.
    const apex = (Engine.JUMP_SPEED * Engine.JUMP_SPEED) / (2 * Engine.GRAVITY);
    expect(peak).toBeLessThan(apex * 1.25);
  });

  it('can jump again once it has landed', () => {
    const { engine, world, input } = makeEngine();
    const id = engine.playerEntityId;

    input.setActionState(InputAction.JUMP, 1.0);
    engine.tick(TICK);
    input.endFrame();
    input.setActionState(InputAction.JUMP, 0);
    runTicks(engine, input, 120);
    expect(world.posY[id]).toBe(0);

    input.setActionState(InputAction.JUMP, 1.0);
    engine.tick(TICK);
    expect(world.posY[id]).toBeGreaterThan(0);
  });

  it('never sinks below the floor', () => {
    const { engine, world, input } = makeEngine();
    const id = engine.playerEntityId;

    runTicks(engine, input, 240);
    expect(world.posY[id]).toBe(0);
  });
});

describe('Engine look consumption', () => {
  it('turns the camera by the frame’s accumulated mouse delta', () => {
    const { engine, input, camera } = makeEngine();
    input.setActionState(InputAction.LOOK_X, 100);

    engine.consumeLook();

    expect(camera.yaw).toBeCloseTo(-100 * camera.lookSensitivity, 6);
  });

  it('applies a delta once per frame, not once per catch-up tick', () => {
    const { engine, input, camera } = makeEngine();
    input.setActionState(InputAction.LOOK_X, 100);

    engine.consumeLook();
    const afterFirstFrame = camera.yaw;

    // Two simulation ticks inside the same frame must not re-apply the look.
    engine.tick(TICK);
    engine.tick(TICK);
    expect(camera.yaw).toBe(afterFirstFrame);
  });

  it('stops turning once the mouse stops', () => {
    const { engine, input, camera } = makeEngine();
    input.setActionState(InputAction.LOOK_X, 100);
    engine.consumeLook();
    input.endFrame();

    const resting = camera.yaw;
    engine.consumeLook();
    expect(camera.yaw).toBe(resting);
  });
});
