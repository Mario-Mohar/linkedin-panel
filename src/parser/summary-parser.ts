import type { SummaryField, SummaryLabels } from './summary-labels.js';

/**
 * Reads the numbers of a post analytics page out of the visible page text.
 *
 * Deliberately a pure function over `innerText`: the page has no stable
 * selectors, and this way the reading can be tested without a browser — a
 * saved page text is enough for a test case.
 */

export type SummaryValues = Partial<Record<SummaryField, number>>;

/** Core fields that show whether the page has finished building itself. */
export const KEY_FIELDS: readonly SummaryField[] = [
  'impressions', 'membersReached', 'socialInteractions',
  'reactions', 'comments', 'reposts', 'saves', 'sends',
  'profileViews', 'followersGained',
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Character class for numbers in the configured interface language. */
function digitsPattern(labels: SummaryLabels): string {
  return `[\\d${escapeRe(labels.thousandsSep)}${escapeRe(labels.decimalSep)}]+`;
}

function toNumber(raw: string, labels: SummaryLabels, kind: 'int' | 'pct'): number | null {
  const withoutThousands = raw.split(labels.thousandsSep).join('');
  const normalized = withoutThousands.split(labels.decimalSep).join('.');
  const n = kind === 'pct' ? Number.parseFloat(normalized) : Number.parseInt(normalized, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * LinkedIn puts number and label in separate elements, so in the text they end
 * up on consecutive lines. Depending on the tile the number comes first (the
 * large KPI tiles) or last (the breakdown lists).
 */
function fieldRegex(label: string, order: 'value-first' | 'label-first', digits: string, kind: 'int' | 'pct'): RegExp {
  const suffix = kind === 'pct' ? '\\s*%' : '';
  const lab = escapeRe(label);
  return order === 'value-first'
    ? new RegExp(`(${digits})${suffix}\\s*\\n\\s*${lab}`)
    : new RegExp(`${lab}[^\\n]*\\n\\s*(${digits})${suffix}`);
}

export function parseSummary(pageText: string, labels: SummaryLabels): SummaryValues {
  const digits = digitsPattern(labels);
  const out: SummaryValues = {};
  for (const [field, spec] of Object.entries(labels.fields) as [SummaryField, SummaryLabels['fields'][SummaryField]][]) {
    const match = pageText.match(fieldRegex(spec.label, spec.order, digits, spec.kind));
    if (!match) continue;
    const value = toNumber(match[1], labels, spec.kind);
    if (value !== null) out[field] = value;
  }
  return out;
}

/** How many core fields are in the text already? Higher is more complete. */
export function completeness(values: SummaryValues | null): number {
  if (!values) return -1;
  return KEY_FIELDS.filter((k) => values[k] !== undefined).length;
}

export function isComplete(values: SummaryValues | null): boolean {
  return completeness(values) === KEY_FIELDS.length;
}

export function missingFields(values: SummaryValues | null): SummaryField[] {
  return KEY_FIELDS.filter((k) => !values || values[k] === undefined);
}
