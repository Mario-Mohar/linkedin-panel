import { describe, it, expect } from 'vitest';
import { runFeed } from '../../src/feed/collector.js';
import type { RawFeedPost } from '../../src/feed/types.js';

const now = new Date('2026-07-18T12:00:00.000Z');
// feedMaxAgeH is widened vs. the usual 24h: the fixture URNs below are the same
// ones used in parser.test.ts, whose snowflake-decoded timestamps land ~77h/~101h
// before `now`. These tests pin runFeed's orchestration (fallback/top-N/login-guard),
// not filterFeed's age boundary (already covered by triage.test.ts), so the window
// is widened just enough to let both fixture posts survive filterFeed.
const cfg = { feedMaxAgeH: 168, feedTopN: 2, feedWeights: { momentum: 0.4, topical: 0.35, relationship: 0.25 }, feedExcludeCompanies: false };
const raw = (urn: string, over: Partial<RawFeedPost> = {}): RawFeedPost => ({
  postUrn: urn, authorName: 'A', authorHeadline: '', authorUrl: 'https://www.linkedin.com/in/a/',
  connectionDegreeText: '• 2.', postedAtText: '2 Std.', textExcerpt: 'KI Post',
  reactionsText: '10', repostsText: '0', socialProofText: '', isSponsored: false, ...over });
const fakePage = {} as any;
const deps = (over = {}) => ({
  page: fakePage, ownName: 'Mario', ownPosts: ['Ich baue KI'], ownTerms: ['ki'], now, cfg, limit: 20,
  loggedIn: async () => true,
  fetchFeed: async () => [raw('urn:li:activity:7483045229638574082'), raw('urn:li:activity:7482682797413953537')],
  relevance: async () => [8, 3],
  draft: async () => ['Guter Punkt — bei uns war das ähnlich.'],
  ...over,
});

describe('runFeed', () => {
  it('harvests, scores, drafts for the top N and returns a FeedRun', async () => {
    const run = await runFeed(deps());
    expect(run.posts.length).toBe(2);
    expect(run.posts[0].score).toBeGreaterThanOrEqual(run.posts[1].score);
    expect(Object.keys(run.drafts).length).toBe(2); // topN=2
    expect(run.drafts[run.posts[0].postUrn][0]).toContain('ähnlich');
  });
  it('not logged in -> throws (the CLI catches it)', async () => {
    await expect(runFeed(deps({ loggedIn: async () => false }))).rejects.toThrow(/login/i);
  });
  it('relevance throws -> heuristic fallback, the run stays valid', async () => {
    const run = await runFeed(deps({ relevance: async () => { throw new Error('claude weg'); } }));
    expect(run.posts.length).toBe(2); // scored trotzdem
  });
  it('draft throws -> empty drafts, no crash', async () => {
    const run = await runFeed(deps({ draft: async () => { throw new Error('claude weg'); } }));
    expect(run.drafts[run.posts[0].postUrn]).toEqual([]);
  });
});
