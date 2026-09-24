/**
 * Cantor on the radio (ADR-0014, Far Cry layer): the Choir's boss cuts into the hero's frequency
 * and talks, about what the hero just did. Pure and deterministic, so what he says and when is
 * testable without a page.
 *
 * The game reports what happens (`cue`); the radio decides whether Cantor says something about
 * it. He does not talk over himself, does not repeat a line until he has used every other line
 * for the same moment, and does not comment on the same kind of thing twice in quick succession.
 * Some moments matter more than others (losing an outpost, the hero going down, the boss fight):
 * those cut in even when he spoke a moment ago.
 */

export type RadioCue =
  | 'hello'
  | 'approach'
  | 'spotted'
  | 'alarm'
  | 'alarmDown'
  | 'liberated'
  | 'chain'
  | 'heroDown'
  | 'heat'
  | 'quiet'
  | 'glider'
  | 'bossArrive'
  | 'bossDown'
  | 'wave'
  | 'idle';

/** Lines per moment. `{outpost}` and `{crew}` are filled in. */
export const LINES: Record<RadioCue, readonly string[]> = {
  hello: [
    "This is Cantor. You're on my frequency now. Everything in this city is.",
    'Good evening, {crew}. Yes, I know your name. I know everyone’s name. It’s my job.'
  ],
  approach: [
    '{outpost} is mine. Walk away, and I’ll let you keep walking.',
    'Those are my people at {outpost}. Good people. Armed people.',
    'Careful. {outpost} has been singing my song for years.'
  ],
  spotted: [
    'There you are. My choir has eyes, little mouse, and now it has a voice.',
    '{outpost} sees you. Sing for them, would you?',
    'Hear that? That’s my people remembering your face.'
  ],
  alarm: [
    'Ring the bells. Everyone come and see the thief.',
    'The alarm is a hymn, and the whole city knows the words.',
    'Backup is on its way. I do so love a crowd.'
  ],
  alarmDown: [
    'You shot the bell. Crude. Effective. But crude.',
    'Silence the alarm, and you think the song stops?'
  ],
  liberated: [
    '{outpost}. You took {outpost}. I built that with my own hands. Other people’s hands, but mine.',
    'Fly your little flag. Flags burn.',
    'Fine. Keep {outpost}. I’ll take it back, with interest.'
  ],
  chain: [
    'Fire. You brought fire into my city. Do you know what fire costs?',
    'Every barrel you light, I bill you for.',
    'That’s not a plan, {crew}. That’s a tantrum with fuel.'
  ],
  heroDown: [
    'Stay down. It’s warmer there.',
    'Ah. The quiet after the last note.',
    'Get up, {crew}. I’m not finished with you.'
  ],
  heat: [
    'Even the police want you now. You’re making friends everywhere.',
    'Sirens. The city’s singing along with me tonight.'
  ],
  quiet: [
    'My guards keep falling asleep. Permanently. That’s you, isn’t it?',
    'No shots? You’re either very good or very lonely.'
  ],
  glider: [
    'Look at you up there. Birds get shot too.',
    'Enjoy the view, {crew}. All of it is mine.'
  ],
  bossArrive: [
    'So you came. Good. I hate singing to an empty hall.'
  ],
  bossDown: [
    '…Encore.'
  ],
  wave: [
    'Another verse. They’ll keep coming. I have so many voices.',
    'You hold one corner, I take two. That’s the arithmetic of a choir.'
  ],
  idle: [
    'Every door in this district opens with my key. Remember that when you sleep.',
    'I sang in a church once. Now the church sings for me.',
    'Your crew. How many of them are loyal? Ask them. Then ask them again.',
    'The Choir was here before the streetlights. We’ll be here after.'
  ]
};

/** Moments that cut in even when Cantor has just spoken. */
const URGENT: ReadonlySet<RadioCue> = new Set(['liberated', 'heroDown', 'bossArrive', 'bossDown']);
/** Seconds of quiet after any line before the next ordinary one. */
export const GAP = 10;
/** Seconds before the same kind of moment is remarked on again. */
export const SAME_CUE_GAP = 40;
/** Seconds of nothing happening before Cantor fills the silence. */
export const IDLE_AFTER = 150;
/** Reading time: a floor plus a pace per character, so subtitles stay up long enough to read. */
export function lineSeconds(text: string): number {
  return Math.max(2.8, 1.2 + text.length * 0.055);
}

export interface RadioLine {
  cue: RadioCue;
  text: string;
  seconds: number;
}

export class Radio {
  /** What Cantor is saying now (null when the radio is quiet). */
  public current: RadioLine | null = null;
  private left = 0;
  private sinceLine = 999;
  private sinceActivity = 0;
  private readonly lastCue = new Map<RadioCue, number>();
  private readonly used = new Map<RadioCue, number[]>();
  private clock = 0;
  private seed: number;

  public constructor(seed = 0xc0ffee) {
    this.seed = seed >>> 0 || 1;
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** The next unused line for a moment, cycling through all of them before any repeats. */
  private pick(cue: RadioCue): string {
    const lines = LINES[cue];
    let used = this.used.get(cue) ?? [];
    if (used.length >= lines.length) used = [];
    const open = lines.map((_, i) => i).filter((i) => !used.includes(i));
    const i = open[Math.floor(this.random() * open.length)];
    used.push(i);
    this.used.set(cue, used);
    return lines[i];
  }

  /**
   * Something happened. Returns the line Cantor starts saying about it, or null when he lets it
   * pass (he spoke a moment ago, or already remarked on this kind of thing).
   */
  public cue(cue: RadioCue, fill: { outpost?: string; crew?: string } = {}): RadioLine | null {
    if (cue !== 'idle') this.sinceActivity = 0;
    const urgent = URGENT.has(cue);
    if (!urgent) {
      if (this.current || this.sinceLine < GAP) return null;
      const last = this.lastCue.get(cue);
      if (last !== undefined && this.clock - last < SAME_CUE_GAP) return null;
    }
    const text = this.pick(cue)
      .split('{outpost}').join(fill.outpost ?? 'that corner')
      .split('{crew}').join(fill.crew ?? 'friend');
    const line: RadioLine = { cue, text, seconds: lineSeconds(text) };
    this.current = line;
    this.left = line.seconds;
    this.sinceLine = 0;
    this.lastCue.set(cue, this.clock);
    return line;
  }

  /** Advances the radio; returns a line Cantor starts on his own (filling a long silence), or null. */
  public step(dt: number, fill: { crew?: string } = {}): RadioLine | null {
    this.clock += dt;
    this.sinceActivity += dt;
    if (this.current) {
      this.left -= dt;
      if (this.left <= 0) {
        this.current = null;
        this.sinceLine = 0;
      }
    } else this.sinceLine += dt;
    if (!this.current && this.sinceActivity > IDLE_AFTER) {
      this.sinceActivity = 0;
      return this.cue('idle', fill);
    }
    return null;
  }
}
