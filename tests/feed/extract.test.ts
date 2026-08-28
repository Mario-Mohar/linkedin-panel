import { describe, it, expect } from 'vitest';
import { djb2, pickShortest, pickAuthor, socialProofPerson, pickFirst } from '../../src/feed/extract.js';

describe('djb2', () => {
  it('deterministic, different for different inputs', () => {
    expect(djb2('abc')).toBe(djb2('abc'));
    expect(djb2('abc')).not.toBe(djb2('abd'));
    expect(typeof djb2('x')).toBe('string');
  });
});

describe('pickShortest', () => {
  it('takes the shortest non-empty candidate', () => {
    expect(pickShortest(['95321995 Reaktionen', '95 Reaktionen'])).toBe('95 Reaktionen');
  });
  it('trims and ignores empty strings', () => {
    expect(pickShortest(['', '  4 Std. •  '])).toBe('4 Std. •');
  });
  it('empty array -> empty string', () => {
    expect(pickShortest([])).toBe('');
  });
});

describe('pickAuthor', () => {
  it('prefers the name from the hide label', () => {
    expect(pickAuthor('Ilan Asseo', 'Ilan A.')).toBe('Ilan Asseo');
  });
  it('falls back to the profile name', () => {
    expect(pickAuthor('', 'Ruben Hassid')).toBe('Ruben Hassid');
  });
  it('both empty -> empty string', () => {
    expect(pickAuthor('', '')).toBe('');
  });
});

describe('pickFirst', () => {
  it('takes the first non-empty candidate (document order)', () => {
    expect(pickFirst(['11 Std.', '5 Min.'])).toBe('11 Std.');
  });
  it('skips empty strings; empty -> ""', () => {
    expect(pickFirst(['', ' 4 Std. '])).toBe('4 Std.');
    expect(pickFirst([])).toBe('');
  });
});

describe('socialProofPerson', () => {
  it('detects interactions from the network', () => {
    expect(socialProofPerson('Bernd Buchegger hat kommentiert')).toBe(true);
    expect(socialProofPerson('Susanne Kißlinger gefällt das.')).toBe(true);
    expect(socialProofPerson('Brilliant Ads hat repostet')).toBe(true);
  });
  it('empty / no proof -> false', () => {
    expect(socialProofPerson('')).toBe(false);
    expect(socialProofPerson('BREAKING: Claude Code')).toBe(false);
  });
});
