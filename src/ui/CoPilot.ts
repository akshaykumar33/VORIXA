/**
 * The co-pilot.
 *
 * A chibi character sitting in the corner of the cockpit, drawn from the two sprite sheets the
 * `page-mascot` skill ships. On a normal page it follows the mouse. Here it follows **where the
 * player is actually looking**, taken from the gaze tracker — which is the one thing this game can
 * do that a web page cannot, and the reason it is worth having at all.
 *
 * ## Why canvas rather than the React component the skill provides
 *
 * VORIXA has no React. The whole interface is a canvas overlay above the WebGL view, and the
 * engine core is framework-free by ADR-0007. Pulling in React to position one sprite would be a
 * dependency, a bundle, and a second rendering model for a job the existing overlay already does.
 *
 * The sheet format makes this trivial anyway: two 3×3 grids indexed by cell, so drawing one is a
 * `drawImage` with a source rectangle. Nothing about the asset is React-specific.
 *
 * ## Sheet layout
 *
 * Both sheets are 3×3, row-major:
 *
 *   directions: up-left · up · up-right / left · center · right / down-left · down · down-right
 *   reactions:  blink · heart · sparkle / surprised · wink · bashful / sleepy · dizzy · delighted
 */

/** Cell indices into the directions sheet. */
const DIR_CENTER = 4;

/** Cell indices into the reactions sheet. */
const REACTION = {
  blink: 0,
  heart: 1,
  sparkle: 2,
  surprised: 3,
  wink: 4,
  bashful: 5,
  sleepy: 6,
  dizzy: 7,
  delighted: 8
} as const;

export type CoPilotMood =
  | 'idle'
  | 'boost'
  | 'hazard'
  | 'checkpoint'
  | 'dilating'
  | 'falling'
  | 'record';

/**
 * How long a reaction holds before the face returns to neutral.
 *
 * Long enough to register at speed, short enough that a run full of checkpoints does not leave the
 * co-pilot permanently mid-expression.
 */
const REACTION_HOLD = 0.9;

/**
 * Idle blink timing. Irregular on purpose — a character blinking on a fixed metronome reads as a
 * looping animation rather than something alive.
 */
const BLINK_MIN_GAP = 2.4;
const BLINK_MAX_GAP = 6.5;
const BLINK_DURATION = 0.13;

/**
 * Angular hysteresis before the head switches cell, in radians.
 *
 * Without it, a gaze hovering on a sector boundary flickers between two directions every frame,
 * which is far more distracting than the head simply lagging slightly.
 */
const SECTOR_HYSTERESIS = 0.18;
/** Below this deflection the head returns to centre rather than committing to a direction. */
const DEAD_ZONE = 0.18;

export interface CoPilotInput {
  /** -1..1, where the player is looking. From gaze when live, otherwise from look direction. */
  gazeX: number;
  /** -1..1, positive is up. */
  gazeY: number;
  mood: CoPilotMood;
  /** True when the vision tracker is on but has lost the player. Drives a sleepy face. */
  trackingLost: boolean;
  /**
   * Whether to draw at all.
   *
   * The co-pilot shares the lower-left corner with the start prompt, and a character sitting on
   * top of the title card is clutter rather than personality. It is a cockpit instrument, so it
   * appears once the player is actually flying.
   */
  visible: boolean;
}

export class CoPilot {
  private directions: HTMLImageElement | null = null;
  private reactions: HTMLImageElement | null = null;
  private ready = false;

  private direction = DIR_CENTER;
  private reactionCell: number | null = null;
  private reactionTimer = 0;
  private blinkCountdown = BLINK_MIN_GAP;
  private blinkTimer = 0;
  private lastMood: CoPilotMood = 'idle';
  /** Eased bob, so the character floats rather than sitting rigid in the corner. */
  private bobTime = 0;

