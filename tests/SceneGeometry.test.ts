import { describe, it, expect } from 'vitest';
import {
  CUBE_INDICES,
  CUBE_INDEX_COUNT,
  CUBE_VERTEX_COUNT,
  CUBE_VERTICES,
  GROUND_Y,
  INSTANCE_FLOATS,
  INSTANCE_STRIDE,
  VERTEX_FLOATS,
  VERTEX_STRIDE,
  buildScene
} from '../src/rendering/SceneGeometry';

describe('cube mesh', () => {
  it('has one vertex per face corner so faces shade flat', () => {
    expect(CUBE_VERTEX_COUNT).toBe(24);
    expect(CUBE_INDEX_COUNT).toBe(36);
  });

  it('keeps every index inside the vertex range', () => {
    for (const index of CUBE_INDICES) {
      expect(index).toBeLessThan(CUBE_VERTEX_COUNT);
    }
  });

  it('carries unit-length axis-aligned normals', () => {
    for (let v = 0; v < CUBE_VERTEX_COUNT; v++) {
      const base = v * VERTEX_FLOATS;
      const nx = CUBE_VERTICES[base + 3];
      const ny = CUBE_VERTICES[base + 4];
      const nz = CUBE_VERTICES[base + 5];
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6);
    }
  });

  it('stands on its origin so instance Y scale is simply height', () => {
    for (let v = 0; v < CUBE_VERTEX_COUNT; v++) {
      const y = CUBE_VERTICES[v * VERTEX_FLOATS + 1];
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it('declares byte strides matching its float layout', () => {
    expect(VERTEX_STRIDE).toBe(VERTEX_FLOATS * 4);
    expect(INSTANCE_STRIDE).toBe(INSTANCE_FLOATS * 4);
  });
});

describe('scene generation', () => {
  it('produces a whole number of instances', () => {
    const scene = buildScene();
    expect(scene.instances.length % INSTANCE_FLOATS).toBe(0);
    expect(scene.instanceCount).toBe(scene.instances.length / INSTANCE_FLOATS);
    expect(scene.instanceCount).toBeGreaterThan(1);
  });

  it('is deterministic for a given seed', () => {
    const a = buildScene({ seed: 1234 });
    const b = buildScene({ seed: 1234 });
    expect(Array.from(a.instances)).toEqual(Array.from(b.instances));
  });

  it('produces a different world for a different seed', () => {
    const a = buildScene({ seed: 1 });
    const b = buildScene({ seed: 2 });
    expect(Array.from(a.instances)).not.toEqual(Array.from(b.instances));
  });

  it('emits only finite values, since one NaN corrupts an entire GPU buffer', () => {
    const scene = buildScene();
    for (let i = 0; i < scene.instances.length; i++) {
      expect(Number.isFinite(scene.instances[i])).toBe(true);
    }
  });

  it('keeps the spawn point clear so the player never starts inside a pillar', () => {
    const clearingRadius = 8;
    const scene = buildScene({ clearingRadius });

    // Instance 0 is the ground slab, which legitimately spans the origin.
    for (let i = 1; i < scene.instanceCount; i++) {
      const base = i * INSTANCE_FLOATS;
      const distance = Math.hypot(scene.instances[base], scene.instances[base + 2]);
      expect(distance).toBeGreaterThanOrEqual(clearingRadius);
    }
  });

  it('puts the top of the ground slab exactly at the walking plane', () => {
    const scene = buildScene();
    const groundY = scene.instances[1];
    const groundHeight = scene.instances[4];
    expect(groundY + groundHeight).toBeCloseTo(GROUND_Y, 6);
  });

  it('gives every pillar positive extents', () => {
    const scene = buildScene();
    for (let i = 0; i < scene.instanceCount; i++) {
      const base = i * INSTANCE_FLOATS;
      expect(scene.instances[base + 3]).toBeGreaterThan(0);
      expect(scene.instances[base + 4]).toBeGreaterThan(0);
      expect(scene.instances[base + 5]).toBeGreaterThan(0);
    }
  });

  it('scales the field with the requested radius', () => {
    const small = buildScene({ fieldRadius: 40 });
    const large = buildScene({ fieldRadius: 160 });
    expect(large.instanceCount).toBeGreaterThan(small.instanceCount);
    expect(small.extent).toBe(40);
  });
});
