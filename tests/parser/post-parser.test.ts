import { describe, it, expect } from 'vitest';
import { parsePost } from '../../src/parser/post-parser.js';
import type { RawPost } from '../../src/parser/types.js';

const now = new Date('2026-07-18T12:00:00.000Z');
const raw: RawPost = {
  postUrn: 'urn:li:activity:42', url: 'https://linkedin.com/feed/update/urn:li:activity:42',
  postedAtText: '2 Std.', textExcerpt: 'Mein Beitrag',
  hasImage: true, hasVideo: false, hasDocument: false, hasPoll: false, isArticle: false,
  impressionsText: '1.234', reactionsTotalText: '1,2 Tsd.',
  reactionsBreakdown: { like: '900', celebrate: '300' },
  commentsText: '45', repostsText: '3',
};

describe('parsePost', () => {
  it('builds post + metrics from raw data', () => {
    const { post, metrics } = parsePost(raw, now);
    expect(post.postUrn).toBe('urn:li:activity:42');
    expect(post.format).toBe('bild');
    expect(post.postedAt).toBe('2026-07-18T10:00:00.000Z');
    expect(post.firstSeenAt).toBe(now.toISOString());

    expect(metrics.impressions).toBe(1234);
    expect(metrics.reactionsTotal).toBe(1200);
    expect(metrics.reactionsBreakdown.like).toBe(900);
    expect(metrics.reactionsBreakdown.celebrate).toBe(300);
    expect(metrics.reactionsBreakdown.support).toBe(0);
    expect(metrics.comments).toBe(45);
    expect(metrics.reposts).toBe(3);
    expect(metrics.capturedAt).toBe(now.toISOString());
  });

  it('missing impressions -> null, missing counters -> 0', () => {
    const { metrics } = parsePost({ ...raw, impressionsText: null, commentsText: '', reactionsTotalText: '' }, now);
    expect(metrics.impressions).toBeNull();
    expect(metrics.comments).toBe(0);
    expect(metrics.reactionsTotal).toBe(0);
  });

  it('postedAt comes from the URN, not from the relative text', () => {
    const { post } = parsePost({ ...raw, postUrn: 'urn:li:activity:7483045229638574082', postedAtText: '99 Tage' }, now);
    expect(post.postedAt.slice(0, 10)).toBe('2026-07-15'); // the URN wins over "99 Tage"
  });
});
