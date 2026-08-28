import type { Page } from 'playwright';
import type { CollectionRun, RawPost, RawProfile } from '../parser/types.js';
import { parsePost } from '../parser/post-parser.js';
import { parseProfile } from '../parser/profile-parser.js';
import type { Store } from '../store/store.js';
import { ensureLoggedIn } from '../browser/session.js';
import { createTranslator, type Translator } from '../i18n/index.js';
import { BUILTIN_LABELS, type SummaryLabels } from '../parser/summary-labels.js';

export interface CollectDeps {
  store: Store;
  page: Page;
  limit: number;
  now: Date;
  loggedIn?: (page: Page) => Promise<boolean>;
  fetchPosts?: (page: Page, limit: number, labels: SummaryLabels) => Promise<RawPost[]>;
  fetchProfile?: (page: Page, labels: SummaryLabels) => Promise<RawProfile>;
  /** Message catalogue for run messages. English if omitted. */
  i18n?: Translator;
  /** Labels of the LinkedIn interface being read. German if omitted. */
  labels?: SummaryLabels;
}

/**
 * Clears the bundled example data the first time a real run is about to write.
 * Done here rather than in the store's constructor: merely looking at the
 * dashboard must not delete anything.
 */
export function dropExampleDataOnce(store: Store, i18n: Translator, cmd: string): void {
  try {
    const removed = store.dropExampleData();
    if (removed.length) console.log(i18n.t('cli.exampleDataDropped', { cmd, count: removed.length }));
  } catch (err) {
    // Tidying up must never cost a collection run — a read-only data directory
    // is annoying, losing the run on top of it would be worse.
    console.warn(`[${cmd}] ${(err as Error).message}`);
  }
}

export async function runCollection(deps: CollectDeps): Promise<CollectionRun> {
  const loggedIn = deps.loggedIn ?? ensureLoggedIn;
  const fetchPosts = deps.fetchPosts ?? collectRawPosts;
  const fetchProfile = deps.fetchProfile ?? collectRawProfile;
  const i18n = deps.i18n ?? createTranslator('en');
  const labels = deps.labels ?? BUILTIN_LABELS.de;

  const id = deps.store.startRun(deps.now.toISOString());
  const warnings: string[] = [];
  let postsSeen = 0;

  try {
    if (!(await loggedIn(deps.page))) {
      deps.store.finishRun(id, {
        finishedAt: new Date().toISOString(), status: 'error', postsSeen: 0,
        message: i18n.t('cli.notLoggedIn'),
      });
      return deps.store.getRecentRuns(1)[0];
    }

    dropExampleDataOnce(deps.store, i18n, 'collect');

    const rawPosts = await fetchPosts(deps.page, deps.limit, labels);
    for (const raw of rawPosts) {
      try {
        if (!raw.postUrn) throw new Error('post ohne urn');
        const { post, metrics } = parsePost(raw, deps.now);
        deps.store.upsertPost(post);
        deps.store.appendPostMetrics(metrics);
        postsSeen += 1;
      } catch (err) {
        warnings.push(i18n.t('cli.collect.postSkipped', { message: (err as Error).message }));
      }
    }

    try {
      const rawProfile = await fetchProfile(deps.page, labels);
      deps.store.appendProfileMetrics(parseProfile(rawProfile, deps.now));
    } catch (err) {
      warnings.push(i18n.t('cli.collect.profileFailed', { message: (err as Error).message }));
    }

    deps.store.finishRun(id, {
      finishedAt: new Date().toISOString(),
      status: warnings.length > 0 ? 'warn' : 'ok',
      postsSeen,
      message: warnings.length > 0 ? warnings.join(' | ') : null,
    });
  } catch (err) {
    deps.store.finishRun(id, {
      finishedAt: new Date().toISOString(), status: 'error', postsSeen,
      message: i18n.t('cli.collect.failed', { message: (err as Error).message }),
    });
  }

  return deps.store.getRecentRuns(1)[0];
}

/**
 * DOM extraction of the most recent posts from your own activity page.
 * Navigates to recent-activity/all and reads the visible fields.
 * Selectors verified live against LinkedIn (Brave profile) on 2026-07-18:
 * container/urn/time/reactions/format confirmed; comments and reposts are
 * best effort (with 0 engagement the counts bar is missing -> correctly 0).
 */
export async function getOwnName(page: Page): Promise<string> {
  await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1', { timeout: 15000 }).catch(() => {});
  return (await page.evaluate(() => {
    const h1 = document.querySelector('h1')?.textContent?.trim();
    if (h1) return h1;
    // Fallback: Seitentitel "(3) Mario Mohar, MBA | LinkedIn"
    return document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
  })).trim();
}

