import type { Page } from 'playwright';
import type { FeedDeps, FeedRun, RawFeedPost, RawCandidates, ScoredFeedPost } from './types.js';
import { djb2, pickShortest, pickAuthor, pickFirst } from './extract.js';
import { parseFeedPost } from './parser.js';
import { filterFeed, heuristicTopical, scoreFeed } from './triage.js';
import { ensureLoggedIn } from '../browser/session.js';

/**
 * Decides in Node (and therefore testably) whether a post is sponsored.
 *
 * IMPORTANT: the word boundaries (`\b`). LinkedIn's German ad marker is
 * "Anzeige" / "Befoerdert" in the post header. Without `\b`, `/Anzeige/i` also
 * matches as a substring of the verb "anzeigen" — and practically every post
 * carries an aria-label "Profil von X anzeigen". EVERY post would then count as
 * an ad and `filterFeed` would throw the whole feed away (symptom: "the feed is
 * broken", 0 posts).
 */
export function detectSponsored(headText: string, arias: string[]): boolean {
  const re = /\b(?:Anzeige|Befördert|Promoted|Sponsored|Gesponsert)\b/i;
  return re.test(headText) || arias.some((a) => re.test(a));
}

/** Condenses the raw signals gathered inside the page into a RawFeedPost
 *  (a pure function, unit testable). */
export function buildRawFeedPost(c: RawCandidates): RawFeedPost {
  const author = pickAuthor(c.authorHide, c.authorProfile);
  const textExcerpt = c.textExcerpt.slice(0, 800);
  return {
    postUrn: 'feed:' + djb2((c.authorUrl || author) + '|' + textExcerpt.slice(0, 80)),
    authorName: author,
    authorHeadline: '',
    authorUrl: c.authorUrl,
    connectionDegreeText: c.degreeText,
    postedAtText: pickFirst(c.timeCands),
    textExcerpt,
    reactionsText: pickShortest(c.reactionCands),
    repostsText: pickShortest(c.repostCands),
    socialProofText: pickShortest(c.socialProofCands),
    isSponsored: detectSponsored(c.sponsoredHead, c.arias),
  };
}

export async function runFeed(deps: FeedDeps): Promise<FeedRun> {
  const loggedIn = deps.loggedIn ?? ensureLoggedIn;
  const fetchFeed = deps.fetchFeed ?? collectRawFeed;

  if (!(await loggedIn(deps.page))) {
    throw new Error('Nicht eingeloggt — bitte `npm run login` ausführen.');
  }

  const rawPosts = await fetchFeed(deps.page, deps.limit);
  const parsed = rawPosts.map((r) => parseFeedPost(r, deps.now));
  const filtered = filterFeed(parsed, { now: deps.now, maxAgeH: deps.cfg.feedMaxAgeH, ownName: deps.ownName, excludeCompanies: deps.cfg.feedExcludeCompanies });

  // Relevance (AI) with a heuristic fallback
  let topical: Record<string, number>;
  try {
    if (!deps.relevance || filtered.length === 0) throw new Error('no relevance scorer');
    const scores = await deps.relevance(filtered, deps.ownPosts);
    topical = Object.fromEntries(filtered.map((p, i) => [p.postUrn, Math.max(0, Math.min(10, scores[i] ?? 0)) / 10]));
  } catch {
    topical = heuristicTopical(filtered, deps.ownTerms);
  }

  const scored: ScoredFeedPost[] = scoreFeed(filtered, { now: deps.now, weights: deps.cfg.feedWeights, topical });

  // Drafts for the top N
  const drafts: Record<string, string[]> = {};
  for (const post of scored.slice(0, deps.cfg.feedTopN)) {
    try {
      drafts[post.postUrn] = deps.draft ? await deps.draft(post, deps.ownPosts) : [];
    } catch {
      drafts[post.postUrn] = [];
    }
  }

  return { generatedAt: deps.now.toISOString(), posts: scored, drafts };
}

