import { describe, it, expect } from 'vitest';
import {
  normalizeGaze,
  median,
  validateCalibration,
  DEFAULT_GAZE_CALIBRATION
} from '../src/rush/Calibration';

describe('gaze calibration', () => {
  it('maps the calibrated left, centre and right onto -1, 0, +1', () => {
    const cal = { left: -0.2, center: 0.05, right: 0.4 };
    expect(normalizeGaze(-0.2, cal)).toBeCloseTo(-1);
    expect(normalizeGaze(0.05, cal)).toBeCloseTo(0);
    expect(normalizeGaze(0.4, cal)).toBeCloseTo(1);
  });

  it('keeps lanes symmetric for a lopsided player', () => {
    const cal = { left: -0.1, center: 0, right: 0.3 };
    expect(normalizeGaze(-0.05, cal)).toBeCloseTo(-0.5);
    expect(normalizeGaze(0.15, cal)).toBeCloseTo(0.5);
  });

  it('never divides by a collapsed span', () => {
    expect(Number.isFinite(normalizeGaze(0.5, { left: 0, center: 0, right: 0 }))).toBe(true);
  });

  it('is more sensitive by default than the old fixed threshold', () => {
    // The old rule needed a raw gaze of 0.42 to change lane; halfway to calibrated edge is enough now.
    expect(normalizeGaze(0.2, DEFAULT_GAZE_CALIBRATION)).toBeGreaterThanOrEqual(0.5);
  });

  it('takes the median, ignoring stray glances', () => {
    expect(median([0.3, 0.31, -0.9, 0.29, 0.3])).toBeCloseTo(0.3);
    expect(median([])).toBe(0);
  });

  it('rejects calibrations where the eyes did not move, or moved the wrong way', () => {
    expect(validateCalibration({ left: -0.01, center: 0, right: 0.01 })).not.toBeNull();
    expect(validateCalibration({ left: 0.3, center: 0, right: -0.3 })).not.toBeNull();
    expect(validateCalibration({ left: -0.25, center: 0, right: 0.28 })).toBeNull();
  });
});
