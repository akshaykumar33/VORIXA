import { describe, it, expect } from 'vitest';
import { FaceGestureMapper, type ExpressionScores } from '../src/input/FaceGestures';

const DT = 1 / 30;
const neutral: ExpressionScores = { jawOpen: 0.02, browInnerUp: 0.05, mouthSmileLeft: 0.05, mouthSmileRight: 0.05, eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 };

function feed(m: FaceGestureMapper, face: Partial<ExpressionScores>, seconds: number): string[] {
  const events: string[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const c = m.update({ ...neutral, ...face }, DT);
    if (c.jumpStarted) events.push('jump');
    if (c.itemStarted) events.push('item');
  }
  return events;
}

describe('face gestures', () => {
  it('a resting face does nothing', () => {
    const m = new FaceGestureMapper();
    expect(feed(m, {}, 3)).toEqual([]);
    expect(m.commands.firing).toBe(false);
    expect(m.commands.nitro).toBe(false);
  });

  it('raised brows jump once per raise', () => {
    const m = new FaceGestureMapper();
    feed(m, {}, 1);
    expect(feed(m, { browInnerUp: 0.6 }, 0.5)).toEqual(['jump']);
    feed(m, {}, 0.3);
    expect(feed(m, { browInnerUp: 0.6 }, 0.5)).toEqual(['jump']);
  });

  it('an open mouth fires for as long as it is open', () => {
    const m = new FaceGestureMapper();
    feed(m, {}, 1);
    feed(m, { jawOpen: 0.55 }, 0.3);
    expect(m.commands.firing).toBe(true);
    feed(m, { jawOpen: 0.55 }, 2);
    expect(m.commands.firing).toBe(true);
    feed(m, {}, 0.2);
    expect(m.commands.firing).toBe(false);
  });

  it('a wide smile is nitro', () => {
    const m = new FaceGestureMapper();
    feed(m, {}, 1);
    feed(m, { mouthSmileLeft: 0.7, mouthSmileRight: 0.7 }, 0.3);
    expect(m.commands.nitro).toBe(true);
  });

  it('a wink uses the item; a blink of both eyes does not', () => {
    const m = new FaceGestureMapper();
    feed(m, {}, 1);
    expect(feed(m, { eyeBlinkLeft: 0.8, eyeBlinkRight: 0.1 }, 0.4)).toEqual(['item']);
    feed(m, {}, 0.3);
    expect(feed(m, { eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9, browInnerUp: 0.6 }, 0.4)).toEqual([]);
  });

  it('a face that rests with brows up is not stuck jumping', () => {
    const m = new FaceGestureMapper();
    // This player's neutral face has raised brows; only a further raise should count.
    expect(feed(m, { browInnerUp: 0.3 }, 6)).toEqual([]);
    expect(feed(m, { browInnerUp: 0.75 }, 0.4)).toEqual(['jump']);
  });

  it('losing the face drops held commands', () => {
    const m = new FaceGestureMapper();
    feed(m, {}, 1);
    feed(m, { jawOpen: 0.6, mouthSmileLeft: 0.8, mouthSmileRight: 0.8 }, 0.3);
    m.update(null, DT);
    expect(m.commands.firing).toBe(false);
    expect(m.commands.nitro).toBe(false);
  });
});
