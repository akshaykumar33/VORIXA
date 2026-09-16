import { describe, it, expect } from 'vitest';
import { Engine } from '../src/core/Engine';
import { Renderer } from '../src/rendering/Renderer';
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

describe('Engine Kernel', () => {
  it('should initialize player entity and execute simulation ticks', () => {
    const mockRenderer = new MockRenderer();
    const world = new World();
    const input = new InputEngine({} as any);

    const engine = new Engine(mockRenderer, mockCapabilities, world, input);

    expect(engine.playerEntityId).toBeGreaterThan(0);
    expect(engine.simTicks).toBe(0);

    // Simulate forward movement input
    input.setActionState(InputAction.MOVE_FORWARD, 1.0);
    engine.tick(1 / 60);

    expect(engine.simTicks).toBe(1);
    expect(world.posZ[engine.playerEntityId]).toBeLessThan(0); // Moved forward (-Z)
  });
});
