import { describe, it, expect } from 'vitest';
import { computeNextDelayMinutes } from '../../src/scheduler/scheduler.js';

const cfg = { baseIntervalMinutes: 180, goldenHourWindowMinutes: 120, goldenHourIntervalMinutes: 25 };

describe('computeNextDelayMinutes', () => {
  it('fresh post inside the golden hour -> short interval', () => {
    expect(computeNextDelayMinutes([30, 5000], cfg)).toBe(25);
  });
  it('no fresh post -> base interval', () => {
    expect(computeNextDelayMinutes([500, 5000], cfg)).toBe(180);
  });
  it('no posts -> base interval', () => {
    expect(computeNextDelayMinutes([], cfg)).toBe(180);
  });
  it('a post exactly on the window edge still counts as fresh', () => {
    expect(computeNextDelayMinutes([120], cfg)).toBe(25);
  });
});