  /**
   * Loads both sheets.
   *
   * Failure is silent and total: the co-pilot simply never draws. A missing decorative asset must
   * never take the game down, and the player is not owed an error about a face.
   */
  public async load(directionsUrl: string, reactionsUrl: string): Promise<void> {
    try {
      const [directions, reactions] = await Promise.all([
        loadImage(directionsUrl),
        loadImage(reactionsUrl)
      ]);
      this.directions = directions;
      this.reactions = reactions;
      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  public get loaded(): boolean {
    return this.ready;
  }

  public update(dt: number, input: CoPilotInput): void {
    this.bobTime += dt;
    this.updateDirection(input);
    this.updateFace(dt, input);
  }

  /**
   * Picks the head cell from the gaze vector.
   *
   * Sectors are chosen by comparing against the eight surrounding directions rather than by
   * rounding an angle, because the dead zone and the centre cell make this a nine-way choice, not
   * an eight-way one.
   */
  private updateDirection(input: CoPilotInput): void {
    const magnitude = Math.hypot(input.gazeX, input.gazeY);
    if (magnitude < DEAD_ZONE) {
      this.direction = DIR_CENTER;
      return;
    }

    const angle = Math.atan2(input.gazeY, input.gazeX);
    const next = cellForAngle(angle);
    if (next === this.direction) return;

    // Only switch once the gaze is clearly inside the new sector, so a boundary does not chatter.
    const currentAngle = angleForCell(this.direction);
    if (currentAngle !== null) {
      const delta = Math.abs(wrapAngle(angle - currentAngle));
      if (delta < Math.PI / 4 + SECTOR_HYSTERESIS) return;
    }
    this.direction = next;
  }

  private updateFace(dt: number, input: CoPilotInput): void {
    // A mood change is an event, not a state: it fires once and decays, so holding a boost does
    // not freeze the face in one expression for the whole pad.
    if (input.mood !== this.lastMood && input.mood !== 'idle') {
      this.reactionCell = reactionFor(input.mood);
      this.reactionTimer = REACTION_HOLD;
    }
    this.lastMood = input.mood;

    if (this.reactionTimer > 0) {
      this.reactionTimer -= dt;
      if (this.reactionTimer <= 0) this.reactionCell = null;
      return;
    }

    // Losing the player is worth showing. A tracker that has quietly stopped seeing you is
    // otherwise indistinguishable from one that is working and ignoring you.
    if (input.trackingLost) {
      this.reactionCell = REACTION.sleepy;
      return;
    }

    this.updateBlink(dt);
  }

  private updateBlink(dt: number): void {
    if (this.blinkTimer > 0) {
      this.blinkTimer -= dt;
      this.reactionCell = this.blinkTimer > 0 ? REACTION.blink : null;
      return;
    }

    this.blinkCountdown -= dt;
    if (this.blinkCountdown <= 0) {
      this.blinkTimer = BLINK_DURATION;
      this.blinkCountdown = BLINK_MIN_GAP + Math.random() * (BLINK_MAX_GAP - BLINK_MIN_GAP);
      this.reactionCell = REACTION.blink;
    }
  }

  /**
   * Draws the co-pilot.
   *
   * The reactions sheet is drawn *over* the directions sheet rather than instead of it — the
   * expression art is a face overlay, so compositing keeps the head pointed where the player is
   * looking while the expression changes independently.
   */
  public draw(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    if (!this.ready || !this.directions || !this.reactions) return;

    const bob = Math.sin(this.bobTime * 1.6) * size * 0.012;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    drawCell(ctx, this.directions, this.direction, x, y + bob, size);
    if (this.reactionCell !== null) {
      drawCell(ctx, this.reactions, this.reactionCell, x, y + bob, size);
    }
    ctx.restore();
  }
}

/** Draws one cell of a 3×3 sheet at the given square. */
function drawCell(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  index: number,
  x: number,
  y: number,
  size: number
): void {
  const cellW = sheet.naturalWidth / 3;
  const cellH = sheet.naturalHeight / 3;
  const col = index % 3;
  const row = Math.floor(index / 3);
  ctx.drawImage(sheet, col * cellW, row * cellH, cellW, cellH, x, y, size, size);
}

/**
 * Maps an angle to a direction cell.
 *
 * Screen-space y is inverted relative to the gaze input, which is positive-up — so "looking up"
 * has to select the *top* row. Getting this backwards produces a character that mirrors the
 * player, which looks deliberate and is completely wrong.
 */
function cellForAngle(angle: number): number {
  const octant = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
  // Octants counter-clockwise from +x, mapped onto sheet cells.
  const byOctant = [5, 2, 1, 0, 3, 6, 7, 8];
  return byOctant[octant];
}

/** Inverse of `cellForAngle`, for hysteresis. Null for the centre cell, which has no angle. */
function angleForCell(cell: number): number | null {
  const byOctant = [5, 2, 1, 0, 3, 6, 7, 8];
  const octant = byOctant.indexOf(cell);
  return octant === -1 ? null : octant * (Math.PI / 4);
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function reactionFor(mood: CoPilotMood): number {
  switch (mood) {
    case 'boost':
      return REACTION.sparkle;
    case 'hazard':
      return REACTION.dizzy;
    case 'checkpoint':
      return REACTION.delighted;
    case 'dilating':
      return REACTION.surprised;
    case 'falling':
      return REACTION.surprised;
    case 'record':
      return REACTION.heart;
    default:
      return REACTION.blink;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}
