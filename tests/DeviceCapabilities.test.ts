import { describe, it, expect } from 'vitest';
import { DeviceCapabilities } from '../src/core/DeviceCapabilities';

describe('DeviceCapabilities', () => {
  it('should probe device capabilities and return a valid report', async () => {
    const report = await DeviceCapabilities.probe();
    expect(report).toBeDefined();
    expect(typeof report.hasWebGPU).toBe('boolean');
    expect(typeof report.hasWebGL2).toBe('boolean');
    expect(report.maxTextureDimension2D).toBeGreaterThan(0);
    expect(report.hardwareConcurrency).toBeGreaterThan(0);
    expect(['tier-1', 'tier-2', 'tier-3']).toContain(report.tier);
  });
});
