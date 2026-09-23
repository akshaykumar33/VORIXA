import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PlayerCraft, type CraftState } from '../src/rendering/PlayerCraft';

/**
 * The craft's entire contribution is motion, and none of it is verifiable from a screenshot: the
 * amplitudes are a few pixels, and a WebGL canvas with `preserveDrawingBuffer: false` reads back
 * blank so pixel-diffing the running game measures nothing at all. Tried that; it reported zero
 * change across a frame that was demonstrably rendering.
 *
 * So the responses are pinned here, against the transform.
 */

const COLORS = { hull: 0x2b3340, edge: 0xd6ff45, engine: 0xd6ff45, brake: 0xff4d5e };
const DT = 1 / 60;

function state(overrides: Partial<CraftState> = {}): CraftState {
  return { speed: 0, bank: 0, brake: 0, boosting: false, dilating: false, ...overrides };
}

/** Steps the craft for a duration so eased responses have time to arrive. */
function settle(craft: PlayerCraft, s: CraftState, seconds = 1): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) craft.update(s, DT);
}

describe('bank', () => {
  it('leans opposite the bank input so it reads against camera roll', () => {
    const craft = new PlayerCraft(COLORS);
    settle(craft, state({ bank: 1 }));
    // Camera rolls one way; the craft counter-rolls, or the two cancel and nothing is visible.
    expect(craft.hull.rotation.z).toBeLessThan(-0.1);
    craft.dispose();
  });

  it('mirrors for the opposite input', () => {
    const left = new PlayerCraft(COLORS);
    const right = new PlayerCraft(COLORS);
    settle(left, state({ bank: -1 }));
    settle(right, state({ bank: 1 }));
    expect(Math.sign(left.hull.rotation.z)).toBe(-Math.sign(right.hull.rotation.z));
    left.dispose();
    right.dispose();
  });

  it('eases rather than snapping', () => {
    // A craft that reaches full lean in one frame reads as a HUD element, not as mass.
    const craft = new PlayerCraft(COLORS);
    craft.update(state({ bank: 1 }), DT);
    const afterOneFrame = Math.abs(craft.hull.rotation.z);
    settle(craft, state({ bank: 1 }));
    expect(afterOneFrame).toBeLessThan(Math.abs(craft.hull.rotation.z) * 0.5);
    craft.dispose();
  });
});

describe('speed rake', () => {
  it('pitches the nose as speed builds', () => {
    const still = new PlayerCraft(COLORS);
    const fast = new PlayerCraft(COLORS);
    settle(still, state({ speed: 0 }));
    settle(fast, state({ speed: 1 }));
    expect(fast.hull.rotation.x).toBeGreaterThan(still.hull.rotation.x);
    still.dispose();
    fast.dispose();
  });
});

describe('idle float', () => {
  it('never holds perfectly still when stationary', () => {
    // A craft frozen in place reads as a decal stuck to the lens.
    const craft = new PlayerCraft(COLORS);
    const s = state({ speed: 0 });

    settle(craft, s, 0.5);
    const first = craft.hull.position.y;
    settle(craft, s, 0.5);
    const second = craft.hull.position.y;

    expect(first).not.toBeCloseTo(second, 6);
    craft.dispose();
  });

  it('damps the float as speed rises', () => {
    // At pace there is already motion on screen; adding sway only softens the image.
    const sampleSway = (speed: number): number => {
      const craft = new PlayerCraft(COLORS);
      const s = state({ speed });
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < 360; i++) {
        craft.update(s, DT);
        min = Math.min(min, craft.hull.position.y);
        max = Math.max(max, craft.hull.position.y);
      }
      craft.dispose();
      return max - min;
    };

    expect(sampleSway(1)).toBeLessThan(sampleSway(0) * 0.35);
  });

  it('stays sub-pixel-scale rather than becoming a wobble', () => {
    const craft = new PlayerCraft(COLORS);
    const s = state({ speed: 0 });
    for (let i = 0; i < 600; i++) {
      craft.update(s, DT);
      expect(Math.abs(craft.hull.position.y)).toBeLessThan(0.02);
      expect(Math.abs(craft.hull.position.x)).toBeLessThan(0.02);
    }
    craft.dispose();
  });
});

describe('attachment', () => {
  it('adds the camera to the scene so its children render', () => {
    // three.js does not warn about this; the craft simply never appears.
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const craft = new PlayerCraft(COLORS);

    craft.attachTo(camera, scene);

    expect(camera.parent).toBe(scene);
    expect(camera.children.length).toBeGreaterThan(0);
    craft.dispose();
  });

  it('does not re-parent a camera that is already in the graph', () => {
    const scene = new THREE.Scene();
    const rig = new THREE.Group();
    const camera = new THREE.PerspectiveCamera();
    rig.add(camera);
    scene.add(rig);

    const craft = new PlayerCraft(COLORS);
    craft.attachTo(camera, scene);

    // Stealing the camera out of a rig would silently break whatever was driving it.
    expect(camera.parent).toBe(rig);
    craft.dispose();
  });
});
