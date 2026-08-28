export type PostFormat =
  | 'text' | 'bild' | 'video' | 'dokument' | 'umfrage' | 'artikel';

export interface Post {
  postUrn: string;
  url: string;
  postedAt: string;      // ISO 8601
  format: PostFormat;
  textExcerpt: string;
  firstSeenAt: string;   // ISO 8601
}

export interface ReactionsBreakdown {
  like: number;
  celebrate: number;
  support: number;
  love: number;
  insightful: number;
  funny: number;
}

/**
 * Where a measurement came from.
 * `feed`      — cards on your own activity page. Fast, but no reach figures.
 * `analytics` — the post analytics page. Yields impressions and everything
 *               below it, at the cost of one page load per post.
 */
export type MetricsSource = 'feed' | 'analytics';

/** Figures that only exist on the post analytics page. */
export interface PostAnalytics {
  membersReached: number | null;
  inNetworkPct: number | null;
  outNetworkPct: number | null;
  socialInteractions: number | null;
  saves: number | null;
  sends: number | null;
  profileViews: number | null;
  followersGained: number | null;
}

export interface PostMetrics {
  postUrn: string;
  capturedAt: string;    // ISO 8601
  impressions: number | null;
  reactionsTotal: number;
  reactionsBreakdown: ReactionsBreakdown;
  comments: number;
  reposts: number;
  // Both optional: measurements from before the analytics collector do not have
  // them, and existing NDJSON lines must stay readable without a migration.
  source?: MetricsSource;
  analytics?: PostAnalytics;
}

export interface ProfileMetrics {
  capturedAt: string;    // ISO 8601
  followers: number;
  connections: number | null;
  /**
   * True when LinkedIn showed "500+" rather than a figure. The number is then a
   * floor, and the dashboard has to say so instead of presenting 500 as exact.
   * Optional so older lines stay readable.
   */
  connectionsCapped?: boolean;
}

export type RunStatus = 'ok' | 'warn' | 'error';

export interface CollectionRun {
  id?: number;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  postsSeen: number;
  message: string | null;
}

// --- Raw data from the DOM (input for the parser) ---
export interface RawPost {
  postUrn: string;
  url: string;
  postedAtText: string;   // z.B. "2 Std.", "3 Tage", "1 Woche"
  textExcerpt: string;
  hasImage: boolean;
  hasVideo: boolean;
  hasDocument: boolean;
  hasPoll: boolean;
  isArticle: boolean;
  impressionsText: string | null;
  reactionsTotalText: string;
  reactionsBreakdown: Partial<Record<keyof ReactionsBreakdown, string>>;
  commentsText: string;
  repostsText: string;
}

export interface RawProfile {
  followersText: string;
  connectionsText: string | null;
}
