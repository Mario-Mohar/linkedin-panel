import type { Post, PostMetrics, RawPost, ReactionsBreakdown } from './types.js';
import { parseCount, parseRelativeTime, detectFormat } from './normalize.js';
import { postedAtFromUrn } from './urn.js';

const REACTION_KEYS: Array<keyof ReactionsBreakdown> =
  ['like', 'celebrate', 'support', 'love', 'insightful', 'funny'];

export function parsePost(raw: RawPost, now: Date): { post: Post; metrics: PostMetrics } {
  const nowIso = now.toISOString();

  const post: Post = {
    postUrn: raw.postUrn,
    url: raw.url,
    postedAt: postedAtFromUrn(raw.postUrn) ?? parseRelativeTime(raw.postedAtText, now),
    format: detectFormat(raw),
    textExcerpt: raw.textExcerpt,
    firstSeenAt: nowIso,
  };

  const breakdown = REACTION_KEYS.reduce((acc, key) => {
    acc[key] = parseCount(raw.reactionsBreakdown[key]) ?? 0;
    return acc;
  }, {} as ReactionsBreakdown);

  const metrics: PostMetrics = {
    postUrn: raw.postUrn,
    capturedAt: nowIso,
    impressions: parseCount(raw.impressionsText),
    reactionsTotal: parseCount(raw.reactionsTotalText) ?? 0,
    reactionsBreakdown: breakdown,
    comments: parseCount(raw.commentsText) ?? 0,
    reposts: parseCount(raw.repostsText) ?? 0,
    source: 'feed',
  };

  return { post, metrics };
}
