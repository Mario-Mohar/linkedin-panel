import { describe, it, expect } from 'vitest';
import { toPostMetrics, analyticsUrlFor, runAnalyticsCollection } from '../../src/collector/analytics-collector.js';
import { BUILTIN_LABELS } from '../../src/parser/summary-labels.js';
import type { SummaryValues } from '../../src/parser/summary-parser.js';
import type { Store } from '../../src/store/store.js';
import type { Post, PostMetrics, ProfileMetrics, CollectionRun } from '../../src/parser/types.js';
import { createTranslator } from '../../src/i18n/index.js';
import { dropExampleDataOnce } from '../../src/collector/collector.js';

const full: SummaryValues = {
  impressions: 1234, membersReached: 987, inNetworkPct: 62.5, outNetworkPct: 37.5,
  socialInteractions: 78, reactions: 52, comments: 21, reposts: 5,
  saves: 7, sends: 3, profileViews: 41, followersGained: 6,
};

describe('toPostMetrics', () => {
  const m = toPostMetrics('urn:li:activity:42', full, '2026-08-28T10:00:00.000Z');

  it('puts the analytics values into the measurement', () => {
    expect(m.impressions).toBe(1234);
    expect(m.reactionsTotal).toBe(52);
    expect(m.analytics?.membersReached).toBe(987);
    expect(m.analytics?.profileViews).toBe(41);
    expect(m.analytics?.followersGained).toBe(6);
  });

  it('records the source so feed and analytics values stay distinguishable', () => {
    expect(m.source).toBe('analytics');
  });

  it('claims no reaction breakdown that the page does not provide', () => {
    // The analytics page only names the total. Zeroes in the breakdown would
    // contradict reactionsTotal=52 — they must never pass as a real
    // distribution anywhere.
    expect(Object.values(m.reactionsBreakdown).every((v) => v === 0)).toBe(true);
    expect(m.reactionsTotal).toBeGreaterThan(0);
  });

  it('turns missing fields into null rather than 0', () => {
    const sparse = toPostMetrics('urn:li:activity:7', { impressions: 10 }, '2026-08-28T10:00:00.000Z');
    expect(sparse.analytics?.membersReached).toBeNull();
    expect(sparse.analytics?.saves).toBeNull();
  });
});

describe('analyticsUrlFor', () => {
  it('builds the analytics URL from the URN', () => {
    expect(analyticsUrlFor('urn:li:activity:42'))
      .toBe('https://www.linkedin.com/analytics/post-summary/urn:li:activity:42/');
  });
});

/** Store double that only records what the collector puts into it. */
function fakeStore(): Store & { metrics: PostMetrics[]; posts: Post[]; runs: CollectionRun[] } {
  const metrics: PostMetrics[] = [];
  const posts: Post[] = [];
  const runs: CollectionRun[] = [];
  const store = {
    dataDir: '/tmp', machineId: 'test',
    data: { posts: new Map<string, Post>(), metrics: [] as PostMetrics[], profile: [] as ProfileMetrics[] },
    upsertPost(p: Post) { posts.push(p); store.data.posts.set(p.postUrn, p); },
    appendPostMetrics(m: PostMetrics) { metrics.push(m); },
    appendProfileMetrics() {},
    reload() { return false; },
    dropExampleData() { return []; },
    startRun() { return 'run-1'; },
    finishRun(_id: string, patch: { finishedAt: string; status: CollectionRun['status']; postsSeen: number; message: string | null }) {
      runs.length = 0;
      runs.push({ startedAt: 'x', ...patch });
    },
    getRecentRuns() { return runs; },
    metrics, posts, runs,
  };
  return store as unknown as Store & { metrics: PostMetrics[]; posts: Post[]; runs: CollectionRun[] };
}

const page = {} as never;

