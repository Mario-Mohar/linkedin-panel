import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Language of the tool itself: dashboard labels and console output.
 *
 * Not the same thing as `LIP_LI_LANG`, which is the language LinkedIn's own
 * interface is set to and decides how the analytics pages are read. Someone can
 * run LinkedIn in German and still want the panel in English, so the two are
 * kept apart on purpose.
 */

export type UiLang = 'de' | 'en';
export const SUPPORTED_LANGS: readonly UiLang[] = ['de', 'en'];

export type Messages = Record<string, string>;

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Picks the language: explicit setting first, then the system locale, English
 * as the last resort. English is the fallback because the published tool is
 * meant to be usable by people who do not read German.
 */
export function resolveUiLang(env: NodeJS.ProcessEnv = process.env): UiLang {
  const explicit = (env.LIP_LANG ?? '').trim().toLowerCase();
  if (isSupported(explicit)) return explicit;
  const fromLocale = (env.LC_ALL || env.LC_MESSAGES || env.LANG || '').slice(0, 2).toLowerCase();
  if (isSupported(fromLocale)) return fromLocale;
  return 'en';
}

function isSupported(value: string): value is UiLang {
  return (SUPPORTED_LANGS as readonly string[]).includes(value);
}

const cache = new Map<UiLang, Messages>();

export function loadMessages(lang: UiLang): Messages {
  const cached = cache.get(lang);
  if (cached) return cached;
  const file = path.join(here, `${lang}.json`);
  const messages = JSON.parse(fs.readFileSync(file, 'utf8')) as Messages;
  cache.set(lang, messages);
  return messages;
}

/**
 * Looks up a message and fills `{placeholders}`.
 *
 * A missing key returns the key itself rather than an empty string: a visible
 * `kpi.followers` in the interface points straight at the gap, whereas a blank
 * label just looks like a rendering bug.
 */
export function translate(messages: Messages, key: string, vars: Record<string, string | number> = {}): string {
  const template = messages[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`);
}

/** Weekday labels Mon..Sun in the given language. */
export function weekdayLabels(messages: Messages): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => translate(messages, `weekday.${i}`));
}

export interface Translator {
  lang: UiLang;
  locale: string;
  messages: Messages;
  t(key: string, vars?: Record<string, string | number>): string;
}

export function createTranslator(lang: UiLang): Translator {
  const messages = loadMessages(lang);
  return {
    lang,
    locale: messages['meta.locale'] ?? 'en-US',
    messages,
    t: (key, vars) => translate(messages, key, vars),
  };
}
