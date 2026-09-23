/**
 * Rush's soundtrack, as data.
 *
 * A bright four-chord loop (I–V–vi–IV in C major: the progression of a hundred cartoon themes)
 * written as a step sequencer. The music has **levels** that stack rather than switch:
 *
 *   - `title`: pad chords and a gentle arpeggio — the game breathing while it waits.
 *   - `run`:   adds drums and a syncopated bass line — you are racing.
 *   - `nitro`: adds a lead hook and double-time hats — you are *flying*.
 *
 * Stacking means a level change never changes what is already playing, so moving between them
 * sounds like the band leaning in, not like the track cutting to a different song.
 *
 * Pure: a step index and level in, notes out. `RushAudio` turns them into sound.
 */

export type MusicLevel = 'title' | 'run' | 'nitro';
export type Voice = 'kick' | 'snare' | 'hat' | 'bass' | 'arp' | 'pad' | 'lead';

export interface MusicEvent {
  voice: Voice;
  /** MIDI note number; ignored by drums. */
  midi: number;
  /** 0–1 before the voice's own mix level. */
  gain: number;
  /** Duration in sixteenth-note steps. */
  length: number;
}

export const STEPS_PER_BAR = 16;
const BARS = 4;

/** Chord tones per bar, as MIDI notes around middle C. C, G, Am, F. */
const CHORDS: readonly (readonly number[])[] = [
  [60, 64, 67],
  [59, 62, 67],
  [57, 60, 64],
  [57, 60, 65]
];
/** Bass roots per bar, two octaves down. */
const ROOTS = [36, 31, 33, 29];

/** The hook: one note per eighth over two bars (-1 is a rest), played over the whole loop. */
const HOOK = [
  72, -1, 76, 79, -1, 76, 74, 72,
  71, -1, 74, 79, -1, 74, 72, 71,
  69, -1, 72, 76, -1, 72, 74, 76,
  77, -1, 76, 74, -1, 72, 71, -1
];

/** Arpeggio order through the three chord tones plus the octave. */
const ARP_ORDER = [0, 1, 2, 3, 2, 1, 0, 1];

/** Bass rhythm within a bar: step → offset from the root in semitones. */
const BASS: Readonly<Record<number, number>> = { 0: 0, 3: 12, 6: 7, 8: 0, 10: 12, 13: 7, 14: 12 };

export const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);

const LEVEL_RANK: Record<MusicLevel, number> = { title: 0, run: 1, nitro: 2 };

/**
 * Tempo for the current speed. Faster car, faster band — gently, so the groove survives.
 * @param speedT 0 at start speed, 1 at top speed.
 */
export function bpmFor(speedT: number): number {
  const t = speedT < 0 ? 0 : speedT > 1 ? 1 : speedT;
  return 118 + t * 26;
}

/** Seconds per sixteenth note at a tempo. */
export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4;
}

/**
 * Writes the notes that start on global step `step` into `out` and returns how many.
 * `out` is reused by the caller so the scheduler never allocates.
 */
export function musicEvents(step: number, level: MusicLevel, out: MusicEvent[]): number {
  const rank = LEVEL_RANK[level];
  const inBar = ((step % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR;
  const bar = Math.floor(step / STEPS_PER_BAR) % BARS;
  const chord = CHORDS[(bar + BARS) % BARS];
  let n = 0;
  const push = (voice: Voice, midi: number, gain: number, length: number) => {
    const e = out[n] ?? (out[n] = { voice, midi, gain, length });
    e.voice = voice;
    e.midi = midi;
    e.gain = gain;
    e.length = length;
    n++;
  };

  // Pad: the whole chord, held for the bar.
  if (inBar === 0) for (const note of chord) push('pad', note, 0.6, STEPS_PER_BAR);

  // Arpeggio: eighths on the title, sixteenths once racing.
  const arpEvery = rank >= 1 ? 1 : 2;
  if (inBar % arpEvery === 0) {
    const index = ARP_ORDER[(inBar / arpEvery) % ARP_ORDER.length];
    const note = index === 3 ? chord[0] + 12 : chord[index] + 12;
    // Accent the downbeats so the line has a pulse rather than a drone.
    push('arp', note, inBar % 4 === 0 ? 0.9 : 0.6, 1);
  }

  if (rank >= 1) {
    if (inBar % 4 === 0) push('kick', 0, 1, 1);
    if (inBar === 4 || inBar === 12) push('snare', 0, 1, 1);
    // A ghost snare before the loop turns over, as a fill.
    if (bar === BARS - 1 && inBar === 15) push('snare', 0, 0.5, 1);
    if (inBar % 2 === 1 || (rank >= 2 && inBar % 2 === 0)) push('hat', 0, inBar % 4 === 2 ? 0.9 : 0.55, 1);
    const offset = BASS[inBar];
    if (offset !== undefined) push('bass', ROOTS[bar] + offset, inBar === 0 ? 1 : 0.8, 2);
  }

  if (rank >= 2 && inBar % 2 === 0) {
    const hookIndex = (Math.floor(step / 2)) % HOOK.length;
    const note = HOOK[hookIndex];
    if (note >= 0) push('lead', note, 0.9, 2);
  }

  return n;
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
