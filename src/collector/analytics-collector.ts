import type { Page } from 'playwright';
import type { CollectionRun, Post, PostMetrics, ReactionsBreakdown } from '../parser/types.js';
import type { SummaryLabels } from '../parser/summary-labels.js';
import type { SummaryValues } from '../parser/summary-parser.js';
import { completeness, isComplete, missingFields, parseSummary } from '../parser/summary-parser.js';
import { postedAtFromUrn } from '../parser/urn.js';
import type { Store } from '../store/store.js';
import { ensureLoggedIn } from '../browser/session.js';
import { dropExampleDataOnce } from './collector.js';
import { createTranslator, type Translator } from '../i18n/index.js';

/**
 * A second collector next to the feed collector: it reads the real post
 * analytics (/analytics/post-summary/…) instead of the feed cards. Impressions,
 * reach, saves, sends and the profile views and followers gained per post only
 * exist there.
 *
 * Considerably slower than the feed collector — one page per post, with waits.
 * Meant for one run a day, not for the scheduler.
 */

const ACTIVITY_URL = 'https://www.linkedin.com/in/me/recent-activity/all/';
const ANALYTICS_LINK_SEL = 'a[href*="/analytics/post-summary/"]';
const POST_SEL = 'div[data-urn^="urn:li:activity"]';

const EMPTY_BREAKDOWN: ReactionsBreakdown = {
  like: 0, celebrate: 0, support: 0, love: 0, insightful: 0, funny: 0,
};

export interface OwnPostRef {
  postUrn: string;
  textExcerpt: string;
}

export interface AnalyticsCollectDeps {
  store: Store;
  page: Page;
  limit: number;
  now: Date;
  labels: SummaryLabels;
  loggedIn?: (page: Page) => Promise<boolean>;
  listOwnPosts?: (page: Page, limit: number, log: Logger, i18n: Translator) => Promise<OwnPostRef[]>;
  /** One read attempt for a post. Replaceable so the flow is testable without a browser. */
  fetchSummary?: (page: Page, urn: string, labels: SummaryLabels) => Promise<SummaryValues | null>;
  /**
   * Waits. The defaults keep the load on LinkedIn low; tests set them to 0 so
   * the flow can be checked without actually waiting.
   */
  pacing?: { betweenPosts?: number; betweenRetries?: number };
  /** Message catalogue for log lines and run messages. English if omitted. */
  i18n?: Translator;
  log?: Logger;
}

export type Logger = (message: string) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function analyticsUrlFor(urn: string): string {
  return `https://www.linkedin.com/analytics/post-summary/${urn}/`;
}

/**
 * Turns read analytics values into a measurement in the store's format.
 * A pure function, so the mapping stays testable without a browser.
 */
export function toPostMetrics(urn: string, values: SummaryValues, capturedAt: string): PostMetrics {
  return {
    postUrn: urn,
    capturedAt,
    impressions: values.impressions ?? null,
    reactionsTotal: values.reactions ?? 0,
    // The analytics page only names the total, not a breakdown by reaction
    // type. Zeroes would be a claim that contradicts the total — so the field
    // stays empty here, and anyone who needs a breakdown takes the
    // measurements from the feed collector.
    reactionsBreakdown: { ...EMPTY_BREAKDOWN },
    comments: values.comments ?? 0,
    reposts: values.reposts ?? 0,
    source: 'analytics',
    analytics: {
      membersReached: values.membersReached ?? null,
      inNetworkPct: values.inNetworkPct ?? null,
      outNetworkPct: values.outNetworkPct ?? null,
      socialInteractions: values.socialInteractions ?? null,
      saves: values.saves ?? null,
      sends: values.sends ?? null,
      profileViews: values.profileViews ?? null,
      followersGained: values.followersGained ?? null,
    },
  };
}

/**
 * Polls until the values are really in the DOM instead of waiting a fixed time.
 *
 * LinkedIn builds the tiles one after another; the reach tile regularly arrives
 * well after the impressions. A blanket wait often missed it. So completeness
 * is counted instead, and the most complete state seen is returned — never a
 * worse one.
 */
