import { describe, it, expect } from 'vitest';
import { World, COMPONENT_TRANSFORM, COMPONENT_VELOCITY } from '../src/ecs/World';

describe('ECS World', () => {
  it('should allocate and destroy entities cleanly', () => {
    const world = new World(100);
    const e1 = world.createEntity();
    const e2 = world.createEntity();

    expect(e1).toBe(1);
    expect(e2).toBe(2);
    expect(world.activeCount).toBe(2);

    world.destroyEntity(e1);
    expect(world.activeCount).toBe(1);

    const e3 = world.createEntity();
    expect(e3).toBe(e1); // Recycled entity ID
  });

  it('should attach components and update via tick', () => {
    const world = new World(100);
    const e = world.createEntity();

    world.addTransform(e, 0, 0, 0);
    world.addVelocity(e, 10, 0, -5);

    expect(world.hasComponents(e, COMPONENT_TRANSFORM | COMPONENT_VELOCITY)).toBe(true);

    world.tick(1.0); // 1 second delta

    expect(world.posX[e]).toBe(10);
    expect(world.posY[e]).toBe(0);
    expect(world.posZ[e]).toBe(-5);
  });
});