export async function collectRawPosts(
  page: Page,
  limit: number,
  labels: SummaryLabels = BUILTIN_LABELS.de,
): Promise<RawPost[]> {
  // Determine our own name — the activity page mixes other people's posts
  // (reposted/commented/liked) in with our own. Filtering is by author match:
  // only cards whose actor contains our own name.
  const ownName = await getOwnName(page);
  if (!ownName) {
    throw new Error('Own name (h1/title) not found — cannot filter by author.');
  }

  await page.goto('https://www.linkedin.com/in/me/recent-activity/all/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  // Scroll until enough of OUR OWN posts are loaded (not just cards in total).
  for (let i = 0; i < 25; i++) {
    const ownCount = await page.$$eval(
      'div.feed-shared-update-v2',
      (nodes, name) => nodes.filter((n) =>
        ((n.querySelector('.update-components-actor__title, .update-components-actor__name')?.textContent) ?? '').includes(name),
      ).length,
      ownName,
    );
    if (ownCount >= limit) break;
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(1200 + (i % 3) * 400);
  }
  // Note: page.$$eval is Playwright's query-all-and-evaluate API (queries matching
  // DOM nodes, then runs the callback against them inside the page context) — not
  // JavaScript's eval(); no arbitrary string code execution occurs here.
  const raw = await page.$$eval(
    'div.feed-shared-update-v2',
    (nodes, params) => {
      const { lim, name, commentsAria, repostsAria } =
        params as { lim: number; name: string; commentsAria: string; repostsAria: string };
      const text = (el: Element | null) => (el?.textContent ?? '').trim();
      const isOwn = (node: Element) =>
        text(node.querySelector('.update-components-actor__title, .update-components-actor__name')).includes(name);
      return nodes.filter(isOwn).slice(0, lim).map((node) => {
        const urn = node.getAttribute('data-urn') ?? '';
        const social = node.querySelector('.social-details-social-counts');
        // The sub-description reads e.g. "3 Tage • vor 3 Tagen • Alle
        // Mitglieder…" — hand only the first segment (the relative time) on.
        const subDesc = text(node.querySelector('.update-components-actor__sub-description'));
        return {
          postUrn: urn,
          url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : '',
          postedAtText: subDesc.split('•')[0].trim(),
          textExcerpt: text(node.querySelector('.update-components-text')).slice(0, 280),
          hasImage: !!node.querySelector('.update-components-image'),
          hasVideo: !!node.querySelector('.update-components-linkedin-video, video'),
          hasDocument: !!node.querySelector('.update-components-document'),
          hasPoll: !!node.querySelector('.update-components-poll'),
          isArticle: !!node.querySelector('.update-components-article'),
          impressionsText: null as string | null,
          reactionsTotalText: text(social?.querySelector('.social-details-social-counts__reactions-count') ?? null),
          reactionsBreakdown: {} as Record<string, string>,
          // The aria-labels are translated, so the search term comes from the
          // label set. The class is the language independent fallback.
          commentsText: text(
            social?.querySelector(`[aria-label*="${commentsAria}" i], .social-details-social-counts__comments`) ?? null,
          ),
          repostsText: text(social?.querySelector(`[aria-label*="${repostsAria}" i]`) ?? null),
        };
      });
    },
    { lim: limit, name: ownName, commentsAria: labels.activity.commentsAria, repostsAria: labels.activity.repostsAria },
  );
  return raw as RawPost[];
}

/**
 * DOM extraction of the follower count from your own profile page.
 * Instead of brittle class selectors the page text is searched for the first
 * "<number> Follower…" or "<number> Kontakte" — on your own profile page your
 * own top card comes first in the DOM. Verified live on 2026-07-18
 * ("563 Follower:innen", "491 Kontakte").
 */
export async function collectRawProfile(
  page: Page,
  labels: SummaryLabels = BUILTIN_LABELS.de,
): Promise<RawProfile> {
  await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const scan = await page.evaluate((words: { followers: string; connections: string }) => {
    const texts = Array.from(document.querySelectorAll('li, span, p, a'))
      .map((n) => (n.textContent ?? '').trim().replace(/\s+/g, ' '))
      .filter((s) => s.length > 0 && s.length < 60);
    // The "+" matters: LinkedIn caps the connections display at "500+", and a
    // pattern without it silently finds nothing and reports null.
    const near = (word: string) => new RegExp(`\\d[\\d.,]*\\+?\\s*${word}`, 'i');
    const follower = texts.find((s) => near(words.followers).test(s)) ?? '';
    const connection = texts.find((s) => near(words.connections).test(s)) ?? null;
    return { follower, connection };
  }, { followers: labels.activity.followersWord, connections: labels.activity.connectionsWord });
  return { followersText: scan.follower, connectionsText: scan.connection };
}
