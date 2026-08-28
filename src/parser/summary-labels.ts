import fs from 'node:fs';

/**
 * The post analytics page (/analytics/post-summary/) has no stable classes or
 * test ids — the numbers are only reachable through their labels. That ties
 * reading them to the language LinkedIn's interface is set to.
 *
 * The labels are therefore data instead of hard-wired regexes: a language is a
 * set of field descriptions, and anyone who needs a third language (or a
 * changed label) writes a JSON file and points LIP_LI_LABELS at it.
 * `npm run analytics -- --dump-page` writes the page text out so the real
 * labels can be read off it.
 */

export type UiLang = 'de' | 'en';

/** Does the number come before or after its label? */
export type FieldOrder = 'value-first' | 'label-first';

export interface FieldSpec {
  /** Label as it appears on the page. A partial match is enough. */
  label: string;
  order: FieldOrder;
  kind: 'int' | 'pct';
}

export interface SummaryLabels {
  lang: string;
  /** Thousands separator of the LinkedIn interface, e.g. "." for de, "," for en. */
  thousandsSep: string;
  /** Decimal separator, e.g. "," for de, "." for en. */
  decimalSep: string;
  fields: Record<SummaryField, FieldSpec>;
  /**
   * Section headings the collector uses to tell how far the page has built
   * itself. `profileActivity` is the bottom-most section.
   */
  sections: { engagement: string; profileActivity: string };
  /**
   * Terms the feed collector needs. The activity page exposes comments and
   * reposts only through aria-labels, and those are translated. Without these
   * the counters silently come out as 0 on a non-German interface — wrong data
   * that looks like a working run, which is worse than an error.
   */
  activity: {
    commentsAria: string;
    repostsAria: string;
    followersWord: string;
    connectionsWord: string;
  };
}

export type SummaryField =
  | 'impressions'
  | 'membersReached'
  | 'inNetworkPct'
  | 'outNetworkPct'
  | 'socialInteractions'
  | 'reactions'
  | 'comments'
  | 'reposts'
  | 'saves'
  | 'sends'
  | 'profileViews'
  | 'followersGained';

/**
 * German. Verified live against the German LinkedIn interface — these labels
 * come from a script that has been in daily use since July 2026.
 */
const DE: SummaryLabels = {
  lang: 'de',
  thousandsSep: '.',
  decimalSep: ',',
  fields: {
    impressions: { label: 'Impressions', order: 'value-first', kind: 'int' },
    membersReached: { label: 'Erreichte Mitglieder', order: 'value-first', kind: 'int' },
    inNetworkPct: { label: 'Im Netzwerk', order: 'label-first', kind: 'pct' },
    outNetworkPct: { label: 'Außerhalb des Netzwerks', order: 'label-first', kind: 'pct' },
    socialInteractions: { label: 'Soziale Interaktionen', order: 'value-first', kind: 'int' },
    reactions: { label: 'Reaktionen', order: 'label-first', kind: 'int' },
    comments: { label: 'Kommentare', order: 'label-first', kind: 'int' },
    reposts: { label: 'Reposts', order: 'label-first', kind: 'int' },
    saves: { label: 'Gespeicherte Beiträge', order: 'label-first', kind: 'int' },
    sends: { label: 'Auf LinkedIn gesendet', order: 'label-first', kind: 'int' },
    profileViews: { label: 'Mit diesem Beitrag generierte Profilansichten', order: 'value-first', kind: 'int' },
    followersGained: { label: 'Mit diesem Beitrag gewonnene Follower', order: 'value-first', kind: 'int' },
  },
  sections: { engagement: 'Engagement', profileActivity: 'Profilaktivitäten' },
  activity: {
    commentsAria: 'Kommentar',
    repostsAria: 'geteilt',
    followersWord: 'Follower',
    connectionsWord: 'Kontakt',
  },
};

/**
 * English. NOT verified live — the labels are modelled on the German ones. If
 * numbers are missing this is the first place to fix:
 * `npm run analytics -- --dump-page` shows the real page text.
 */
const EN: SummaryLabels = {
  lang: 'en',
  thousandsSep: ',',
  decimalSep: '.',
  fields: {
    impressions: { label: 'Impressions', order: 'value-first', kind: 'int' },
    membersReached: { label: 'Members reached', order: 'value-first', kind: 'int' },
    inNetworkPct: { label: 'In network', order: 'label-first', kind: 'pct' },
    outNetworkPct: { label: 'Out of network', order: 'label-first', kind: 'pct' },
    socialInteractions: { label: 'Social interactions', order: 'value-first', kind: 'int' },
    reactions: { label: 'Reactions', order: 'label-first', kind: 'int' },
    comments: { label: 'Comments', order: 'label-first', kind: 'int' },
    reposts: { label: 'Reposts', order: 'label-first', kind: 'int' },
    saves: { label: 'Saves', order: 'label-first', kind: 'int' },
    sends: { label: 'Sends', order: 'label-first', kind: 'int' },
    profileViews: { label: 'Profile viewers from this post', order: 'value-first', kind: 'int' },
    followersGained: { label: 'Followers gained from this post', order: 'value-first', kind: 'int' },
  },
  sections: { engagement: 'Engagement', profileActivity: 'Profile activity' },
  activity: {
    commentsAria: 'comment',
    repostsAria: 'repost',
    followersWord: 'follower',
    connectionsWord: 'connection',
  },
};

export const BUILTIN_LABELS: Record<UiLang, SummaryLabels> = { de: DE, en: EN };

/** Languages whose labels have been checked against the real interface. */
export const VERIFIED_LANGS: readonly UiLang[] = ['de'];

export function isVerified(labels: SummaryLabels): boolean {
  return (VERIFIED_LANGS as readonly string[]).includes(labels.lang);
}

/**
 * Loads the labels. A file given via LIP_LI_LABELS beats the built-in
 * languages, so nobody has to touch the code just because LinkedIn renames a
 * word.
 */
/**
 * Picks the label set for a detected interface language. Unknown languages fall
 * back to English rather than throwing: a wrong-but-plausible set that the user
 * can override beats a crash right after cloning.
 */
export function labelsForDetected(code: string | null): SummaryLabels {
  const key = (code ?? '') as UiLang;
  return BUILTIN_LABELS[key] ?? BUILTIN_LABELS.en;
}

export function loadLabels(opts: { lang: string; labelsFile?: string }): SummaryLabels {
  if (opts.labelsFile) {
    const parsed = JSON.parse(fs.readFileSync(opts.labelsFile, 'utf8')) as Partial<SummaryLabels>;
    const base = BUILTIN_LABELS[(parsed.lang as UiLang) in BUILTIN_LABELS ? (parsed.lang as UiLang) : 'de'];
    return {
      ...base,
      ...parsed,
      fields: { ...base.fields, ...(parsed.fields ?? {}) },
      sections: { ...base.sections, ...(parsed.sections ?? {}) },
      activity: { ...base.activity, ...(parsed.activity ?? {}) },
    } as SummaryLabels;
  }
  const key = opts.lang as UiLang;
  const found = BUILTIN_LABELS[key];
  if (!found) {
    const known = Object.keys(BUILTIN_LABELS).join(', ');
    throw new Error(`Unknown language "${opts.lang}". Built in: ${known}. Add your own via LIP_LI_LABELS=/path/labels.json.`);
  }
  return found;
}
