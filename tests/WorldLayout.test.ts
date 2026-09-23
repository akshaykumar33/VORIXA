import { describe, it, expect } from 'vitest';
import { GROUND_Y } from '../src/rendering/Atmosphere';
import { buildCourse } from '../src/game/Course';
import { CourseStream } from '../src/world/CourseStream';

/**
 * The paddock floor sits below the course so props and spectators have something to stand on.
 * Put it one metre too high and a falling player passes *through* visible ground before the run
 * registers the fall — which reads as a collision bug, not as depth.
 *
 * That relationship lives across three files (Atmosphere, Course, CourseStream) and nothing else
 * ties them together, so it is pinned here.
 */

describe('paddock floor', () => {
  it('sits below the authored course kill height', () => {
    expect(GROUND_Y).toBeLessThan(buildCourse().killY);
  });

  it('sits below the endless course kill height', () => {
    expect(GROUND_Y).toBeLessThan(new CourseStream(1).killY);
  });

  it('sits below every authored platform', () => {
    for (const box of buildCourse().boxes) expect(box.minY).toBeGreaterThan(GROUND_Y);
  });

  it('sits below every generated platform', () => {
    const stream = new CourseStream(7, { ahead: 12 });
    stream.update(0);
    for (const box of stream.boxes) expect(box.minY).toBeGreaterThan(GROUND_Y);
  });
});
