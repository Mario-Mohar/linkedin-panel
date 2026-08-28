import { describe, it, expect } from 'vitest';
import { filterFeed, heuristicTopical, scoreFeed } from '../../src/feed/triage.js';
import type { FeedPost, ScoreParts } from '../../src/feed/types.js';

const now = new Date('2026-07-18T12:00:00.000Z');
const base: FeedPost = { postUrn: 'u', url: 'x', authorName: 'A', authorHeadline: '', connectionDegree: 2,
  postedAt: '2026-07-18T10:00:00.000Z', textExcerpt: '', reactions: 0, reposts: 0, socialProof: '', isSponsored: false };
const mk = (o: Partial<FeedPost>): FeedPost => ({ ...base, ...o });
const weights: ScoreParts = { momentum: 0.40, topical: 0.35, relationship: 0.25 };

describe('filterFeed', () => {
  it('removes ads, own posts and posts that are too old', () => {
    const posts = [
      mk({ postUrn: 'ok', postedAt: '2026-07-18T09:00:00.000Z' }),
      mk({ postUrn: 'ad', isSponsored: true }),
      mk({ postUrn: 'self', authorName: 'Mario Mohar, MBA' }),
      mk({ postUrn: 'old', postedAt: '2026-07-16T09:00:00.000Z' }),
    ];
    const out = filterFeed(posts, { now, maxAgeH: 24, ownName: 'Mario Mohar, MBA' });
    expect(out.map((p) => p.postUrn)).toEqual(['ok']);
  });

  it('removes company posts only with excludeCompanies (author link /company/)', () => {
    const posts = [
      mk({ postUrn: 'person', url: 'https://www.linkedin.com/in/jane/', postedAt: '2026-07-18T09:00:00.000Z' }),
      mk({ postUrn: 'firma', url: 'https://www.linkedin.com/company/acme/', postedAt: '2026-07-18T09:00:00.000Z' }),
    ];
    const on = filterFeed(posts, { now, maxAgeH: 24, ownName: '', excludeCompanies: true });
    expect(on.map((p) => p.postUrn)).toEqual(['person']);
    const off = filterFeed(posts, { now, maxAgeH: 24, ownName: '', excludeCompanies: false });
    expect(off.map((p) => p.postUrn)).toEqual(['person', 'firma']);
  });
});

describe('heuristicTopical', () => {
  it('higher when it overlaps with your own terms', () => {
    const posts = [ mk({ postUrn: 'hit', textExcerpt: 'Wir bauen eine KI App mit Claude' }),
                    mk({ postUrn: 'miss', textExcerpt: 'Gartenarbeit im Sommer' }) ];
    const t = heuristicTopical(posts, ['ki', 'app', 'claude', 'dev']);
    expect(t['hit']).toBeGreaterThan(t['miss']);
  });
});

describe('scoreFeed', () => {
  it('combines the partial scores, sorts descending and returns reasons', () => {
    const posts = [
      mk({ postUrn: 'hot', postedAt: '2026-07-18T09:00:00.000Z', reactions: 500, connectionDegree: 1 }),
      mk({ postUrn: 'meh', postedAt: '2026-07-18T09:00:00.000Z', reactions: 1, connectionDegree: 3 }),
    ];
    const out = scoreFeed(posts, { now, weights, topical: { hot: 0.9, meh: 0.1 } });
    expect(out[0].postUrn).toBe('hot');
    expect(out[0].score).toBeGreaterThan(out[1].score);
    expect(out[0].score).toBeGreaterThanOrEqual(0);
    expect(out[0].score).toBeLessThanOrEqual(100);
    expect(out[0].parts.momentum).toBeGreaterThan(out[1].parts.momentum);
    expect(out[0].reasons.some((r) => /Grad/.test(r))).toBe(true);
  });
  it('social proof lifts relationship but stays below a 1st-degree connection', () => {
    const proof = scoreFeed([mk({ postUrn: 'a', connectionDegree: 3, socialProof: 'Y hat kommentiert' })],
      { now, weights: { momentum: 0, topical: 0, relationship: 1 }, topical: { a: 0 } })[0];
    const grad1 = scoreFeed([mk({ postUrn: 'a', connectionDegree: 1, socialProof: '' })],
      { now, weights: { momentum: 0, topical: 0, relationship: 1 }, topical: { a: 0 } })[0];
    expect(proof.parts.relationship).toBeGreaterThan(0.3);
    expect(proof.parts.relationship).toBeLessThan(grad1.parts.relationship);
    expect(proof.reasons.some((r) => /kommentiert/.test(r))).toBe(true);
  });
  it('empty batch -> []', () => {
    expect(scoreFeed([], { now, weights, topical: {} })).toEqual([]);
  });
  it('always returns at least one reason', () => {
    const weak = mk({ postUrn: 'weak', postedAt: '2026-07-17T16:00:00.000Z', reactions: 0, connectionDegree: null });
    const out = scoreFeed([weak], { now, weights, topical: { weak: 0 } });
    expect(out[0].reasons.length).toBeGreaterThan(0);
  });
});
