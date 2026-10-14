import { describe, it, expect } from 'vitest';
import { formatNumber, formatPct } from '../../src/web/format.js';

// Intl puts a no-break space before the German percent sign.
const plain = (s: string) => s.replace(/ /g, ' ');

describe('dashboard number formats', () => {
  it('German: decimal comma for percentages, dot for grouping', () => {
    expect(plain(formatPct('de-DE', 2.118))).toBe('2,1 %');
    expect(formatNumber('de-DE', 1058)).toBe('1.058');
  });
  it('English: decimal point for percentages, comma for grouping', () => {
    expect(formatPct('en-US', 2.118)).toBe('2.1%');
    expect(formatNumber('en-US', 1058)).toBe('1,058');
  });
  it('rounds whole percentages when asked for no decimals', () => {
    expect(formatPct('en-US', 59.6, 0)).toBe('60%');
  });
});
