import * as THREE from 'three';
import { createGltfLoader } from './GltfAssets';
import { streamFor } from '../world/Rng';
import { GROUND_Y } from './Atmosphere';

/**
 * Set dressing made of real models.
 *
 * `SetDressing` gives the world towers and a horizon — bulk, silhouette, parallax. It is all
 * boxes, and boxes are the right tool for a skyline seen at 300 m. They are the wrong tool for
 * the three metres either side of the track, which is the only part the player ever sees close
 * up, and where a cube reads as exactly what it is.
 *
 * This places actual objects there: lamps, braziers, parked vehicles, seating, a landmark. Between
 * them they answer the questions bulk cannot — what is this place, who uses it, how big am I.
 *
 * ## Roles, not decoration
 *
 * Each prop is placed for a reason rather than scattered:
 *
 *   - **Lamps** run the track edge at regular spacing. Regularity is the point: evenly spaced
 *     lights streaming past are one of the strongest speed cues available, and irregular ones
 *     destroy it.
 *   - **Braziers** mark the paddock edge in warm light against the cold palette.
 *   - **Vehicles and seating** sit further out in irregular clusters, because a paddock is not a
 *     grid and regularity there would read as wallpaper.
 *
 * Pooled and recycled like the spectators and the dust: fixed count, flat cost, no churn.
 */

interface PropSpec {
  url: string;
  /** How many exist at once. */
  count: number;
  scale: number;
  /** Distance from the centre line. */
  minOffset: number;
  maxOffset: number;
  /** Spacing along Z. Fixed for rhythmic props, jittered for scattered ones. */
  spacing: number;
  /** 0 = perfectly regular, 1 = fully random within the spacing. */
  jitter: number;
  /** Vertical placement. Everything stands on the paddock floor. */
  y: number;
  /** Random yaw, for props with no meaningful facing. */
  randomYaw: boolean;
}

const PROPS: readonly PropSpec[] = [
  // Rhythm. Light towers rising from the paddock floor to above track level, evenly spaced and
  // close in — the main speed cue. Tall enough that the lamp head passes at eye height.
  {
    url: '/characters/Lantern.glb',
    count: 14,
    scale: 0.88,
    minOffset: 8.5,
    maxOffset: 9.5,
    spacing: 26,
    jitter: 0,
    y: GROUND_Y,
    randomYaw: false
  },
  // Edge marking, warm and flickery against the cold palette.
  {
    url: '/characters/PotOfCoals.glb',
    count: 8,
    scale: 10,
    minOffset: 8,
    maxOffset: 11,
    spacing: 52,
    jitter: 0.5,
    y: GROUND_Y,
    randomYaw: true
  },
  // The paddock: parked, irregular, further out.
  {
    url: '/characters/CarConcept.glb',
    count: 5,
    scale: 1,
    minOffset: 15,
    maxOffset: 26,
    spacing: 95,
    jitter: 0.8,
    y: GROUND_Y,
    randomYaw: true
  },
  {
    url: '/characters/CesiumMilkTruck.glb',
    count: 3,
    scale: 1,
    minOffset: 18,
    maxOffset: 30,
    spacing: 160,
    jitter: 0.9,
    y: GROUND_Y,
    randomYaw: true
  },
  // Spectator infrastructure, which is what turns a crowd into an audience.
  {
    url: '/characters/SheenChair.glb',
    count: 9,
    scale: 1.3,
    minOffset: 10,
    maxOffset: 17,
    spacing: 44,
    jitter: 0.7,
    y: GROUND_Y,
    randomYaw: true
  },
  {
    url: '/characters/AntiqueCamera.glb',
    count: 4,
    scale: 0.22,
    minOffset: 11,
    maxOffset: 15,
    spacing: 120,
    jitter: 0.6,
    y: GROUND_Y,
    randomYaw: true
  },
  {
    url: '/characters/ToyCar.glb',
    count: 4,
    scale: 50,
    minOffset: 13,
    maxOffset: 22,
    spacing: 130,
    jitter: 0.8,
    y: GROUND_Y,
    randomYaw: true
  }
];

/** Corridor the props occupy relative to the player. */
const AHEAD = 260;
const BEHIND = 70;

interface PlacedProp {
  root: THREE.Object3D;
  z: number;
  side: number;
  offset: number;
  spacing: number;
  jitter: number;
  y: number;
  yaw: number;
}

export class PropScatter {
  private readonly group = new THREE.Group();
  private readonly props: PlacedProp[] = [];
  private ready = false;
  private recycleIndex = 0;

  public get object(): THREE.Object3D {
    return this.group;
  }

  public get loaded(): boolean {
    return this.ready;
  }

  public get count(): number {
    return this.props.length;
  }

  /**
   * Loads and places every prop.
   *
   * Each model is fetched once and cloned. These are static meshes, so a plain clone is correct —
   * unlike the spectators, there is no skeleton to share and nothing to animate.
   *
   * Failures are per-prop rather than fatal: one unreachable model leaves a slightly emptier
   * roadside, not a game that will not start.
   */
  public async load(seed: number): Promise<void> {
    const loader = createGltfLoader();
    let placed = 0;

    for (let p = 0; p < PROPS.length; p++) {
      const spec = PROPS[p];
      let source: THREE.Object3D;
      try {
        source = (await loader.loadAsync(spec.url)).scene;
      } catch {
        continue;
      }

      source.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Roadside props sit outside the shadow cascade that follows the player, so casting would
        // cost fill rate for a shadow that lands nowhere. They still receive, so they sit in the
        // scene rather than floating above it.
        mesh.castShadow = false;
        mesh.receiveShadow = true;
      });

      for (let i = 0; i < spec.count; i++) {
        const rng = streamFor(seed, 6000 + p * 100 + i);
        const root = source.clone(true);
        root.scale.setScalar(spec.scale * rng.range(0.9, 1.1));

        const prop: PlacedProp = {
          root,
          // Lamps alternate sides so the rhythm reads on both edges rather than one.
          side: spec.jitter === 0 ? (i % 2 === 0 ? 1 : -1) : rng.chance(0.5) ? 1 : -1,
          offset: rng.range(spec.minOffset, spec.maxOffset),
          spacing: spec.spacing,
          jitter: spec.jitter,
          y: spec.y,
          yaw: spec.randomYaw ? rng.range(0, Math.PI * 2) : 0,
          z: -(i * spec.spacing) - rng.range(0, spec.spacing * spec.jitter)
        };

        this.place(prop);
        this.group.add(root);
        this.props.push(prop);
        placed++;
      }
    }

    this.ready = placed > 0;
  }

  /**
   * Recycles props the player has passed.
   *
   * Two per frame. The pool is larger than the spectators', so one at a time would let props
   * accumulate behind the player faster than they are returned at speed.
   */
  public update(playerZ: number): void {
    if (!this.ready) return;

    for (let n = 0; n < 2; n++) {
      const prop = this.props[this.recycleIndex % this.props.length];
      this.recycleIndex++;

      if (prop.z > playerZ + BEHIND || prop.z < playerZ - AHEAD) {
        prop.z = playerZ - AHEAD * 0.94;
        this.place(prop);
      }
    }
  }

  private place(prop: PlacedProp): void {
    prop.root.position.set(prop.side * prop.offset, prop.y, prop.z);
    prop.root.rotation.y = prop.yaw;
  }

  public dispose(): void {
    for (const prop of this.props) prop.root.removeFromParent();
    this.props.length = 0;
    this.ready = false;
  }
}
