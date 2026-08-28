import { describe, it, expect } from 'vitest';
import { parseFeedPost } from '../../src/feed/parser.js';
import type { RawFeedPost } from '../../src/feed/types.js';

const now = new Date('2026-07-18T12:00:00.000Z');
const raw: RawFeedPost = {
  postUrn: 'urn:li:activity:7483045229638574082', authorName: 'Jane Doe', authorHeadline: 'CTO @ X',
  authorUrl: 'https://www.linkedin.com/in/jane/', connectionDegreeText: '• 2.', postedAtText: '2 Std.',
  textExcerpt: 'Ein Post über KI', reactionsText: '1.2 Tsd.', repostsText: '3',
  socialProofText: 'Max Muster hat kommentiert', isSponsored: false,
};

describe('parseFeedPost', () => {
  it('normalises counters, degree, time, URL and social proof', () => {
    const p = parseFeedPost(raw, now);
    expect(p.reactions).toBe(1200);
    expect(p.reposts).toBe(3);
    expect(p.connectionDegree).toBe(2);
    expect(p.socialProof).toBe('Max Muster hat kommentiert');
    expect(p.postedAt.slice(0, 10)).toBe('2026-07-15'); // from the URN
    expect(p.url).toContain('urn:li:activity:7483045229638574082');
    expect(p.authorName).toBe('Jane Doe');
  });
  it('degree not stated -> null; missing counters -> 0', () => {
    const p = parseFeedPost({ ...raw, connectionDegreeText: '', reactionsText: '' }, now);
    expect(p.connectionDegree).toBeNull();
    expect(p.reactions).toBe(0);
  });
  it('without an activity URN: link to the author profile, time from the relative text, degree "3.+"', () => {
    const p = parseFeedPost({ ...raw, postUrn: 'feed:abc123', connectionDegreeText: '3.+', postedAtText: '2 Tage' }, now);
    expect(p.url).toBe('https://www.linkedin.com/in/jane/');
    expect(p.connectionDegree).toBe(3);
    expect(p.postedAt.slice(0, 10)).toBe('2026-07-16');
  });
});
