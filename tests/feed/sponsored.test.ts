import { describe, it, expect } from 'vitest';
import { detectSponsored } from '../../src/feed/collector.js';

describe('detectSponsored', () => {
  it('detects genuine ads from the header text ("Befördert"/"Anzeige")', () => {
    expect(detectSponsored('Acme GmbH Befördert · 1 Std.', [])).toBe(true);
    expect(detectSponsored('Acme GmbH Anzeige', [])).toBe(true);
    expect(detectSponsored('Acme Promoted', [])).toBe(true);
    expect(detectSponsored('Acme Gesponsert', [])).toBe(true);
  });

  it('does NOT mark organic posts as ads (no substring false positive)', () => {
    // Regression guard: the verb "anzeigen" contains "Anzeige" as a substring —
    // without word boundaries every post carrying "Profil von X anzeigen" would
    // count as an ad and filterFeed would drop the entire feed (0 posts).
    const arias = ['Profil von Ruben Hassid anzeigen', 'Kommentieren', 'Beitrag von X ausblenden'];
    expect(detectSponsored('Ruben Hassid · 2. · 3 Std.', arias)).toBe(false);
    expect(detectSponsored('Kommentare anzeigen', [])).toBe(false);
  });

  it('detects ad markers in aria-labels too', () => {
    expect(detectSponsored('Acme', ['Befördert'])).toBe(true);
  });
});