export async function readSummaryFromPage(
  page: Page,
  labels: SummaryLabels,
  timeoutMs = 25_000,
): Promise<SummaryValues | null> {
  const deadline = Date.now() + timeoutMs;
  let best: SummaryValues | null = null;
  let stable = 0;
  while (Date.now() < deadline) {
    const text = await page.evaluate(() => document.body.innerText);
    const values = parseSummary(text, labels);
    if (completeness(values) > completeness(best)) { best = values; stable = 0; } else { stable += 1; }
    if (isComplete(best)) return best;
    // The page has stopped filling in -> do not wait for the timeout, the retry
    // in the loop above reloads anyway.
    if (stable >= 10 && best && best.impressions !== undefined) return best;
    await sleep(700);
  }
  return best;
}

/**
 * Collects your own posts from the activity page.
 *
 * Own posts are recognised by the analytics link: LinkedIn only attaches it to
 * cards that belong to you. That is more reliable than matching on the name,
 * because it does not break on identical names or on reposts.
 */
export async function listOwnPostRefs(
  page: Page,
  limit: number,
  log: Logger,
  i18n: Translator = createTranslator('en'),
): Promise<OwnPostRef[]> {
  await page.goto(ACTIVITY_URL, { waitUntil: 'domcontentloaded' });
  await sleep(2500);

  let loaded = false;
  for (let attempt = 0; attempt < 2 && !loaded; attempt++) {
    try {
      await page.locator(POST_SEL).first().waitFor({ timeout: 25_000 });
      loaded = true;
    } catch {
      log(i18n.t('cli.analytics.activityEmpty'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await sleep(3000);
    }
  }
  if (!loaded) throw new Error(i18n.t('cli.analytics.activityNoPosts'));

  // Freshly posted item: LinkedIn often does not attach the analytics link on
  // the first request. Without the link the newest post would fall through. A
  // reload brings it. Capped, so an actual repost at the top (which never gets
  // a link) cannot block the loop.
  const topHasLink = () => page.evaluate((sel) => {
    const first = document.querySelector('div[data-urn^="urn:li:activity"]');
    return !!first && [...first.querySelectorAll('a')]
      .some((a) => (a.getAttribute('href') ?? '').includes(sel));
  }, '/analytics/post-summary/');
  for (let attempt = 0; attempt < 3 && !(await topHasLink()); attempt++) {
    log(i18n.t('cli.analytics.linkMissing'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(POST_SEL).first().waitFor({ timeout: 25_000 }).catch(() => {});
    await sleep(4000);
  }

  // Scroll incrementally: small steps trigger LinkedIn's lazy loader more
  // reliably than jumping to the end of the page. On a stall, go up once and
  // back down, which fires the intersection observer again.
  let previous = -1;
  let stall = 0;
  for (let i = 0; i < 400; i++) {
    await page.mouse.wheel(0, 1400);
    await sleep(550);
    if (await page.locator(ANALYTICS_LINK_SEL).count() >= limit) break;
    if (i % 6 !== 5) continue;
    const seen = await page.locator(POST_SEL).count();
    if (seen !== previous) { stall = 0; previous = seen; log(i18n.t('cli.analytics.loaded', { count: seen })); continue; }
    stall += 1;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.5));
    await sleep(800);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1800);
    const after = await page.locator(POST_SEL).count();
    if (after !== previous) { stall = 0; previous = after; continue; }
    if (stall >= 10) { log(i18n.t('cli.analytics.endOfList')); break; }
  }

  const rows = await page.$$eval(POST_SEL, (nodes) => {
    const seen = new Set<string>();
    const out: { postUrn: string; textExcerpt: string; hasLink: boolean }[] = [];
    for (const node of nodes) {
      const urn = node.getAttribute('data-urn') ?? '';
      if (!urn || seen.has(urn)) continue;
      seen.add(urn);
      const hasLink = [...node.querySelectorAll('a')]
        .some((a) => (a.getAttribute('href') ?? '').includes('/analytics/post-summary/'));
      const excerpt = (node.querySelector('.update-components-text')?.textContent ?? '').trim().slice(0, 280);
      out.push({ postUrn: urn, textExcerpt: excerpt, hasLink });
    }
    return out;
  });

  return rows.filter((r) => r.hasLink).slice(0, limit).map(({ postUrn, textExcerpt }) => ({ postUrn, textExcerpt }));
}

/**
 * One read attempt: open the analytics page, wait for the sections to appear,
 * read. Kept apart from the retry logic so both can be checked on their own.
 */
export async function fetchSummaryOnce(
  page: Page,
  urn: string,
  labels: SummaryLabels,
): Promise<SummaryValues | null> {
  await page.goto(analyticsUrlFor(urn), { waitUntil: 'domcontentloaded' });
  await page.getByText(labels.fields.impressions.label, { exact: false })
    .first().waitFor({ timeout: 20_000 });
  // "Profilaktivitäten" is the bottom-most section of the page. Only once it is
  // there has everything really rendered.
  await page.getByText(labels.sections.profileActivity, { exact: false })
    .first().waitFor({ timeout: 10_000 }).catch(() => {});
  return readSummaryFromPage(page, labels, 25_000);
}

export async function runAnalyticsCollection(deps: AnalyticsCollectDeps): Promise<CollectionRun> {
  const log = deps.log ?? (() => {});
  const i18n = deps.i18n ?? createTranslator('en');
  const loggedIn = deps.loggedIn ?? ensureLoggedIn;
  const listPosts = deps.listOwnPosts ?? listOwnPostRefs;
  const fetchSummary = deps.fetchSummary ?? fetchSummaryOnce;
  const betweenPosts = deps.pacing?.betweenPosts ?? 1100;
  const betweenRetries = deps.pacing?.betweenRetries ?? 2000;

  const runId = deps.store.startRun(deps.now.toISOString());
  const warnings: string[] = [];
  let postsSeen = 0;

  try {
    if (!(await loggedIn(deps.page))) {
      deps.store.finishRun(runId, {
        finishedAt: new Date().toISOString(), status: 'error', postsSeen: 0,
        message: i18n.t('cli.notLoggedIn'),
      });
      return deps.store.getRecentRuns(1)[0];
    }

    dropExampleDataOnce(deps.store, i18n, 'analytics');

    const refs = await listPosts(deps.page, deps.limit, log, i18n);
    log(i18n.t('cli.analytics.evaluating', { count: refs.length }));

    for (const [index, ref] of refs.entries()) {
      let best: SummaryValues | null = null;
      let lastError: string | null = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const values = await fetchSummary(deps.page, ref.postUrn, deps.labels);
          // Never replace a better state with a worse one: a retry can catch a
          // page that has not finished building.
          if (completeness(values) > completeness(best)) best = values;
        } catch (err) {
          lastError = (err as Error).message;
        }
        if (isComplete(best)) break;
        if (attempt < 3) await sleep(betweenRetries);
      }

      if (!best || best.impressions === undefined) {
        warnings.push(i18n.t('cli.analytics.noImpressions', {
          urn: ref.postUrn, detail: lastError ? ` (${lastError})` : '',
        }));
        log(i18n.t('cli.analytics.postFailed', { index: index + 1, total: refs.length, urn: ref.postUrn }));
        continue;
      }

      // One run, one timestamp — same as the feed collector. Taking the wall
      // clock per post would spread the measurements of a single run over
      // several minutes even though they belong together.
      const capturedAt = deps.now.toISOString();
      if (!deps.store.data.posts.has(ref.postUrn)) {
        const post: Post = {
          postUrn: ref.postUrn,
          url: `https://www.linkedin.com/feed/update/${ref.postUrn}/`,
          postedAt: postedAtFromUrn(ref.postUrn) ?? capturedAt,
          format: 'text',
          textExcerpt: ref.textExcerpt,
          firstSeenAt: capturedAt,
        };
        deps.store.upsertPost(post);
      }
      deps.store.appendPostMetrics(toPostMetrics(ref.postUrn, best, capturedAt));
      postsSeen += 1;

      const missing = missingFields(best);
      if (missing.length) {
        warnings.push(i18n.t('cli.analytics.incomplete', { urn: ref.postUrn, fields: missing.join(', ') }));
      }
      log(i18n.t('cli.analytics.postOk', {
        index: index + 1, total: refs.length,
        impressions: best.impressions, reach: best.membersReached ?? '–',
      }) + (missing.length ? i18n.t('cli.analytics.missing', { fields: missing.join(', ') }) : ''));

      await sleep(betweenPosts);
    }

    // Not a single post read almost always means LinkedIn changed the markup or
    // the labels. Booking that as "ok" would hide the failure.
    const status = postsSeen === 0 ? 'error' : warnings.length ? 'warn' : 'ok';
    deps.store.finishRun(runId, {
      finishedAt: new Date().toISOString(),
      status,
      postsSeen,
      message: warnings.length ? warnings.join(' | ') : null,
    });
  } catch (err) {
    deps.store.finishRun(runId, {
      finishedAt: new Date().toISOString(), status: 'error', postsSeen,
      message: i18n.t('cli.analytics.failed', { message: (err as Error).message }),
    });
  }

  return deps.store.getRecentRuns(1)[0];
}
