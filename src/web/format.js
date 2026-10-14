/**
 * Number formatting for the dashboard, kept apart from app.js so it can be
 * tested without a browser.
 *
 * Percentages go through Intl as well: German counts use a dot for grouping
 * (2.118), so a percentage with a decimal point (2.1%) would read like a count.
 */
export const formatNumber = (locale, n) => new Intl.NumberFormat(locale).format(n);

/** `value` is already in percent (2.1 means 2.1 %), as the analytics compute it. */
export const formatPct = (locale, value, digits = 1) => new Intl.NumberFormat(locale, {
  style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits,
}).format(value / 100);
