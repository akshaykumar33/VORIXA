/**
 * The course.
 *
 * In a time-attack game the level *is* the content, so this is authored by hand, box by box, not
 * generated. Every gap width and ceiling height below is a number the player will feel in their
 * hands within ten seconds of meeting it, and they are tuned against the movement constants in
 * `PlayerController` — change one and you must re-check the other.
 *
 * Forward is -Z, matching the camera convention. The player spawns at the origin.
 *
 * Surfaces are colour-coded by what they want you to do, so the course teaches itself:
 *   - slate  `platform` : stand on it
 *   - amber  `ceiling`  : too low to stand under — slide
 *   - cyan   `wall`     : run along it
 *   - green  `goal`     : the end
 */

export type SurfaceKind = 'platform' | 'ceiling' | 'wall' | 'goal' | 'boost' | 'jump_pad' | 'hazard';

export interface Box {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
  readonly kind: SurfaceKind;
}

export interface Checkpoint {
  /** Order along the course. 0 is the start line. */
  readonly index: number;
  /** Where the player respawns after a fall, standing on the floor. */
  readonly spawnX: number;
  readonly spawnY: number;
  readonly spawnZ: number;
  /** Trigger plane: crossing this Z value in the -Z direction arms the checkpoint. */
  readonly triggerZ: number;
  /** Half-width of the trigger, so you cannot arm it from off the side of the course. */
  readonly halfWidth: number;
  readonly label: string;
}

export interface CourseData {
  readonly boxes: readonly Box[];
  readonly checkpoints: readonly Checkpoint[];
  readonly spawnX: number;
  readonly spawnY: number;
  readonly spawnZ: number;
  /** Falling below this Y means you missed; respawn at the last checkpoint. */
  readonly killY: number;
  /** Crossing this Z ends the run. */
  readonly finishZ: number;
}

function slab(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  kind: SurfaceKind = 'platform'
): Box {
  return {
    minX: Math.min(x0, x1),
    maxX: Math.max(x0, x1),
    minY: Math.min(y0, y1),
    maxY: Math.max(y0, y1),
    minZ: Math.min(z0, z1),
    maxZ: Math.max(z0, z1),
    kind
  };
}

/** Waist-high rails. They read as a lane without ever being the thing you collide with. */
function rails(x: number, z0: number, z1: number, y = 0): Box[] {
  return [
    slab(-x - 0.4, -x, y, y + 0.9, z0, z1),
    slab(x, x + 0.4, y, y + 0.9, z0, z1)
  ];
}

/**
 * Reach budget, derived from the constants in `PlayerController`. Every gap below is sized
 * against these, and `tests/Course.test.ts` simulates each one to prove it is actually passable —
 * an earlier layout had a dash gap with no landing platform within reach, which no amount of
 * looking at the code revealed and no amount of skill could clear.
 *
 *   running jump  : 9.5 m/s × 0.71 s airtime      ≈ 6.7 m
 *   jump + dash   : run-up + 26 m/s dash + fall   ≈ 11.5 m
 *   wall-run      : 1.5 s at ~10 m/s              ≈ 15 m of wall
 */
