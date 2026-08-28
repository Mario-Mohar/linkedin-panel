import { describe, it, expect } from 'vitest';
import { buildRawFeedPost } from '../../src/feed/collector.js';
import type { RawCandidates } from '../../src/feed/types.js';

const cand = (over: Partial<RawCandidates> = {}): RawCandidates => ({
  authorHide: 'Ilan Asseo', authorProfile: 'Ilan A.', degreeText: '2.',
  authorUrl: 'https://www.linkedin.com/in/ilan/', textExcerpt: 'BREAKING: Claude Code',
  timeCands: ['4 Std. •'], reactionCands: ['95321995 Reaktionen', '95 Reaktionen'],
  repostCands: [], socialProofCands: ['Bernd Buchegger hat kommentiert'],
  sponsoredHead: 'Ilan Asseo · 2. · 4 Std.', arias: ['Profil von Ilan Asseo anzeigen'],
  ...over,
});

describe('buildRawFeedPost', () => {
  it('condenses candidates into clean fields', () => {
    const r = buildRawFeedPost(cand());
    expect(r.authorName).toBe('Ilan Asseo');
    expect(r.reactionsText).toBe('95 Reaktionen');
    expect(r.postedAtText).toBe('4 Std. •');
    expect(r.socialProofText).toBe('Bernd Buchegger hat kommentiert');
    expect(r.connectionDegreeText).toBe('2.');
    expect(r.isSponsored).toBe(false);
    expect(r.postUrn).toMatch(/^feed:/);
  });
  it('uses the profile name as the author fallback', () => {
    expect(buildRawFeedPost(cand({ authorHide: '' })).authorName).toBe('Ilan A.');
  });
  it('marks genuine ads', () => {
    expect(buildRawFeedPost(cand({ sponsoredHead: 'Acme Anzeige' })).isSponsored).toBe(true);
  });
  it('takes the post time (the first one), not that of an inline comment', () => {
    const r = buildRawFeedPost(cand({ timeCands: ['11 Std.', '5 Min.'] }));
    expect(r.postedAtText).toBe('11 Std.');
  });
});
