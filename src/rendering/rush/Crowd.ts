import * as THREE from 'three';
import { LANE_WIDTH } from '../../rush/RushSim';
import { CHARACTER_NAMES, PERSON_SCALE, type Character, type CharacterLibrary } from '../CharacterLibrary';

/**
 * Spectators at the roadside: real animated people (Kenney Mini Characters) who idle, then cheer
 * as the car comes past.
 *
 * Skinned meshes cannot be instanced, so the crowd is a fixed pool recycled along the road.
 * Standing places are a pure function of distance (a slot every `SPACING` metres, kept or skipped
 * by a hash), so the same stretch of road always has the same people on it, and a pool larger than
 * the number of slots in view means no one is ever in two places at once.
 */

const SPACING = 8;
/** Visible from just behind the camera to where the fog has swallowed them. */
const BEHIND = 12;
const AHEAD = 120;
const POOL = Math.ceil((BEHIND + AHEAD) / SPACING) + 2;
/** Cheer while the car is this close. */
const CHEER_AHEAD = 30;
const CHEER_BEHIND = 6;
const ROAD_EDGE = (LANE_WIDTH * 3) / 2 + 1.4;

function hash(k: number, salt: number): number {
  let h = (k * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface Spectator {
  character: Character | null;
  slot: number;
}

export class Crowd {
  public readonly group = new THREE.Group();
  private readonly pool: Spectator[] = [];
  private enabled = true;

  public constructor(private readonly library: CharacterLibrary) {
    for (let i = 0; i < POOL; i++) this.pool.push({ character: null, slot: -1 });
  }

  /** Stages without an audience (bonus roads, the driving school) switch the crowd off. */
  public setEnabled(on: boolean): void {
    this.enabled = on;
    this.group.visible = on;
  }

  /** @param distance The car's distance along the road. */
  public update(distance: number, dt: number): void {
    if (!this.enabled) return;
    const first = Math.ceil((distance - BEHIND) / SPACING);
    const last = Math.floor((distance + AHEAD) / SPACING);
    for (const s of this.pool) if (s.character) s.character.root.visible = false;

    for (let slot = Math.max(first, 2); slot <= last; slot++) {
      // About half the places are empty, which reads as a crowd of groups rather than a queue.
      if (hash(slot, 7) < 0.45) continue;
      const index = slot % POOL;
      const spectator = this.pool[index];
      if (!spectator.character) {
        // Each pool place is one person for good (cloning a skinned mesh is not per-frame work).
        spectator.character = this.library.spawn(CHARACTER_NAMES[index % CHARACTER_NAMES.length]);
        if (!spectator.character) continue;
        this.group.add(spectator.character.root);
      }
      const c = spectator.character;
      if (spectator.slot !== slot) {
        spectator.slot = slot;
        c.root.scale.setScalar(PERSON_SCALE * (0.92 + hash(slot, 5) * 0.16));
        c.play('idle', { fade: 0 });
        c.offset(hash(slot, 11) * 4);
      }
      const side = hash(slot, 1) < 0.5 ? -1 : 1;
      const x = side * (ROAD_EDGE + hash(slot, 2) * 3.5);
      const z = -(slot * SPACING - distance);
      c.root.position.set(x, 0, z);
      // Face the road, turned a little toward the oncoming car.
      c.root.rotation.y = side < 0 ? Math.PI / 2 - 0.35 : -Math.PI / 2 + 0.35;
      c.root.visible = true;

      const ahead = slot * SPACING - distance;
      const cheering = ahead < CHEER_AHEAD && ahead > -CHEER_BEHIND;
      c.play(cheering ? 'emote-yes' : 'idle', { fade: 0.25, speed: cheering ? 1.3 : 1 });
      c.update(dt);
    }
  }
}
