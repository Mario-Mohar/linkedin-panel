import type { FeedPost, ScoreParts, ScoredFeedPost } from './types.js';
import { socialProofPerson } from './extract.js';

const HOUR = 3_600_000;

export function filterFeed(
  posts: FeedPost[],
  opts: { now: Date; maxAgeH: number; ownName: string; excludeCompanies?: boolean },
): FeedPost[] {
  const own = opts.ownName.trim().toLowerCase();
  return posts.filter((p) => {
    if (p.isSponsored) return false;
    // Company posts (author link "/company/") are not paid ads, but they read
    // like promotion — optionally dropped entirely, leaving only people.
    if (opts.excludeCompanies && p.url.includes('/company/')) return false;
    if (own && p.authorName.trim().toLowerCase().includes(own)) return false;
    const ageH = (opts.now.getTime() - new Date(p.postedAt).getTime()) / HOUR;
    if (ageH > opts.maxAgeH || ageH < 0) return false;
    return true;
  });
}

export function heuristicTopical(posts: FeedPost[], ownTerms: string[]): Record<string, number> {
  const terms = ownTerms.map((t) => t.toLowerCase()).filter(Boolean);
  const raw = posts.map((p) => {
    const text = p.textExcerpt.toLowerCase();
    const hits = terms.filter((t) => text.includes(t)).length;
    return { urn: p.postUrn, hits };
  });
  const max = Math.max(1, ...raw.map((r) => r.hits));
  return Object.fromEntries(raw.map((r) => [r.urn, r.hits / max]));
}

function freshness(ageH: number): number {
  if (ageH < 0.5) return 0.6;        // brand new: no traction yet
  if (ageH <= 6) return 1.0;         // sweet spot
  if (ageH >= 24) return 0.2;
  return 1.0 - ((ageH - 6) / 18) * 0.8; // 6..24h linear 1.0 -> 0.2
}

const degreeScore = (d: FeedPost['connectionDegree']) => (d === 1 ? 1.0 : d === 2 ? 0.6 : 0.3);

export function scoreFeed(
  posts: FeedPost[],
  opts: { now: Date; weights: ScoreParts; topical: Record<string, number> },
): ScoredFeedPost[] {
  if (posts.length === 0) return [];
  const feats = posts.map((p) => {
    const ageH = Math.max(0.01, (opts.now.getTime() - new Date(p.postedAt).getTime()) / HOUR);
    const velocity = p.reactions / Math.max(ageH, 0.5);
    return { p, ageH, velocity };
  });
  const maxVel = Math.max(0.0001, ...feats.map((f) => f.velocity));
  const maxReact = Math.max(1, ...feats.map((f) => f.p.reactions));

  const scored = feats.map(({ p, ageH, velocity }) => {
    const fresh = freshness(ageH);
    const velNorm = velocity / maxVel;
    const reachNorm = p.reactions / maxReact;
    // Momentum blends freshness, velocity (reactions over time) and absolute reach.
    const momentum = 0.4 * fresh + 0.3 * velNorm + 0.3 * reachNorm;
    const hasProof = socialProofPerson(p.socialProof);
    // Beziehung: Grad-Score + Social-Proof-Bonus, gedeckelt auf 1.0 (Grad-1 bleibt vorn).
    const relationship = Math.min(1, degreeScore(p.connectionDegree) + (hasProof ? 0.2 : 0));
    const parts: ScoreParts = { momentum, topical: opts.topical[p.postUrn] ?? 0, relationship };
    const w = opts.weights;
    const total = w.momentum * parts.momentum + w.topical * parts.topical + w.relationship * parts.relationship;
    const reasons: string[] = [];
    if (fresh >= 0.9) reasons.push(`frisch (${Math.round(ageH)} Std)`);
    if (velNorm >= 0.6) reasons.push('hohes Momentum');
    if (p.reactions >= 10 && reachNorm >= 0.6) reasons.push(`${p.reactions} Reaktionen`);
    if (parts.topical >= 0.6) reasons.push('passt zu deinen Themen');
    if (p.connectionDegree) reasons.push(`${p.connectionDegree}. Grad`);
    if (hasProof) reasons.push(p.socialProof.replace(/\.$/, ''));
    if (reasons.length === 0) reasons.push(`vor ${Math.round(ageH)} Std`);
    return { ...p, score: Math.round(total * 100), parts, reasons };
  });
  return scored.sort((a, b) => b.score - a.score);
}
