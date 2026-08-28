/**
 * Minimal message lookup for the standalone scripts. They cannot import the
 * TypeScript module, but the catalogues are plain JSON, so they read those.
 */
import fs from 'node:fs';

const SUPPORTED = ['de', 'en'];

export function scriptTranslator() {
  const explicit = (process.env.LIP_LANG ?? '').trim().toLowerCase();
  const fromLocale = (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '').slice(0, 2).toLowerCase();
  const lang = SUPPORTED.includes(explicit) ? explicit : SUPPORTED.includes(fromLocale) ? fromLocale : 'en';
  const messages = JSON.parse(fs.readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), 'utf8'));
  return {
    lang,
    t: (key, vars = {}) => (messages[key] ?? key)
      .replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`)),
  };
}
