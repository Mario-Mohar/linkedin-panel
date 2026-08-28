import { describe, it, expect, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { Page } from 'playwright';
import { launchSession, isLoggedIn, collapseToSinglePage } from '../../src/browser/session.js';

// isLoggedIn is a pure URL predicate — testable with a fake page object that
// only has .url(), no real browser needed.
const fakePage = (url: string) => ({ url: () => url }) as unknown as Page;

describe('isLoggedIn (URL predicate)', () => {
  it('true on the feed', async () => {
    expect(await isLoggedIn(fakePage('https://www.linkedin.com/feed/'))).toBe(true);
  });
  it('false on about:blank', async () => {
    expect(await isLoggedIn(fakePage('about:blank'))).toBe(false);
  });
  it('false on login/authwall/checkpoint', async () => {
    expect(await isLoggedIn(fakePage('https://www.linkedin.com/login'))).toBe(false);
    expect(await isLoggedIn(fakePage('https://www.linkedin.com/authwall'))).toBe(false);
    expect(await isLoggedIn(fakePage('https://www.linkedin.com/checkpoint/challenge/'))).toBe(false);
  });
});

describe('collapseToSinglePage', () => {
  // Fake context: Brave restores the previous tabs on startup, so the context
  // comes up with several pages. collapseToSinglePage has to close all but one,
  // otherwise the tab count grows from run to run.
  const fakeCtx = (n: number) => {
    const closed: number[] = [];
    const pages = Array.from({ length: n }, (_, i) => ({
      url: () => `about:blank#${i}`,
      close: async () => { closed.push(i); },
    }));
    return {
      ctx: { pages: () => pages.filter((_, i) => !closed.includes(i)) } as any,
      closed,
      pages,
    };
  };

  it('closes all pages but the first when several tabs were restored', async () => {
    const { ctx, closed } = fakeCtx(8);
    const kept = await collapseToSinglePage(ctx);
    expect(closed).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(kept.url()).toBe('about:blank#0');
  });

  it('leaves a single tab untouched', async () => {
    const { ctx, closed } = fakeCtx(1);
    const kept = await collapseToSinglePage(ctx);
    expect(closed).toEqual([]);
    expect(kept.url()).toBe('about:blank#0');
  });

  it('creates a page when the context starts with none', async () => {
    let created = 0;
    const ctx = {
      pages: () => [],
      newPage: async () => { created++; return { url: () => 'about:blank' }; },
    } as any;
    const kept = await collapseToSinglePage(ctx);
    expect(created).toBe(1);
    expect(kept.url()).toBe('about:blank');
  });
});

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lip-profile-'));

describe('browser session', () => {
  it('starts headless and detects "not logged in" on a blank page', async () => {
    const session = await launchSession({ profileDir, headless: true });
    await session.page.goto('about:blank');
    expect(await isLoggedIn(session.page)).toBe(false);
    await session.close();
  }, 60_000);

  afterAll(() => { fs.rmSync(profileDir, { recursive: true, force: true }); });
});
