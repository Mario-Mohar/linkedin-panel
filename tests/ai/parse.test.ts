import { describe, it, expect } from 'vitest';
import { parseRelevance, parseDrafts, hasRelevanceArray } from '../../src/ai/parse.js';

describe('parseRelevance', () => {
  it('parses a JSON array of scores', () => {
    expect(parseRelevance('[7, 3, 10]', 3)).toEqual([7, 3, 10]);
  });
  it('tolerates code fences and surrounding text', () => {
    expect(parseRelevance('Hier:\n```json\n[5, 8]\n```', 2)).toEqual([5, 8]);
  });
  it('broken/missing -> zeroes of the right length, clamped to 0..10', () => {
    expect(parseRelevance('kein json', 2)).toEqual([0, 0]);
    expect(parseRelevance('[99, -5]', 2)).toEqual([10, 0]);
    expect(parseRelevance('[7]', 3)).toEqual([7, 0, 0]);
  });
  it('non-string / negative count -> zeroes, does not throw', () => {
    expect(parseRelevance(null as any, 2)).toEqual([0, 0]);
    expect(parseRelevance(undefined as any, 2)).toEqual([0, 0]);
    expect(parseRelevance('[1,2]', -1 as any)).toEqual([]);
  });
});

describe('hasRelevanceArray', () => {
  it('detects whether the output contains a JSON array', () => {
    expect(hasRelevanceArray('kein array')).toBe(false);
    expect(hasRelevanceArray('… [1,2] …')).toBe(true);
    expect(hasRelevanceArray(null as any)).toBe(false);
  });
});

describe('parseDrafts', () => {
  it('splits numbered drafts', () => {
    const out = parseDrafts('1. Erster Entwurf.\n2. Zweiter Entwurf.');
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('Erster');
  });
  it('a single paragraph -> one draft; empty -> []', () => {
    expect(parseDrafts('Nur ein Kommentar.')).toEqual(['Nur ein Kommentar.']);
    expect(parseDrafts('   ')).toEqual([]);
  });
  it('non-string -> [], does not throw', () => {
    expect(parseDrafts(null as any)).toEqual([]);
    expect(parseDrafts(undefined as any)).toEqual([]);
  });
});
