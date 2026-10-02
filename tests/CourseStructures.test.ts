import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCourseStructures } from '../src/rendering/CourseStructures';
import { buildCourse } from '../src/game/Course';
import type { Box } from '../src/game/Course';

/**
 * Structural detail is generated from course data and lives *under* the track, which means it is
 * invisible from any normal play camera. That makes it exactly the kind of feature that can
 * silently produce nothing — a filter that matches no platforms adds no meshes, throws no error,
 * and looks identical to working correctly.
 *
 * These pin the contract instead.
 */

function slab(
  minX: number,
  maxX: number,
  minY: number,
  minZ: number,
  maxZ: number,
  kind: Box['kind'] = 'platform'
): Box {
  return { minX, maxX, minY, maxY: minY + 0.5, minZ, maxZ, kind };
}

const material = new THREE.MeshBasicMaterial();

describe('course structures', () => {
  it('emits four pylons and four skirt rails per qualifying platform', () => {
    const structures = buildCourseStructures([slab(-5, 5, 0, -10, 10)], material);
    expect(structures.pylons?.count).toBe(4);
    expect(structures.skirts?.count).toBe(4);
    structures.dispose();
  });

  it('scales with platform count', () => {
    const boxes = [slab(-5, 5, 0, -10, 10), slab(-5, 5, 6, -40, -20), slab(-5, 5, 12, -70, -50)];
    const structures = buildCourseStructures(boxes, material);
    expect(structures.pylons?.count).toBe(12);
    structures.dispose();
  });

  it('ignores platforms too small to carry legs', () => {
    // A narrow ledge given four pylons reads as cluttered rather than supported.
    const structures = buildCourseStructures([slab(-0.5, 0.5, 0, -1, 1)], material);
    expect(structures.pylons).toBeNull();
    expect(structures.skirts).toBeNull();
    structures.dispose();
  });

  it('ignores non-platform surfaces', () => {
    // Walls, ceilings and hazards are not floors; hanging legs off them would be nonsense.
    const boxes: Box[] = [
      slab(-5, 5, 0, -10, 10, 'wall'),
      slab(-5, 5, 0, -10, 10, 'ceiling'),
      slab(-5, 5, 0, -10, 10, 'hazard'),
      slab(-5, 5, 0, -10, 10, 'goal')
    ];
    const structures = buildCourseStructures(boxes, material);
    expect(structures.pylons).toBeNull();
    structures.dispose();
  });

  it('generates structures for the real course', () => {
    // The guard that matters: if the shipped course has no qualifying platforms, every player
    // sees a track floating on nothing and no test above would have caught it.
    const structures = buildCourseStructures(buildCourse().boxes, material);
    expect(structures.pylons).not.toBeNull();
    expect(structures.pylons!.count).toBeGreaterThan(8);
    expect(structures.pylons!.count % 4).toBe(0);
    structures.dispose();
  });

  it('hangs pylons downward from the platform underside', () => {
    const structures = buildCourseStructures([slab(-5, 5, 10, -10, 10)], material);
    const matrix = new THREE.Matrix4();
    structures.pylons!.getMatrixAt(0, matrix);

    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    matrix.decompose(position, new THREE.Quaternion(), scale);

    // Anchored at the platform's underside, extending down — not straddling it.
    expect(position.y).toBeCloseTo(10, 5);
    expect(scale.y).toBeGreaterThan(1);
    structures.dispose();
  });

  it('insets pylons inside the platform footprint', () => {
    const structures = buildCourseStructures([slab(-5, 5, 0, -10, 10)], material);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();

    for (let i = 0; i < structures.pylons!.count; i++) {
      structures.pylons!.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      // A leg on the outer edge sticks out past the slab it supports.
      expect(Math.abs(position.x)).toBeLessThan(5);
      expect(Math.abs(position.z)).toBeLessThan(10);
    }
    structures.dispose();
  });
});
