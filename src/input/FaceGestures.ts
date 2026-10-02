/**
 * Face gestures: turns the face model's expression scores into game commands, so a player with
 * only a webcam and their face can do everything a keyboard can.
 *
 *   - raise your eyebrows  → jump        (edge: fires once per raise)
 *   - open your mouth      → fire        (held: fires while open)
 *   - smile wide           → nitro       (held)
 *   - wink one eye         → use item    (edge)
 *
 * Every face is different at rest: some people's brows sit high, some mouths rest half open.
 * Each expression therefore tracks a slowly-adapting **baseline** — the player's neutral face —
 * and a gesture is measured as a rise above it. Hysteresis (engage high, release low) keeps a
 * score hovering at a threshold from flickering the command on and off.
 *
 * Pure: scores in, commands out, so it is tested with synthetic faces.
 */

export interface ExpressionScores {
  jawOpen: number;
  browInnerUp: number;
  mouthSmileLeft: number;
  mouthSmileRight: number;
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
}

export interface FaceCommands {
  /** True on the frame the brows go up. */
  jumpStarted: boolean;
  /** True while the mouth is open. */
  firing: boolean;
  /** True while smiling. */
  nitro: boolean;
  /** True on the frame a wink is recognised. */
  itemStarted: boolean;
  /** Raw readings above baseline, 0–1, for the preview meters. */
  levels: { mouth: number; brows: number; smile: number };
}

/** Rise above baseline needed to engage, and the level it must fall below to release. */
const MOUTH = { engage: 0.3, release: 0.15 };
const BROWS = { engage: 0.3, release: 0.15 };
const SMILE = { engage: 0.4, release: 0.22 };
/** A wink: one eye this shut… */
const WINK_CLOSED = 0.55;
/** …while the other stays this open… */
const WINK_OPEN = 0.3;
/** …for at least this long (a blink is shorter and uses both eyes). */
const WINK_HOLD = 0.15;
/** Baselines drift toward the resting face at this rate, only while no gesture is held. */
const BASELINE_RATE = 0.4;
/** Baselines never rise above this, so a held gesture can't teach itself to be "neutral". */
const BASELINE_CAP = 0.35;

class Channel {
  public on = false;
  private baseline = -1;

  public constructor(private readonly t: { engage: number; release: number }) {}

  /** Returns [level above baseline, engaged, justEngaged]. */
  public step(value: number, dt: number): [number, boolean, boolean] {
    if (this.baseline < 0) this.baseline = Math.min(value, BASELINE_CAP);
    const level = Math.max(0, value - this.baseline);
    const was = this.on;
    if (!this.on && level >= this.t.engage) this.on = true;
    else if (this.on && level <= this.t.release) this.on = false;
    if (!this.on) {
      const k = 1 - Math.exp(-BASELINE_RATE * dt);
      this.baseline = Math.min(BASELINE_CAP, this.baseline + (value - this.baseline) * k);
    }
    return [level, this.on, this.on && !was];
  }

  public reset(): void {
    this.on = false;
    this.baseline = -1;
  }
}

export class FaceGestureMapper {
  private readonly mouth = new Channel(MOUTH);
  private readonly brows = new Channel(BROWS);
  private readonly smile = new Channel(SMILE);
  private winkTime = 0;
  private winked = false;

  public readonly commands: FaceCommands = {
    jumpStarted: false,
    firing: false,
    nitro: false,
    itemStarted: false,
    levels: { mouth: 0, brows: 0, smile: 0 }
  };

  public reset(): void {
    this.mouth.reset();
    this.brows.reset();
    this.smile.reset();
    this.winkTime = 0;
    this.winked = false;
    const c = this.commands;
    c.jumpStarted = c.firing = c.nitro = c.itemStarted = false;
    c.levels.mouth = c.levels.brows = c.levels.smile = 0;
  }

  /** @param s Expression scores for this frame, or null when no face is tracked. */
  public update(s: ExpressionScores | null, dt: number): FaceCommands {
    const c = this.commands;
    c.jumpStarted = false;
    c.itemStarted = false;
    if (!s) {
      // Losing the face must drop held commands, never freeze them on.
      c.firing = c.nitro = false;
      this.winkTime = 0;
      return c;
    }

    const bothShut = s.eyeBlinkLeft > WINK_CLOSED && s.eyeBlinkRight > WINK_CLOSED;
    const [mouthLevel, mouthOn] = this.mouth.step(s.jawOpen, dt);
    const [browLevel, , browStarted] = this.brows.step(s.browInnerUp, dt);
    const [smileLevel, smileOn] = this.smile.step((s.mouthSmileLeft + s.mouthSmileRight) / 2, dt);

    c.firing = mouthOn;
    c.nitro = smileOn;
    // A hard blink squeezes the brows too; that is slow-mo, not a jump.
    c.jumpStarted = browStarted && !bothShut;

    const winking =
      (s.eyeBlinkLeft > WINK_CLOSED && s.eyeBlinkRight < WINK_OPEN) ||
      (s.eyeBlinkRight > WINK_CLOSED && s.eyeBlinkLeft < WINK_OPEN);
    if (winking) {
      this.winkTime += dt;
      if (this.winkTime >= WINK_HOLD && !this.winked) {
        this.winked = true;
        c.itemStarted = true;
      }
    } else {
      this.winkTime = 0;
      this.winked = false;
    }

    c.levels.mouth = mouthLevel;
    c.levels.brows = browLevel;
    c.levels.smile = smileLevel;
    return c;
  }
}
