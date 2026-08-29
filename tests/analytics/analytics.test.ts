import { describe, it, expect } from 'vitest';
import { computeDashboard, computePostHistory } from '../../src/analytics/analytics.js';
import type { LoadedData } from '../../src/store/store.js';
import type { Post, PostMetrics, ProfileMetrics } from '../../src/parser/types.js';

const now = new Date('2026-07-18T12:00:00.000Z');
const mkPost = (urn: string, postedAt: string): Post => ({ postUrn: urn, url: 'u', postedAt, format: 'text', textExcerpt: 't', firstSeenAt: postedAt });
const mkMetric = (urn: string, at: string, r: number, c = 0, rp = 0): PostMetrics => ({ postUrn: urn, capturedAt: at, impressions: null, reactionsTotal: r, reactionsBreakdown: { like: r, celebrate: 0, support: 0, love: 0, insightful: 0, funny: 0 }, comments: c, reposts: rp });

// alt (100 Tage), viel Engagement; frisch (2 Tage), wenig
const data: LoadedData = {
  posts: new Map([
    ['a', mkPost('a', '2026-04-09T08:00:00.000Z')],
    ['b', mkPost('b', '2026-07-16T08:00:00.000Z')],
  ]),
  metrics: [ mkMetric('a', '2026-07-10T00:00:00.000Z', 40, 10, 2), mkMetric('a', '2026-07-18T00:00:00.000Z', 50, 12, 3), mkMetric('b', '2026-07-18T00:00:00.000Z', 1) ],
  profile: [ { capturedAt: '2026-07-10T00:00:00.000Z', followers: 500, connections: 491 }, { capturedAt: '2026-07-18T00:00:00.000Z', followers: 563, connections: 491 } ],
};

