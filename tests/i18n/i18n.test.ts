import { describe, it, expect } from 'vitest';
import { loadMessages, resolveUiLang, translate, weekdayLabels, createTranslator, SUPPORTED_LANGS } from '../../src/i18n/index.js';

describe('resolveUiLang', () => {
  it('takes LIP_LANG when it names a supported language', () => {
    expect(resolveUiLang({ LIP_LANG: 'de' })).toBe('de');
    expect(resolveUiLang({ LIP_LANG: 'EN' })).toBe('en');
  });

  it('falls back to the system locale', () => {
    expect(resolveUiLang({ LANG: 'de_AT.UTF-8' })).toBe('de');
    expect(resolveUiLang({ LC_ALL: 'en_GB.UTF-8' })).toBe('en');
  });

  it('prefers the explicit setting over the system locale', () => {
    // Someone can run LinkedIn and their desktop in German and still want the
    // panel in English.
    expect(resolveUiLang({ LIP_LANG: 'en', LANG: 'de_AT.UTF-8' })).toBe('en');
  });

  it('ends up at English for anything unknown', () => {
    expect(resolveUiLang({})).toBe('en');
    expect(resolveUiLang({ LIP_LANG: 'fr' })).toBe('en');
    expect(resolveUiLang({ LANG: 'ja_JP.UTF-8' })).toBe('en');
  });
});

describe('message catalogues', () => {
  it('has the same keys in every language', () => {
    // A key that exists in only one language shows up as a raw key in the
    // interface. Cheaper to catch here than in a screenshot.
    const [first, ...rest] = SUPPORTED_LANGS.map((lang) => ({ lang, keys: Object.keys(loadMessages(lang)).sort() }));
    for (const other of rest) {
      const missing = first.keys.filter((k) => !other.keys.includes(k));
      const extra = other.keys.filter((k) => !first.keys.includes(k));
      expect({ lang: other.lang, missing, extra }).toEqual({ lang: other.lang, missing: [], extra: [] });
    }
  });

  it('uses the same placeholders in every language', () => {
    // A renamed placeholder silently renders as literal {text} for that
    // language only.
    const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    const en = loadMessages('en');
    const de = loadMessages('de');
    for (const key of Object.keys(en)) {
      expect({ key, vars: placeholders(de[key]) }).toEqual({ key, vars: placeholders(en[key]) });
    }
  });

  it('names a locale for number and date formatting', () => {
    expect(loadMessages('de')['meta.locale']).toBe('de-DE');
    expect(loadMessages('en')['meta.locale']).toBe('en-US');
  });
});

describe('translate', () => {
  const messages = { greeting: 'Hello {name}, you have {count} messages' };

  it('fills placeholders', () => {
    expect(translate(messages, 'greeting', { name: 'Mario', count: 3 }))
      .toBe('Hello Mario, you have 3 messages');
  });

  it('leaves unknown placeholders visible instead of blanking them', () => {
    expect(translate(messages, 'greeting', { name: 'Mario' }))
      .toBe('Hello Mario, you have {count} messages');
  });

  it('returns the key for an unknown message', () => {
    // A visible key points at the gap; an empty string looks like a bug.
    expect(translate(messages, 'does.not.exist')).toBe('does.not.exist');
  });
});

describe('weekdayLabels', () => {
  it('starts on Monday in both languages', () => {
    expect(weekdayLabels(loadMessages('de'))[0]).toBe('Mo');
    expect(weekdayLabels(loadMessages('en'))[0]).toBe('Mon');
    expect(weekdayLabels(loadMessages('en'))).toHaveLength(7);
  });
});

describe('createTranslator', () => {
  it('bundles language, locale and lookup', () => {
    const de = createTranslator('de');
    expect(de.lang).toBe('de');
    expect(de.locale).toBe('de-DE');
    expect(de.t('tab.posts')).toBe('Meine Posts');
    expect(createTranslator('en').t('tab.posts')).toBe('My posts');
  });
});
