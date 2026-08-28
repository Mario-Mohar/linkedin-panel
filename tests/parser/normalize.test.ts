import { describe, it, expect } from 'vitest';
import { parseCount, parseRelativeTime, detectFormat } from '../../src/parser/normalize.js';

describe('parseCount', () => {
  it('plain integers with thousands separators', () => {
    expect(parseCount('1234')).toBe(1234);
    expect(parseCount('1,234')).toBe(1234);
    expect(parseCount('1.234')).toBe(1234);
  });
  it('English abbreviations', () => {
    expect(parseCount('1.2K')).toBe(1200);
    expect(parseCount('3M')).toBe(3000000);
  });
  it('English abbreviations followed by text', () => {
    expect(parseCount('3M Reactions')).toBe(3000000);
    expect(parseCount('1.2K reactions')).toBe(1200);
  });
  it('German abbreviations', () => {
    expect(parseCount('1,2 Tsd.')).toBe(1200);
    expect(parseCount('3 Mio.')).toBe(3000000);
  });
  it('German abbreviations followed by text', () => {
    expect(parseCount('1,2 Tsd. Reaktionen')).toBe(1200);
  });
  it('empty/unreadable -> null', () => {
    expect(parseCount('')).toBeNull();
    expect(parseCount(null)).toBeNull();
    expect(parseCount('keine')).toBeNull();
  });
});

describe('parseRelativeTime', () => {
  const now = new Date('2026-07-18T12:00:00.000Z');
  it('minutes/hours/days/weeks (de + en)', () => {
    expect(parseRelativeTime('30 Min.', now)).toBe('2026-07-18T11:30:00.000Z');
    expect(parseRelativeTime('2 Std.', now)).toBe('2026-07-18T10:00:00.000Z');
    expect(parseRelativeTime('3 Tage', now)).toBe('2026-07-15T12:00:00.000Z');
    expect(parseRelativeTime('1 Woche', now)).toBe('2026-07-11T12:00:00.000Z');
    expect(parseRelativeTime('2h', now)).toBe('2026-07-18T10:00:00.000Z');
  });
  it('unreadable -> now', () => {
    expect(parseRelativeTime('gerade eben', now)).toBe(now.toISOString());
  });
});

describe('detectFormat', () => {
  const base = { hasImage: false, hasVideo: false, hasDocument: false, hasPoll: false, isArticle: false };
  it('prioritises video > document > poll > article > image > text', () => {
    expect(detectFormat({ ...base, hasVideo: true, hasImage: true })).toBe('video');
    expect(detectFormat({ ...base, hasDocument: true })).toBe('dokument');
    expect(detectFormat({ ...base, hasPoll: true })).toBe('umfrage');
    expect(detectFormat({ ...base, isArticle: true })).toBe('artikel');
    expect(detectFormat({ ...base, hasImage: true })).toBe('bild');
    expect(detectFormat(base)).toBe('text');
  });
  it('prioritises correctly when several flags are set at once', () => {
    expect(detectFormat({ ...base, hasDocument: true, hasPoll: true })).toBe('dokument');
    expect(detectFormat({ ...base, hasPoll: true, isArticle: true })).toBe('umfrage');
    expect(detectFormat({ ...base, isArticle: true, hasImage: true })).toBe('artikel');
  });
});
