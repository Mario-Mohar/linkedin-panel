import type { Page } from 'playwright';

export type ConnectionDegree = 1 | 2 | 3 | null;

export interface RawFeedPost {
  postUrn: string;
  authorName: string;
  authorHeadline: string;
  authorUrl: string;
  connectionDegreeText: string;
  postedAtText: string;
  textExcerpt: string;
  reactionsText: string;
  repostsText: string;
  socialProofText: string;
  isSponsored: boolean;
}

export interface FeedPost {
  postUrn: string;
  url: string;
  authorName: string;
  authorHeadline: string;
  connectionDegree: ConnectionDegree;
  postedAt: string;
  textExcerpt: string;
  reactions: number;
  reposts: number;
  socialProof: string;
  isSponsored: boolean;
}

export interface ScoreParts {
  momentum: number;
  topical: number;
  relationship: number;
}

export interface ScoredFeedPost extends FeedPost {
  score: number;
  parts: ScoreParts;
  reasons: string[];
}

export interface FeedRun {
  generatedAt: string;
  posts: ScoredFeedPost[];
  drafts: Record<string, string[]>;
}

export interface FeedDeps {
  page: Page;
  ownName: string;
  ownPosts: string[];
  ownTerms: string[];
  now: Date;
  cfg: { feedMaxAgeH: number; feedTopN: number; feedWeights: ScoreParts; feedExcludeCompanies: boolean };
  limit: number;
  loggedIn?: (page: Page) => Promise<boolean>;
  fetchFeed?: (page: Page, limit: number) => Promise<RawFeedPost[]>;
  relevance?: (posts: FeedPost[], ownPosts: string[]) => Promise<number[]>;
  draft?: (post: FeedPost, ownPosts: string[]) => Promise<string[]>;
}

/** Raw signal candidates per post, as `page.evaluate` delivers them. Parsing
 *  happens in Node (buildRawFeedPost) so it stays unit testable. */
export interface RawCandidates {
  authorHide: string;
  authorProfile: string;
  degreeText: string;
  authorUrl: string;
  textExcerpt: string;
  timeCands: string[];
  reactionCands: string[];
  repostCands: string[];
  socialProofCands: string[];
  sponsoredHead: string;
  arias: string[];
}
