export interface PostRow {
  postUrn: string;
  url: string;
  postedAt: string;
  weekday: number;
  weekdayLabel: string;
  ageDays: number;
  fresh: boolean;
  textExcerpt: string;
  reactions: number;
  comments: number;
  reposts: number;
  /**
   * Echte Engagement-Rate: soziale Interaktionen geteilt durch Impressions.
   * null while no post analytics have been collected for the post
   * (`npm run analytics`) — only `followerRate` is available then.
   */
  engagementRate: number | null;
  /**
   * Reactions plus comments plus reposts divided by the current follower
   * count. This is not an engagement rate but a stand-in for the case where
   * impressions are missing. Older posts come out too low, because today's
   * follower count sits in the denominator.
   */
  followerRate: number;
  percentile: number | null;
  // From the post analytics, null without an analytics run.
  impressions: number | null;
  membersReached: number | null;
  inNetworkPct: number | null;
  outNetworkPct: number | null;
  socialInteractions: number | null;
  saves: number | null;
  sends: number | null;
  profileViews: number | null;
  followersGained: number | null;
}

export interface WeekdayStat {
  weekday: number;
  label: string;
  count: number;
  avgReactions: number;
}

export interface TrendPoint {
  at: string;
  value: number;
}

export interface Kpis {
  followers: number | null;
  connections: number | null;
  /** Connections is a floor because LinkedIn caps the display at "500+". */
  connectionsCapped: boolean;
  postCount: number;
  freshCount: number;
  avgReactions: number;
  /** Ø real engagement rate over posts with impressions. null when there are none. */
  avgEngagementRate: number | null;
  /** Ø follower quota, the stand-in without impressions. */
  avgFollowerRate: number;
  /**
   * How many posts have impressions at all, fresh ones included. Drives whether
   * the reach columns are worth showing.
   */
  postsWithAnalytics: number;
  /**
   * How many MATURED posts have impressions — the number the average rate is
   * built on. Can be 0 while postsWithAnalytics is not, namely when reach has
   * only been collected for posts that are still fresh.
   */
  postsRated: number;
  totalImpressions: number | null;
  avgImpressions: number | null;
  totalProfileViews: number | null;
  totalFollowersGained: number | null;
}

export interface DashboardData {
  kpis: Kpis;
  posts: PostRow[];
  weekday: WeekdayStat[];
  followerTrend: TrendPoint[];
  generatedAt: string;
}

export interface PostHistory {
  postUrn: string;
  reactions: TrendPoint[];
  comments: TrendPoint[];
  reposts: TrendPoint[];
  impressions: TrendPoint[];
}
