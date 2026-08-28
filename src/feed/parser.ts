import type { ConnectionDegree, FeedPost, RawFeedPost } from './types.js';
import { parseCount, parseRelativeTime } from '../parser/normalize.js';
import { postedAtFromUrn } from '../parser/urn.js';

function parseDegree(text: string): ConnectionDegree {
  // "• 2.", "Profil 3.+", "3.+" -> 1|2|3
  const m = text.match(/([123])\s*\.\+?/);
  if (!m) return null;
  const n = Number(m[1]);
  return (n === 1 || n === 2 || n === 3) ? (n as ConnectionDegree) : null;
}

export function parseFeedPost(raw: RawFeedPost, now: Date): FeedPost {
  const isActivityUrn = /^urn:li:activity:\d+/.test(raw.postUrn);
  return {
    postUrn: raw.postUrn,
    // LinkedIn no longer exposes the activity URN in the hardened feed DOM, so
    // fall back to linking the author profile rather than a dead post link.
    url: isActivityUrn ? `https://www.linkedin.com/feed/update/${raw.postUrn}/` : raw.authorUrl,
    authorName: raw.authorName,
    authorHeadline: raw.authorHeadline,
    connectionDegree: parseDegree(raw.connectionDegreeText),
    // From the URN (precise), otherwise from the relative text ("2 Tage"),
    // which is only accurate to the day.
    postedAt: postedAtFromUrn(raw.postUrn) ?? parseRelativeTime(raw.postedAtText, now),
    textExcerpt: raw.textExcerpt,
    reactions: parseCount(raw.reactionsText) ?? 0,
    reposts: parseCount(raw.repostsText) ?? 0,
    socialProof: raw.socialProofText,
    isSponsored: raw.isSponsored,
  };
}
