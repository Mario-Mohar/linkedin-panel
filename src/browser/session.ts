import { chromium, type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export interface Session {
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

const FEED_URL = 'https://www.linkedin.com/feed/';

/**
 * Prefers an installed Chromium-based browser so the automation drives something
 * the user already has, and so a fresh clone does not have to download a few
 * hundred MB first.
 *
 * The absolute paths differ per distribution — Debian and Fedora put Brave under
 * /opt/brave.com, Arch under /opt/brave-bin — so the PATH is searched as well
 * rather than maintaining an ever-growing list of guesses. Returns undefined
 * when nothing is found, which makes Playwright use its bundled Chromium.
 */
const BROWSER_PATHS = [
  '/opt/brave.com/brave/brave',
  '/opt/brave-bin/brave',
  '/usr/lib/brave-bin/brave',
  '/usr/bin/brave-browser-stable',
  '/usr/bin/brave-browser',
];

const BROWSER_COMMANDS = [
  'brave-browser-stable', 'brave-browser', 'brave',
  'chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome',
];

/** Looks a command up in PATH without spawning anything. */
export function whichExecutable(command: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // not here, keep looking
    }
  }
  return undefined;
}

export function resolveBrowserExecutable(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const fromEnv = env.LIP_BROWSER_PATH;
  if (fromEnv) return fromEnv;
  for (const p of BROWSER_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  for (const command of BROWSER_COMMANDS) {
    const found = whichExecutable(command, env);
    if (found) return found;
  }
  return undefined; // bundled Chromium
}

export async function launchSession(
  opts: { profileDir: string; headless: boolean; executablePath?: string },
): Promise<Session> {
  fs.mkdirSync(opts.profileDir, { recursive: true });
  const executablePath = opts.executablePath ?? resolveBrowserExecutable();
  const context = await chromium.launchPersistentContext(opts.profileDir, {
    headless: opts.headless,
    viewport: { width: 1280, height: 900 },
    locale: 'de-DE',
    // Stops Brave from restoring the previous tabs after an unclean exit and
    // from showing the "crashed" bubble — otherwise the tab count grows with
    // every run.
    args: ['--hide-crash-restore-bubble', '--disable-session-crashed-bubble'],
    ...(executablePath ? { executablePath } : {}),
  });
  // When the CLI runs through tsx/esbuild, esbuild instruments functions handed
  // to page.evaluate/$$eval with a `__name` helper that does not exist inside
  // the page ("__name is not defined"). This shim is injected as a string,
  // which esbuild leaves untouched, and defines it.
  await context.addInitScript({
    content: 'globalThis.__name = globalThis.__name || function (f) { return f; };',
  });
  const page = await collapseToSinglePage(context);
  return {
    context,
    page,
    close: async () => { await context.close(); },
  };
}

/**
 * Collapses the context down to exactly one page and returns it.
 *
 * Brave restores the previous session's tabs on startup (the profile carries a
 * `restore_on_startup` preference), so the context comes up with several pages
 * while we only use one. Leaving the rest open makes Brave persist them again
 * on close, and the tab count keeps growing run after run ("logging in opens a
 * pile of tabs"). Collapsing to a single page here means the user sees one tab
 * and at most that one gets restored next time.
 */
export async function collapseToSinglePage(context: BrowserContext): Promise<Page> {
  const pages = context.pages();
  const keep = pages[0] ?? (await context.newPage());
  for (const p of pages.slice(1)) {
    await p.close().catch(() => {});
  }
  return keep;
}

/**
 * URL based login check: logged in when the current page is the feed and was
 * NOT redirected to an auth/login/checkpoint page. LinkedIn's nav markup is not
 * reliably reachable by selector, the URL is (verified live). This function
 * does not navigate on its own.
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  return url.includes('linkedin.com/feed') && !/login|uas|checkpoint|authwall|signup/.test(url);
}

/**
 * Navigates to the feed and checks the login state. Used by the collector as
 * the default login check. With a signed-out session LinkedIn redirects away
 * from the feed to an auth page, so isLoggedIn returns false.
 */
export async function ensureLoggedIn(page: Page): Promise<boolean> {
  await page.goto(FEED_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2500);
  return isLoggedIn(page);
}

/**
 * Reads the language LinkedIn's own interface is rendered in.
 *
 * LinkedIn sets it on the root element (`<html lang="de">`). Detecting it beats
 * asking the user to configure it: getting it wrong does not throw, it silently
 * produces empty numbers, and someone who just cloned the repo has no reason to
 * suspect a language setting.
 *
 * Returns null when the page says nothing useful — the caller then falls back
 * rather than guessing.
 */
export async function detectInterfaceLang(page: Page): Promise<string | null> {
  const raw = await page.evaluate(() => document.documentElement.lang || '').catch(() => '');
  const code = raw.trim().slice(0, 2).toLowerCase();
  return /^[a-z]{2}$/.test(code) ? code : null;
}
