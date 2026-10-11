import { describe, it, expect } from 'vitest';
import { medalFor } from '../src/ui/RushHUD';

describe('medals', () => {
  it('are earned by worlds reached, with a next goal at every tier', () => {
    expect(medalFor(1)).toBe('none');
    expect(medalFor(2)).toBe('bronze');
    expect(medalFor(3)).toBe('bronze');
    expect(medalFor(4)).toBe('silver');
    expect(medalFor(6)).toBe('silver');
    expect(medalFor(7)).toBe('gold');
    expect(medalFor(20)).toBe('gold');
  });
});