describe('computeDashboard', () => {
  const d = computeDashboard(data, { now, freshDays: 21, tz: 'Europe/Berlin' });
  it('takes the most recent metrics snapshot per post', () => {
    expect(d.posts.find((p) => p.postUrn === 'a')!.reactions).toBe(50);
  });
  it('marks fresh posts and excludes them from the benchmark', () => {
    const b = d.posts.find((p) => p.postUrn === 'b')!;
    expect(b.fresh).toBe(true);
    expect(b.percentile).toBeNull();
    const a = d.posts.find((p) => p.postUrn === 'a')!;
    expect(a.fresh).toBe(false);
    // 'a' is the only matured post here, so there is nothing to rank it
    // against. See the percentile block below for the ranking itself.
    expect(a.percentile).toBeNull();
  });
  it('Ø reactions only over non-fresh posts', () => {
    expect(d.kpis.avgReactions).toBe(50); // only post a counts
  });
  it('follower quota = (reactions+comments+reposts)/followers * 100, latest follower count', () => {
    const a = d.posts.find((p) => p.postUrn === 'a')!;
    expect(a.followerRate).toBeCloseTo((50 + 12 + 3) / 563 * 100, 1);
  });
  it('leaves the engagement rate empty while there are no impressions', () => {
    // Without reach data there is no real engagement rate. Presenting the
    // follower quota as one would be a wrong label.
    const a = d.posts.find((p) => p.postUrn === 'a')!;
    expect(a.engagementRate).toBeNull();
    expect(a.impressions).toBeNull();
    expect(d.kpis.avgEngagementRate).toBeNull();
    expect(d.kpis.postsWithAnalytics).toBe(0);
  });
  it('KPIs: followers at the latest count, freshCount correct', () => {
    expect(d.kpis.followers).toBe(563);
    expect(d.kpis.freshCount).toBe(1);
  });
  it('follower trend in chronological order', () => {
    expect(d.followerTrend.map((p) => p.value)).toEqual([500, 563]);
  });
  it('weekday aggregation buckets only matured posts', () => {
    expect(d.weekday).toHaveLength(7);
    // With no labels passed in, computeDashboard uses the English defaults;
    // the dashboard hands the translated ones in.
    expect(d.weekday.map((w) => w.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    const totalCount = d.weekday.reduce((s, w) => s + w.count, 0);
    expect(totalCount).toBe(1); // only the matured post 'a' counts (fresh 'b' excluded)
    const nonEmpty = d.weekday.filter((w) => w.count > 0);
    expect(nonEmpty).toHaveLength(1);
    expect(nonEmpty[0].count).toBe(1);
    expect(nonEmpty[0].avgReactions).toBe(50); // newest snapshot of 'a'
  });
});

/**
 * The same posts, but with an additional measurement from the analytics
 * collector. The feed measurement is newer and has no impressions — exactly the
 * case that would make the reach figures disappear if the most recent
 * measurement were simply taken.
 */
const withAnalytics: LoadedData = {
  posts: data.posts,
  metrics: [
    ...data.metrics,
    {
      postUrn: 'a', capturedAt: '2026-07-17T00:00:00.000Z', impressions: 1000,
      reactionsTotal: 48, reactionsBreakdown: { like: 0, celebrate: 0, support: 0, love: 0, insightful: 0, funny: 0 },
      comments: 11, reposts: 3, source: 'analytics',
      analytics: { membersReached: 800, inNetworkPct: 60, outNetworkPct: 40, socialInteractions: 62, saves: 4, sends: 2, profileViews: 30, followersGained: 5 },
    },
  ],
  profile: data.profile,
};

describe('computeDashboard with reach data', () => {
  const d = computeDashboard(withAnalytics, { now, freshDays: 21, tz: 'Europe/Berlin' });
  const a = () => d.posts.find((p) => p.postUrn === 'a')!;

  it('computes the engagement rate from social interactions and impressions', () => {
    expect(a().engagementRate).toBeCloseTo(62 / 1000 * 100, 3);
  });

  it('keeps the reach figures even though the newest measurement came from the feed', () => {
    expect(a().impressions).toBe(1000);
    expect(a().membersReached).toBe(800);
    expect(a().inNetworkPct).toBe(60);
    expect(a().outNetworkPct).toBe(40);
    // reactions still come from the newer feed measurement
    expect(a().reactions).toBe(50);
  });

  it('averages the rate only over posts that have impressions', () => {
    expect(d.kpis.postsWithAnalytics).toBe(1);
    expect(d.kpis.avgEngagementRate).toBeCloseTo(6.2, 3);
    expect(d.kpis.avgImpressions).toBe(1000);
  });

  it('sums profile views and followers gained', () => {
    expect(d.kpis.totalProfileViews).toBe(30);
    expect(d.kpis.totalFollowersGained).toBe(5);
  });

  it('still reports the follower quota so the comparison stays possible', () => {
    expect(a().followerRate).toBeCloseTo((50 + 12 + 3) / 563 * 100, 1);
  });
});

/**
 * The case a live run produced: reach was collected for the newest posts only,
 * so every post that has impressions is still fresh. The average rate cannot be
 * computed from those, but the reach columns should still appear — otherwise the
 * dashboard hides the numbers it just collected.
 */
describe('computeDashboard when reach exists only on fresh posts', () => {
  const freshOnly: LoadedData = {
    posts: new Map([['b', mkPost('b', '2026-07-16T08:00:00.000Z')]]),
    metrics: [
      mkMetric('b', '2026-07-18T00:00:00.000Z', 1),
      {
        postUrn: 'b', capturedAt: '2026-07-17T00:00:00.000Z', impressions: 267,
        reactionsTotal: 0, reactionsBreakdown: { like: 0, celebrate: 0, support: 0, love: 0, insightful: 0, funny: 0 },
        comments: 0, reposts: 0, source: 'analytics',
        analytics: { membersReached: 189, inNetworkPct: 15, outNetworkPct: 85, socialInteractions: 0, saves: 0, sends: 0, profileViews: 0, followersGained: 0 },
      },
    ],
    profile: data.profile,
  };
  const d = computeDashboard(freshOnly, { now, freshDays: 21, tz: 'Europe/Berlin' });

  it('counts the post as having reach even though it is fresh', () => {
    expect(d.kpis.postsWithAnalytics).toBe(1);
  });

  it('reports no rated posts, because the rate needs matured ones', () => {
    expect(d.kpis.postsRated).toBe(0);
    expect(d.kpis.avgEngagementRate).toBeNull();
  });

  it('still reports the impressions it collected', () => {
    expect(d.kpis.totalImpressions).toBe(267);
    expect(d.posts[0].impressions).toBe(267);
  });
});

describe('percentile', () => {
  // Three matured posts, so each one has others to be ranked against.
  const ranked: LoadedData = {
    posts: new Map([
      ['low', mkPost('low', '2026-04-09T08:00:00.000Z')],
      ['mid', mkPost('mid', '2026-04-10T08:00:00.000Z')],
      ['top', mkPost('top', '2026-04-11T08:00:00.000Z')],
      ['new', mkPost('new', '2026-07-16T08:00:00.000Z')],
    ]),
    metrics: [
      mkMetric('low', '2026-07-18T00:00:00.000Z', 10),
      mkMetric('mid', '2026-07-18T00:00:00.000Z', 20),
      mkMetric('top', '2026-07-18T00:00:00.000Z', 30),
      mkMetric('new', '2026-07-18T00:00:00.000Z', 99),
    ],
    profile: [{ capturedAt: '2026-07-18T00:00:00.000Z', followers: 500, connections: 491 }],
  };
  const r = computeDashboard(ranked, { now, freshDays: 21, tz: 'Europe/Berlin' });
  const pct = (urn: string) => r.posts.find((p) => p.postUrn === urn)!.percentile;

  it('the best matured post reaches 100', () => {
    expect(pct('top')).toBe(100);
  });
  it('the weakest matured post is 0', () => {
    expect(pct('low')).toBe(0);
  });
  it('ranks against the other matured posts, not against itself', () => {
    expect(pct('mid')).toBe(50);
  });
  it('a fresh post has no percentile however strong it is', () => {
    expect(pct('new')).toBeNull();
  });
});

describe('computePostHistory', () => {
  it('returns the reactions/comments/reposts time series for a post', () => {
    const h = computePostHistory(data, 'a');
    expect(h.reactions.map((p) => p.value)).toEqual([40, 50]);
    expect(h.comments.map((p) => p.value)).toEqual([10, 12]);
    expect(h.reposts.map((p) => p.value)).toEqual([2, 3]);
  });
  it('puts only measurements that have impressions into the impressions history', () => {
    const h = computePostHistory(withAnalytics, 'a');
    expect(h.impressions.map((p) => p.value)).toEqual([1000]);
    expect(h.reactions).toHaveLength(3);
  });
});