export function buildCourse(): CourseData {
  const boxes: Box[] = [];
  const push = (...b: Box[]) => boxes.push(...b);

  // ── 1. Start straight (z 8 → -30) ──────────────────────────────────────────
  // Long and empty on purpose: the first seconds are where the player finds out
  // that holding forward builds speed, before anything can punish them for it.
  push(slab(-7, 7, -1, 0, -30, 8));
  push(...rails(7, -30, 8));
  // Boost pad: introduces the speed boost mechanic early on the straightaway
  push(slab(-2.5, 2.5, 0, 0.05, -22, -18, 'boost'));

  // ── 2. Jump gap, 4 m (z -30 → -34) ─────────────────────────────────────────
  // Comfortably inside a 6.7 m running jump. It exists to teach that gaps are
  // jumpable at all, so it must not be the one that kills anybody.
  push(slab(-7, 7, -1, 0, -62, -34));
  push(...rails(7, -62, -34));

  // ── 3. Slide tunnel (z -54 → -44) ──────────────────────────────────────────
  // Ceiling at 1.3 m: standing height is 1.8, slide height is 1.0. There is exactly
  // one way through, and the amber colour announces it before you arrive.
  //
  // The lintel is kept thin (0.8 m) and the side posts stop at the same height, so from a
  // distance this reads as a *portal you duck through*. An earlier version ran the ceiling up to
  // 4.2 m, which was mechanically identical but filled the approach with a flat amber wall — the
  // player could not see the opening, only an obstacle, and simply stopped dead in front of it.
  push(slab(-7, 7, 1.3, 2.1, -54, -44, 'ceiling'));
  push(slab(-7, -6.4, 0, 2.1, -54, -44));
  push(slab(6.4, 7, 0, 2.1, -54, -44));

  // ── 4. Speed gap, 6 m (z -62 → -68) ────────────────────────────────────────
  // Near the limit of a running jump, so it only goes well if the speed from the
  // slide was kept. The first gap that asks whether the last section was understood.
  push(slab(-4, 4, -1, 0, -88, -68));
  push(...rails(4, -88, -68));

  // ── 5. Dash gap, 10 m (z -88 → -98) ────────────────────────────────────────
  // Too far to jump (6.7 m), inside jump-plus-dash (11.5 m). Flanked by wall-run
  // walls, so there are two ways across: dash it, or run the wall. Giving one
  // obstacle two solutions is what turns a course into a route worth optimising.
  push(slab(3.6, 4.6, 0, 9, -98, -88, 'wall'));
  push(slab(-4.6, -3.6, 0, 9, -98, -88, 'wall'));

  // ── 6. Landing platform (z -98 → -112) ─────────────────────────────────────
  push(slab(-5, 5, -1, 0, -112, -98));
  push(...rails(5, -112, -98));
  // Jump pad: launches the player high onto the upper stairs
  push(slab(2.2, 4.4, 0, 0.05, -108, -104, 'jump_pad'));
  // Hazard pylon: warning obstacle rewarding spatial awareness
  push(slab(-4.8, -3.2, 0, 1.8, -106, -104, 'hazard'));

  // ── 7. Stair climb (z -112 → -130) ─────────────────────────────────────────
  // Gains the 4.5 m the corridor needs, as nine 0.5 m steps rather than three 1.5 m ones.
  // Step height is set just under the controller's 0.55 m step-up assist, so the whole ramp is
  // run straight up at full speed. At 1.5 m each the player had to stop and jump nine times,
  // which killed every run's momentum right before the hardest section.
  for (let i = 0; i < 9; i++) {
    const top = 0.5 * (i + 1);
    const z1 = -112 - i * 2;
    push(slab(-5, 5, top - 1.2, top, z1 - 2, z1));
  }

  // ── 8. Wall-run corridor over the pit (z -130 → -144) ──────────────────────
  // No floor for 14 m, walls both sides. A mid-point ledge makes it learnable:
  // you can take it in two hops while learning and in one clean wall-run once
  // you can, which is exactly the gap between a first clear and a good time.
  //
  // The ledge is 4 m deep and starts 6 m from the lip, comfortably inside a 6.7 m jump. At 2 m
  // deep it sat 0.3 m beyond reach — mathematically impossible, and indistinguishable from
  // "I mistimed it" for anyone playing.
  push(slab(4.2, 5.2, 4, 16, -144, -130, 'wall'));
  push(slab(-5.2, -4.2, 4, 16, -144, -130, 'wall'));
  push(slab(-1.8, 1.8, 3.9, 4.5, -140, -136));

  // ── 9. Finish (z -144 → -172) ──────────────────────────────────────────────
  push(slab(-7, 7, 3.5, 4.5, -172, -144));
  push(...rails(7, -172, -144, 4.5));
  // The goal slab is a visual gate you run through, never something you hit.
  push(slab(-7, 7, 4.5, 8, -162.4, -162, 'goal'));

  const checkpoints: Checkpoint[] = [
    { index: 0, spawnX: 0, spawnY: 0, spawnZ: 0, triggerZ: 0, halfWidth: 8, label: 'START' },
    { index: 1, spawnX: 0, spawnY: 0, spawnZ: -38, triggerZ: -38, halfWidth: 8, label: 'TUNNEL' },
    { index: 2, spawnX: 0, spawnY: 0, spawnZ: -74, triggerZ: -74, halfWidth: 5, label: 'LEDGE' },
    // Respawn heights must match the surface the player lands back on, or a fall puts them
    // inside the floor or drops them straight back into the pit they just fell into.
    { index: 3, spawnX: 0, spawnY: 0, spawnZ: -102, triggerZ: -102, halfWidth: 6, label: 'LANDING' },
    { index: 4, spawnX: 0, spawnY: 4.5, spawnZ: -128, triggerZ: -128, halfWidth: 6, label: 'CORRIDOR' }
  ];

  return {
    boxes,
    checkpoints,
    spawnX: 0,
    spawnY: 0,
    spawnZ: 0,
    killY: -18,
    finishZ: -162
  };
}
