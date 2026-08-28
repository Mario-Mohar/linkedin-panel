// Pure extraction helpers, on the Node side so they stay unit testable. The
// collector only brings raw signal candidates out of the browser; they get
// condensed here.

/** Deterministic djb2 hash as a base-36 string (for synthetic post ids). */
export function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Shortest non-empty, trimmed candidate. In long nodes LinkedIn glues several
 *  numbers together ("95321995 Reaktionen") — the real value sits in the
 *  shortest match ("95 Reaktionen"). */
export function pickShortest(cands: string[]): string {
  const cleaned = cands.map((c) => c.trim()).filter((c) => c !== '');
  if (cleaned.length === 0) return '';
  return cleaned.reduce((a, b) => (b.length < a.length ? b : a));
}

/** Author name: prefers the aria-label "Beitrag von X ausblenden", falls back
 *  to the profile link. */
export function pickAuthor(hide: string, profile: string): string {
  return (hide || profile).trim();
}

/** True when the reason line names a person's interaction (social proof). */
export function socialProofPerson(text: string): boolean {
  return text.trim() !== '' && /(kommentiert|gefällt|repostet|geteilt)/i.test(text);
}

/** First non-empty, trimmed candidate in document order. Used for the
 *  timestamp: the post header renders BEFORE any inline comments, whose own
 *  relative times would otherwise win under pickShortest ("shortest wins"). */
export function pickFirst(cands: string[]): string {
  for (const c of cands) { const t = c.trim(); if (t !== '') return t; }
  return '';
}
