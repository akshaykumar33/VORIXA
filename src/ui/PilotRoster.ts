/**
 * The pilots flying the rival craft.
 *
 * Traffic without faces is scenery. Giving each rival a named pilot with a portrait turns a
 * procedurally recycled craft into *someone you are overtaking*, which is most of what makes a
 * racing game feel populated rather than simulated.
 *
 * Portraits come from the `page-mascot` character sheets — the same 3×3 grids the co-pilot uses,
 * of which only the centre cell is needed here. Reusing that format means a new pilot is one more
 * file and a callsign, with no bespoke art pipeline.
 *
 * ## Lazy, always
 *
 * Each sheet is roughly 200 kB, and the full roster is 2.4 MB. Loading it up front would put
 * megabytes of faces in front of a player who may never see half of them, on a game that
 * otherwise starts instantly. A portrait is fetched the first time its pilot is actually about to
 * be drawn, and a pilot with no portrait yet simply renders as a callsign — the card is never
 * blocked on an image.
 */

export interface Pilot {
  /** Sheet basename, e.g. `drone` → `/mascots/drone-directions.webp`. */
  readonly id: string;
  readonly callsign: string;
}

/**
 * The roster.
 *
 * Callsigns rather than names: this is a racing circuit, and a handle reads as competition where
 * a first name reads as a children's cartoon. Each is chosen to hint at how that pilot flies, so
 * a returning player builds an expectation of who is about to overtake them.
 */
const PILOTS: readonly Pilot[] = [
  { id: 'drone', callsign: 'VESPER' },
  { id: 'gearbot', callsign: 'COGWORK' },
  { id: 'clockwork', callsign: 'TICKTOCK' },
  { id: 'postbot', callsign: 'COURIER' },
  { id: 'rocket', callsign: 'FUSE' },
  { id: 'knight', callsign: 'BULWARK' },
  { id: 'tiger', callsign: 'EMBER' },
  { id: 'raccoon', callsign: 'BANDIT' },
  { id: 'owl', callsign: 'NOCTURNE' },
  { id: 'penguin', callsign: 'DRIFT' },
  { id: 'fox', callsign: 'KITSUNE' },
  { id: 'astronaut', callsign: 'ORBIT' }
];

/** Centre cell of a 3×3 directions sheet — the pilot looking straight at you. */
const PORTRAIT_CELL = 4;

type PortraitState = HTMLImageElement | 'loading' | 'failed';

export class PilotRoster {
  private readonly portraits = new Map<string, PortraitState>();

  /**
   * The pilot flying a given rival.
   *
   * Derived from seed and index rather than assigned at random, so the same world always has the
   * same grid — a player who learns that VESPER is quick is not told that by a different craft
   * every session.
   */
  public pilotFor(seed: number, rivalIndex: number): Pilot {
    // A cheap mix so adjacent rivals in the same world do not draw adjacent roster entries.
    const mixed = Math.abs(Math.imul(seed ^ (rivalIndex + 1), 0x9e3779b9)) % PILOTS.length;
    return PILOTS[mixed];
  }

  /**
   * The portrait for a pilot, starting the fetch if this is the first request.
   *
   * @returns the image once decoded, or null while loading or after a failure — callers draw the
   *          callsign either way rather than waiting.
   */
  public portrait(pilot: Pilot): HTMLImageElement | null {
    const existing = this.portraits.get(pilot.id);
    if (existing instanceof HTMLImageElement) return existing;
    if (existing === 'loading' || existing === 'failed') return null;

    this.portraits.set(pilot.id, 'loading');
    const image = new Image();
    image.onload = () => this.portraits.set(pilot.id, image);
    // Marked failed rather than deleted, so a missing file is not re-requested every frame.
    image.onerror = () => this.portraits.set(pilot.id, 'failed');
    image.src = `/mascots/${pilot.id}-directions.webp`;
    return null;
  }

  /** Draws the pilot's face into a square. Silently does nothing until the portrait exists. */
  public drawPortrait(
    ctx: CanvasRenderingContext2D,
    pilot: Pilot,
    x: number,
    y: number,
    size: number
  ): void {
    const sheet = this.portrait(pilot);
    if (!sheet) return;

    const cellW = sheet.naturalWidth / 3;
    const cellH = sheet.naturalHeight / 3;
    const col = PORTRAIT_CELL % 3;
    const row = Math.floor(PORTRAIT_CELL / 3);
    ctx.drawImage(sheet, col * cellW, row * cellH, cellW, cellH, x, y, size, size);
  }
}

export { PILOTS };