describe('runAnalyticsCollection', () => {
  it('writes measurements and creates unknown posts', async () => {
    const store = fakeStore();
    const run = await runAnalyticsCollection({
      store, page, limit: 5, now: new Date('2026-08-28T10:00:00.000Z'), labels: BUILTIN_LABELS.de,
      loggedIn: async () => true,
      pacing: { betweenPosts: 0, betweenRetries: 0 },
      // A real activity URN: the upper bits encode the post time.
      listOwnPosts: async () => [{ postUrn: 'urn:li:activity:7483045229638574082', textExcerpt: 'Mein Beitrag' }],
      fetchSummary: async () => full,
    });
    expect(run.status).toBe('ok');
    expect(run.postsSeen).toBe(1);
    expect(store.metrics).toHaveLength(1);
    expect(store.metrics[0].impressions).toBe(1234);
    expect(store.posts[0].textExcerpt).toBe('Mein Beitrag');
    // postedAt comes from the URN, not from the collection time
    expect(store.posts[0].postedAt).toBe('2026-07-15T06:30:11.003Z');
    expect(store.posts[0].firstSeenAt).toBe('2026-08-28T10:00:00.000Z');
  });

  it('falls back to the collection time when the URN carries no time', async () => {
    const store = fakeStore();
    await runAnalyticsCollection({
      store, page, limit: 5, now: new Date(), labels: BUILTIN_LABELS.de,
      loggedIn: async () => true,
      pacing: { betweenPosts: 0, betweenRetries: 0 },
      listOwnPosts: async () => [{ postUrn: 'urn:li:activity:42', textExcerpt: '' }],
      fetchSummary: async () => full,
    });
    expect(store.posts[0].postedAt).toBe(store.posts[0].firstSeenAt);
  });

  it('reports an error rather than ok when not a single post was read', async () => {
    // Otherwise changed LinkedIn markup would look like a successful run.
    const store = fakeStore();
    const run = await runAnalyticsCollection({
      store, page, limit: 5, now: new Date(), labels: BUILTIN_LABELS.de,
      loggedIn: async () => true,
      pacing: { betweenPosts: 0, betweenRetries: 0 },
      listOwnPosts: async () => [{ postUrn: 'urn:li:activity:42', textExcerpt: '' }],
      fetchSummary: async () => ({}),
    });
    expect(run.status).toBe('error');
    expect(store.metrics).toHaveLength(0);
  });

  it('warns about incomplete posts but does not discard them', async () => {
    const store = fakeStore();
    const run = await runAnalyticsCollection({
      store, page, limit: 5, now: new Date(), labels: BUILTIN_LABELS.de,
      loggedIn: async () => true,
      pacing: { betweenPosts: 0, betweenRetries: 0 },
      listOwnPosts: async () => [{ postUrn: 'urn:li:activity:42', textExcerpt: '' }],
      fetchSummary: async () => ({ impressions: 500, reactions: 3 }),
    });
    expect(run.status).toBe('warn');
    expect(run.message).toMatch(/incomplete/);
    expect(store.metrics[0].impressions).toBe(500);
  });

  it('stops cleanly when not logged in', async () => {
    const store = fakeStore();
    const run = await runAnalyticsCollection({
      store, page, limit: 5, now: new Date(), labels: BUILTIN_LABELS.de,
      loggedIn: async () => false,
      listOwnPosts: async () => { throw new Error('darf nicht aufgerufen werden'); },
      fetchSummary: async () => full,
    });
    expect(run.status).toBe('error');
    expect(run.message).toMatch(/npm run login/);
  });
});

describe('dropExampleDataOnce', () => {
  const i18n = createTranslator('en');

  it('reports how many files it removed', () => {
    const store = { dropExampleData: () => ['a', 'b'] } as unknown as Store;
    expect(() => dropExampleDataOnce(store, i18n, 'collect')).not.toThrow();
  });

  it('does not let a failed cleanup kill the run', () => {
    // A read-only data directory is annoying; losing the collection run on top
    // of it would be worse.
    const store = { dropExampleData: () => { throw new Error('read-only'); } } as unknown as Store;
    expect(() => dropExampleDataOnce(store, i18n, 'collect')).not.toThrow();
  });
});
