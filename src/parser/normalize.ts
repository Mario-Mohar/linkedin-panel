import type { PostFormat, RawPost } from './types.js';

const MULTIPLIERS: Array<{ re: RegExp; factor: number }> = [
  { re: /(?<![a-zä])(mio|mn|m)(?![a-zä])/i, factor: 1_000_000 },
  { re: /(?<![a-zä])(tsd|k)(?![a-zä])/i, factor: 1_000 },
];

export function parseCount(text: string | null | undefined): number | null {
  if (text == null) return null;
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const lower = trimmed.toLowerCase();
  let factor = 1;
  for (const m of MULTIPLIERS) {
    if (m.re.test(lower)) { factor = m.factor; break; }
  }

  // Isolate the numeric part (first number including decimal/group separators)
  const numMatch = lower.match(/[0-9][0-9.,\s]*/);
  if (!numMatch) return null;
  let numStr = numMatch[0].replace(/\s/g, '');

  if (factor > 1) {
    // Abbreviated form: the separator is a decimal point -> ',' or '.' to '.'
    numStr = numStr.replace(',', '.');
    const value = Number.parseFloat(numStr);
    return Number.isFinite(value) ? Math.round(value * factor) : null;
  }

  // No multiplier: ',' and '.' are thousands separators
  numStr = numStr.replace(/[.,]/g, '');
  const value = Number.parseInt(numStr, 10);
  return Number.isFinite(value) ? value : null;
}

// Ordered long -> short. Single letter English abbreviations (d/h/w/m/y) are
// required to stand alone via lookaround, so that the "d" in the German "Std."
// does NOT match as "day". "mo" (month) is checked before "m" (minute).
const UNIT_MINUTES: Array<{ re: RegExp; minutes: number }> = [
  { re: /jahr|jahre|(?<![a-zä])(yrs?|y)(?![a-zä])/i, minutes: 60 * 24 * 365 },
  { re: /monat|monate|(?<![a-zä])mo(?![a-zä])/i, minutes: 60 * 24 * 30 },
  { re: /woche|wochen|(?<![a-zä])w(?![a-zä])/i, minutes: 60 * 24 * 7 },
  { re: /tage?|(?<![a-zä])d(?![a-zä])/i, minutes: 60 * 24 },
  { re: /std|stunde|stunden|(?<![a-zä])(hrs?|h)(?![a-zä])/i, minutes: 60 },
  { re: /min|minute|minuten|(?<![a-zä])m(?![a-zä])/i, minutes: 1 },
];

export function parseRelativeTime(text: string, now: Date): string {
  const numMatch = text.match(/\d+/);
  if (!numMatch) return now.toISOString();
  const amount = Number.parseInt(numMatch[0], 10);
  for (const u of UNIT_MINUTES) {
    if (u.re.test(text)) {
      return new Date(now.getTime() - amount * u.minutes * 60_000).toISOString();
    }
  }
  return now.toISOString();
}

export function detectFormat(
  raw: Pick<RawPost, 'hasImage' | 'hasVideo' | 'hasDocument' | 'hasPoll' | 'isArticle'>,
): PostFormat {
  if (raw.hasVideo) return 'video';
  if (raw.hasDocument) return 'dokument';
  if (raw.hasPoll) return 'umfrage';
  if (raw.isArticle) return 'artikel';
  if (raw.hasImage) return 'bild';
  return 'text';
}