/**
 * DOM extraction of the feed cards. LinkedIn's home feed is hardened against
 * scraping: obfuscated CSS classes, no data-urn, lazily rendered. Instead of
 * clinging to classes we read the SEMANTIC anchors LinkedIn keeps stable for
 * screen readers and its own tests: aria-labels ("Beitrag von X ausblenden",
 * "… Profil 2.") and `data-testid="expandable-text-box"` for the text.
 * Read-only: it only navigates and reads. Verified live on 2026-07-18.
 * Limit: LinkedIn no longer exposes the activity URN in the feed, so there is
 * no precise post id or link (synthetic id; the link points at the author).
 */
export async function collectRawFeed(page: Page, limit: number): Promise<RawFeedPost[]> {
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  // Scroll in a visible (headed) window until enough posts are loaded or the
  // feed stops delivering. Headless yields only ~3 posts and does not react to
  // scrolling (verified live). LinkedIn's lazy loading is slow, so the stall
  // tolerance has to be generous — otherwise this gives up at ~3 posts even
  // though 8–13+ arrive with a little patience. Scroll all the way down each
  // round so the intersection observer at the end of the feed reliably fires.
  let prev = 0, stall = 0;
  for (let i = 0; i < 60; i++) {
    const count = await page.locator('[aria-label="Kommentieren"]').count();
    if (count >= limit) break;
    if (count === prev) { stall++; if (stall >= 8) break; } else { stall = 0; }
    prev = count;
    await page.mouse.wheel(0, 1600);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(1300 + (i % 3) * 400);
  }
  const cands = await page.evaluate(() => {
    const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const ariasOf = (n: Element) => Array.from(n.querySelectorAll('[aria-label]')).map((e) => e.getAttribute('aria-label') || '');

    const containers: Element[] = [];
    const seen = new Set<Element>();
    for (const b of Array.from(document.querySelectorAll('[aria-label="Kommentieren"]'))) {
      const c = b.closest('div[componentkey*="FeedType_MAIN_FEED"]');
      if (c && !seen.has(c)) { seen.add(c); containers.push(c); }
    }

    const out = [];
    for (const n of containers) {
      const arias = ariasOf(n);
      let authorHide = '';
      for (const a of arias) {
        const m = a.match(/Beitrag von (.+?) ausblenden/) || a.match(/Kontrollmenü für den Beitrag von (.+?) öffnen/);
        if (m) { authorHide = m[1].trim(); break; }
      }
      let authorProfile = '';
      for (const a of arias) {
        const m = a.match(/Profil von (.+?) anzeigen/);
        if (m) { authorProfile = m[1].trim(); break; }
      }
      let degreeText = '';
      for (const a of arias) {
        const m = a.match(/Profil\s+([123]\.?\+?)/);
        if (m) { degreeText = m[1]; break; }
      }
      const alink = authorHide
        ? Array.from(n.querySelectorAll('a[aria-label]')).find((a) => (a.getAttribute('aria-label') || '').includes('Profil von ' + authorHide))
        : null;
      const authorUrl = ((alink?.getAttribute('href'))
        || n.querySelector('a[href*="/in/"], a[href*="/company/"]')?.getAttribute('href') || '').split('?')[0];
      const textExcerpt = norm(n.querySelector('[data-testid="expandable-text-box"]')?.textContent);

      const leaves = Array.from(n.querySelectorAll('span,button,a,time'))
        .map((e) => norm(e.textContent)).filter((t) => t.length > 0 && t.length < 40);
      const timeCands = leaves.filter((t) => /^(\d+\s*(Std|Min|Tag|Wo|Monat|Jahr)|jetzt|gerade)/i.test(t));
      const reactionCands = leaves.filter((t) => /^[\d.,]+\s*(Reaktion|„gefällt")/i.test(t));
      const repostCands = leaves.filter((t) => /^[\d.,]+\s*(geteilt|Repost)/i.test(t));
      const socialProofCands = leaves.filter((t) => /(hat kommentiert|gefällt das|hat repostet|hat dies geteilt)/i.test(t));
      const sponsoredHead = norm(n.textContent).slice(0, 200);

      if (!authorHide && !authorProfile && !textExcerpt) continue;
      out.push({ authorHide, authorProfile, degreeText, authorUrl, textExcerpt,
        timeCands, reactionCands, repostCands, socialProofCands, sponsoredHead, arias });
    }
    return out;
  });
  return (cands as RawCandidates[]).map(buildRawFeedPost);
}
