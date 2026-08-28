import { describe, it, expect } from 'vitest';
import { parseSummary, completeness, isComplete, missingFields, KEY_FIELDS } from '../../src/parser/summary-parser.js';
import { BUILTIN_LABELS, loadLabels } from '../../src/parser/summary-labels.js';

const de = BUILTIN_LABELS.de;
const en = BUILTIN_LABELS.en;

/**
 * A rebuild of the visible text of a German post analytics page. Number and
 * label sit on separate lines, big tiles name the number first, breakdowns name
 * it last — exactly like the real page.
 */
const DE_PAGE = `
Beitragsanalysen
1.234
Impressions
987
Erreichte Mitglieder
Im Netzwerk der Zielgruppe
62,5 %
Außerhalb des Netzwerks
37,5 %
Engagement
78
Soziale Interaktionen
Reaktionen
52
Kommentare
21
Reposts
5
Gespeicherte Beiträge
7
Auf LinkedIn gesendet
3
Profilaktivitäten
41
Mit diesem Beitrag generierte Profilansichten
6
Mit diesem Beitrag gewonnene Follower:innen
`;

describe('parseSummary (German)', () => {
  const values = parseSummary(DE_PAGE, de);

  it('reads tile values where the number comes first', () => {
    expect(values.impressions).toBe(1234);
    expect(values.membersReached).toBe(987);
    expect(values.socialInteractions).toBe(78);
    expect(values.profileViews).toBe(41);
    expect(values.followersGained).toBe(6);
  });

  it('reads the breakdown where the number comes last', () => {
    expect(values.reactions).toBe(52);
    expect(values.comments).toBe(21);
    expect(values.reposts).toBe(5);
    expect(values.saves).toBe(7);
    expect(values.sends).toBe(3);
  });

  it('reads percentages with a German decimal comma', () => {
    expect(values.inNetworkPct).toBe(62.5);
    expect(values.outNetworkPct).toBe(37.5);
  });

  it('recognises the page as complete', () => {
    expect(completeness(values)).toBe(KEY_FIELDS.length);
    expect(isComplete(values)).toBe(true);
    expect(missingFields(values)).toEqual([]);
  });
});

describe('parseSummary on a half-built page', () => {
  // LinkedIn builds the tiles one after another. The reach tile regularly
  // arrives later than the impressions — that is what the collector polls for.
  const partial = parseSummary('1.234\nImpressions\n', de);

  it('returns what is there without inventing the rest', () => {
    expect(partial.impressions).toBe(1234);
    expect(partial.membersReached).toBeUndefined();
  });

  it('reports itself as incomplete', () => {
    expect(isComplete(partial)).toBe(false);
    expect(missingFields(partial)).toContain('membersReached');
  });

  it('is less complete than the full page', () => {
    expect(completeness(partial)).toBeLessThan(completeness(parseSummary(DE_PAGE, de)));
  });
});

describe('separators per language', () => {
  it('German: the dot separates thousands', () => {
    expect(parseSummary('12.345\nImpressions', de).impressions).toBe(12345);
  });

  it('English: the comma separates thousands, the dot is the decimal point', () => {
    const page = '12,345\nImpressions\nIn network\n62.5 %';
    const values = parseSummary(page, en);
    expect(values.impressions).toBe(12345);
    expect(values.inNetworkPct).toBe(62.5);
  });

  it('does not mix the separators up across languages', () => {
    // "1.234" is 1234 in German and 1,234 in English (so, rounded, 1)
    expect(parseSummary('1.234\nImpressions', de).impressions).toBe(1234);
    expect(parseSummary('1.234\nImpressions', en).impressions).toBe(1);
  });
});

describe('empty and broken pages', () => {
  it('returns nothing for unrelated text instead of guessing', () => {
    expect(parseSummary('Seite nicht gefunden', de)).toEqual({});
  });

  it('handles null values in completeness cleanly', () => {
    expect(completeness(null)).toBe(-1);
    expect(isComplete(null)).toBe(false);
  });
});

describe('loadLabels', () => {
  it('returns the built-in languages', () => {
    expect(loadLabels({ lang: 'de' }).lang).toBe('de');
    expect(loadLabels({ lang: 'en' }).lang).toBe('en');
  });

  it('names the known languages for an unknown one', () => {
    expect(() => loadLabels({ lang: 'fr' })).toThrow(/de, en/);
  });
});
