import { describe, it, expect } from 'vitest';
import { postedAtFromUrn } from '../../src/parser/urn.js';

describe('postedAtFromUrn', () => {
  it('decodes the timestamp from an activity URN', () => {
    // 7483045229638574082 >> 22 = 1784046... ms -> 2026-07-15T06:30:xx UTC
    const iso = postedAtFromUrn('urn:li:activity:7483045229638574082');
    expect(iso).not.toBeNull();
    expect(iso!.slice(0, 10)).toBe('2026-07-15');
  });
  it('accepts the bare id as well', () => {
    expect(postedAtFromUrn('7483045229638574082')!.slice(0, 4)).toBe('2026');
  });
  it('null for a missing/invalid id', () => {
    expect(postedAtFromUrn('')).toBeNull();
    expect(postedAtFromUrn('urn:li:activity:abc')).toBeNull();
  });
});
