import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCraftSilhouette } from '../src/rendering/PlayerCraft';

/**
 * The ghost craft is only ever on screen mid-run, behind the player, and semi-transparent — so a
 * degenerate or inside-out mesh would look like a faint smudge rather than an obvious bug, and
 * nobody would file it.
 *
 * These pin the shape instead of relying on catching it in motion.
 */

function positions(geometry: THREE.BufferGeometry): Float32Array {
  return geometry.getAttribute('position').array as Float32Array;
}

describe('craft silhouette', () => {
  it('builds whole triangles', () => {
    const array = positions(createCraftSilhouette());
    expect(array.length % 9).toBe(0);
    expect(array.length / 9).toBeGreaterThanOrEqual(8);
  });

  it('has no NaN or infinite vertices', () => {
    // A single bad component silently removes the whole mesh from the scene.
    for (const value of positions(createCraftSilhouette())) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('has computed normals', () => {
    const geometry = createCraftSilhouette();
    const normal = geometry.getAttribute('normal');
    expect(normal).toBeDefined();
    expect(normal.count).toBe(geometry.getAttribute('position').count);
  });

  it('contains no degenerate triangles', () => {
    // Zero-area triangles produce NaN normals, which render as black or vanish entirely.
    const array = positions(createCraftSilhouette());
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    for (let i = 0; i < array.length; i += 9) {
      a.fromArray(array, i);
      b.fromArray(array, i + 3);
      c.fromArray(array, i + 6);
      const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      expect(area).toBeGreaterThan(1e-6);
    }
  });

  it('points its nose down -Z, matching travel direction', () => {
    // The course runs toward -Z. A ghost facing +Z would fly backwards down the track.
    const geometry = createCraftSilhouette();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    // The nose is the furthest extent, so the shape must reach further in -Z than +Z.
    expect(Math.abs(box.min.z)).toBeGreaterThan(Math.abs(box.max.z));
  });

  it('is sized like a craft, not a landmark', () => {
    const geometry = createCraftSilhouette();
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox!.getSize(size);

    // Roughly player-scale. A ghost the size of a platform would obscure the course it is racing.
    expect(size.x).toBeGreaterThan(0.5);
    expect(size.x).toBeLessThan(2);
    expect(size.z).toBeGreaterThan(0.8);
    expect(size.z).toBeLessThan(3);
  });

  it('has real volume so it never reads as a flat sliver edge-on', () => {
    const geometry = createCraftSilhouette();
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox!.getSize(size);
    expect(size.y).toBeGreaterThan(0.1);
  });
});
