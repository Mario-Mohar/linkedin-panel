import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright';
import { resolveLabels } from '../../src/cli/li-lang.js';
import { labelsForDetected, BUILTIN_LABELS } from '../../src/parser/summary-labels.js';
import { detectInterfaceLang } from '../../src/browser/session.js';
import { createTranslator } from '../../src/i18n/index.js';

const i18n = createTranslator('en');
const silent = () => {};

/** Fake page that only answers the one evaluate() the detection uses. */
const pageWithLang = (lang: string | null) => ({
  evaluate: async () => (lang === null ? '' : lang),
} as unknown as Page);

describe('detectInterfaceLang', () => {
  it('reads the two-letter code off the root element', async () => {
    expect(await detectInterfaceLang(pageWithLang('de'))).toBe('de');
    expect(await detectInterfaceLang(pageWithLang('en-US'))).toBe('en');
  });

  it('returns null instead of guessing when the page says nothing', async () => {
    expect(await detectInterfaceLang(pageWithLang(null))).toBeNull();
    expect(await detectInterfaceLang(pageWithLang('   '))).toBeNull();
  });

  it('returns null when evaluate throws rather than taking the process down', async () => {
    const broken = { evaluate: async () => { throw new Error('detached'); } } as unknown as Page;
    expect(await detectInterfaceLang(broken)).toBeNull();
  });
});

describe('labelsForDetected', () => {
  it('maps known codes to their label set', () => {
    expect(labelsForDetected('de').lang).toBe('de');
    expect(labelsForDetected('en').lang).toBe('en');
  });

  it('falls back to English instead of throwing', () => {
    // Right after cloning, a crash over an unsupported interface language would
    // be the worst outcome — a plausible set the user can override is better.
    expect(labelsForDetected('fr').lang).toBe('en');
    expect(labelsForDetected(null).lang).toBe('en');
  });
});

describe('resolveLabels', () => {
  it('detects the language when liLang is auto', async () => {
    const labels = await resolveLabels({
      page: pageWithLang('de'), liLang: 'auto', i18n, cmd: 'collect', log: silent,
    });
    expect(labels.lang).toBe('de');
  });

  it('lets an explicit setting win over detection', async () => {
    // The page says German, the user says English. The user wins.
    const labels = await resolveLabels({
      page: pageWithLang('de'), liLang: 'en', i18n, cmd: 'collect', log: silent,
    });
    expect(labels.lang).toBe('en');
  });

  it('falls back to English when nothing can be detected', async () => {
    const labels = await resolveLabels({
      page: pageWithLang(null), liLang: 'auto', i18n, cmd: 'collect', log: silent,
    });
    expect(labels.lang).toBe('en');
  });

  it('says which language it settled on', async () => {
    const lines: string[] = [];
    await resolveLabels({
      page: pageWithLang('de'), liLang: 'auto', i18n, cmd: 'collect', log: (m) => lines.push(m),
    });
    expect(lines.join(' ')).toMatch(/de/);
  });
});

describe('activity page terms', () => {
  it('exists for every built-in language', () => {
    // These feed the aria-label lookups in the feed collector. A missing term
    // does not throw, it silently yields 0 comments — so guard it here.
    for (const labels of Object.values(BUILTIN_LABELS)) {
      expect(labels.activity.commentsAria.length).toBeGreaterThan(0);
      expect(labels.activity.repostsAria.length).toBeGreaterThan(0);
      expect(labels.activity.followersWord.length).toBeGreaterThan(0);
      expect(labels.activity.connectionsWord.length).toBeGreaterThan(0);
    }
  });

  it('differs between German and English where the words differ', () => {
    expect(BUILTIN_LABELS.de.activity.connectionsWord).not.toBe(BUILTIN_LABELS.en.activity.connectionsWord);
    expect(BUILTIN_LABELS.de.activity.commentsAria).not.toBe(BUILTIN_LABELS.en.activity.commentsAria);
  });
});
