import type { LoadedData } from '../store/store.js';
import type { PostMetrics } from '../parser/types.js';
import type { DashboardData, Kpis, PostHistory, PostRow, TrendPoint, WeekdayStat } from './types.js';

/**
 * Fallback labels. The caller passes the translated ones; these only apply when
 * computeDashboard is used directly, e.g. from a test.
 */
const WD_FALLBACK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function weekdayIndex(iso: string, tz: string): number {
  // Intl -> Wochentag in Zielzeitzone; Mapping auf 0=Mo..6=So
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(iso));
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[wd] ?? 0;
}

function latestMetric(metrics: PostMetrics[], urn: string): PostMetrics | undefined {
  return metrics.filter((m) => m.postUrn === urn).sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))[0];
}

/**
 * Most recent measurement THAT HAS reach data.
 *
 * Not the same as the most recent measurement overall: the feed collector runs
 * several times a day and never has impressions, the analytics collector runs
 * rarely. Without this split the reach figures would disappear again after
 * every feed run.
 */
function latestAnalyticsMetric(metrics: PostMetrics[], urn: string): PostMetrics | undefined {
  return metrics
    .filter((m) => m.postUrn === urn && m.impressions !== null && m.impressions !== undefined)
    .sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))[0];
}

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

export function computeDashboard(
  data: LoadedData,
  opts: { now: Date; freshDays: number; tz: string; weekdayLabels?: string[] },
): DashboardData {
  const WD_LABELS = opts.weekdayLabels ?? WD_FALLBACK;
  const freshMs = opts.freshDays * 86_400_000;
  const latestFollowers = [...data.profile].sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))[0];
  const followers = latestFollowers?.followers ?? null;

  const rows: PostRow[] = [];
  for (const post of data.posts.values()) {
    const m = latestMetric(data.metrics, post.postUrn);
    if (!m) continue;
    const ageMs = opts.now.getTime() - new Date(post.postedAt).getTime();
    const fresh = ageMs < freshMs;
    const wd = weekdayIndex(post.postedAt, opts.tz);
    const total = m.reactionsTotal + m.comments + m.reposts;
    const a = latestAnalyticsMetric(data.metrics, post.postUrn);
    const impressions = a?.impressions ?? null;
    // Prefer LinkedIn's own count of social interactions; when it is missing,
    // the sum of the three individual numbers is the closest approximation.
    const interactions = a?.analytics?.socialInteractions ?? (a ? a.reactionsTotal + a.comments + a.reposts : total);
    rows.push({
      postUrn: post.postUrn, url: post.url, postedAt: post.postedAt, weekday: wd, weekdayLabel: WD_LABELS[wd],
      ageDays: Math.floor(ageMs / 86_400_000), fresh, textExcerpt: post.textExcerpt,
      reactions: m.reactionsTotal, comments: m.comments, reposts: m.reposts,
      engagementRate: impressions ? (interactions / impressions) * 100 : null,
      followerRate: followers ? (total / followers) * 100 : 0,
      percentile: null,
      impressions,
      membersReached: a?.analytics?.membersReached ?? null,
      inNetworkPct: a?.analytics?.inNetworkPct ?? null,
      outNetworkPct: a?.analytics?.outNetworkPct ?? null,
      socialInteractions: a?.analytics?.socialInteractions ?? null,
      saves: a?.analytics?.saves ?? null,
      sends: a?.analytics?.sends ?? null,
      profileViews: a?.analytics?.profileViews ?? null,
      followersGained: a?.analytics?.followersGained ?? null,
    });
  }

  // Benchmark (percentile of reactions) ONLY among non-fresh posts.
  //
  // Ranked against the OTHER mature posts, not against all of them: `ranked`
  // contains the post being scored, so dividing by its full length capped the
  // best post at (n-1)/n and left a lone mature post on 0 -- "worse than
  // everything" for the only data point there is. With fewer than two mature
  // posts there is nothing to compare against, so there is no percentile.
  const ranked = rows.filter((r) => !r.fresh).map((r) => r.reactions).sort((a, b) => a - b);
  const others = ranked.length - 1;
  for (const r of rows) {
    if (r.fresh || others < 1) { r.percentile = null; continue; }
    const below = ranked.filter((x) => x < r.reactions).length;
    r.percentile = Math.round((below / others) * 100); // 0..100 (higher is better)
  }
  rows.sort((a, b) => b.reactions - a.reactions);

  const mature = rows.filter((r) => !r.fresh);
  const avgReactions = mature.length ? Math.round(mean(mature.map((r) => r.reactions))) : 0;
  const avgFollowerRate = mean(mature.map((r) => r.followerRate));
  // Average only over posts that have impressions. Counting posts without
  // reach data as 0 would quietly drag the rate down.
  const withImpressions = mature.filter((r) => r.engagementRate !== null);
  const avgEngagementRate = withImpressions.length
    ? mean(withImpressions.map((r) => r.engagementRate as number))
    : null;
  const impressionRows = rows.filter((r) => r.impressions !== null);
  const sumOf = (pick: (r: PostRow) => number | null): number | null => {
    const vals = rows.map(pick).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
  };
  const totalImpressions = sumOf((r) => r.impressions);

  const weekday: WeekdayStat[] = WD_LABELS.map((label, i) => {
    const wdRows = mature.filter((r) => r.weekday === i);
    return { weekday: i, label, count: wdRows.length, avgReactions: wdRows.length ? Math.round(wdRows.reduce((s, r) => s + r.reactions, 0) / wdRows.length) : 0 };
  });

  const followerTrend: TrendPoint[] = [...data.profile]
    .sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : 1))
    .map((p) => ({ at: p.capturedAt, value: p.followers }));

  const kpis: Kpis = {
    followers, connections: latestFollowers?.connections ?? null,
    connectionsCapped: latestFollowers?.connectionsCapped === true,
    postCount: rows.length, freshCount: rows.filter((r) => r.fresh).length,
    avgReactions, avgEngagementRate, avgFollowerRate,
    // Counts every post with impressions, fresh included: the reach columns
    // should appear as soon as there is anything to put in them. The average
    // rate below still only uses matured posts.
    postsWithAnalytics: impressionRows.length,
    postsRated: withImpressions.length,
    totalImpressions,
    avgImpressions: impressionRows.length && totalImpressions !== null
      ? Math.round(totalImpressions / impressionRows.length)
      : null,
    totalProfileViews: sumOf((r) => r.profileViews),
    totalFollowersGained: sumOf((r) => r.followersGained),
  };

  return { kpis, posts: rows, weekday, followerTrend, generatedAt: opts.now.toISOString() };
}

export function computePostHistory(data: LoadedData, urn: string): PostHistory {
  const series = data.metrics.filter((m) => m.postUrn === urn).sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : 1));
  return {
    postUrn: urn,
    reactions: series.map((m) => ({ at: m.capturedAt, value: m.reactionsTotal })),
    comments: series.map((m) => ({ at: m.capturedAt, value: m.comments })),
    reposts: series.map((m) => ({ at: m.capturedAt, value: m.reposts })),
    // Only measurements from the analytics collector carry impressions. The
    // feed measurements in between would otherwise show up as zeroes.
    impressions: series
      .filter((m) => m.impressions !== null && m.impressions !== undefined)
      .map((m) => ({ at: m.capturedAt, value: m.impressions as number })),
  };
}
