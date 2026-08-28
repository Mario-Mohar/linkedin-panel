import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { openStore } from '../../src/store/store.js';
import { runCollection } from '../../src/collector/collector.js';
import type { RawPost, RawProfile } from '../../src/parser/types.js';

const mkStore = () => openStore(fs.mkdtempSync(path.join(os.tmpdir(), 'lip-col-')), 'test');

const now = new Date('2026-07-18T12:00:00.000Z');
const rawPost: RawPost = {
  postUrn: 'urn:li:activity:7', url: 'https://x/7', postedAtText: '1 Std.', textExcerpt: 'Hi',
  hasImage: false, hasVideo: false, hasDocument: false, hasPoll: false, isArticle: false,
  impressionsText: '100', reactionsTotalText: '10', reactionsBreakdown: { like: '10' },
  commentsText: '2', repostsText: '0',
};
const rawProfile: RawProfile = { followersText: '1.000 Follower:innen', connectionsText: null };
const fakePage = {} as any;

describe('runCollection', () => {
  it('success: writes posts, metrics, profile and an ok run', async () => {
    const store = mkStore();
    const run = await runCollection({
      store, page: fakePage, limit: 35, now,
      loggedIn: async () => true,
      fetchPosts: async () => [rawPost],
      fetchProfile: async () => rawProfile,
    });
    expect(run.status).toBe('ok');
    expect(run.postsSeen).toBe(1);
    expect(store.data.posts.size).toBe(1);
    expect(store.data.metrics.length).toBe(1);
    expect(store.getRecentRuns(1)[0].status).toBe('ok');
  });

  it('not logged in: error run with a clear message', async () => {
    const store = mkStore();
    const run = await runCollection({
      store, page: fakePage, limit: 35, now,
      loggedIn: async () => false,
      fetchPosts: async () => [rawPost],
      fetchProfile: async () => rawProfile,
    });
    expect(run.status).toBe('error');
    expect(run.message).toMatch(/login/i);
    expect(store.data.posts.size).toBe(0);
  });

  it('one post throws -> warn, the others are stored', async () => {
    const store = mkStore();
    const bad = { ...rawPost, postUrn: '' };
    const run = await runCollection({
      store, page: fakePage, limit: 35, now,
      loggedIn: async () => true,
      fetchPosts: async () => [rawPost, bad as RawPost],
      fetchProfile: async () => rawProfile,
    });
    expect(run.status).toBe('warn');
    expect(store.data.posts.size).toBe(1);
  });

  it('loggedIn throws -> error run instead of an uncaught crash', async () => {
    const store = mkStore();
    const run = await runCollection({
      store, page: fakePage, limit: 35, now,
      loggedIn: async () => { throw new Error('session check kaputt'); },
      fetchPosts: async () => [rawPost],
      fetchProfile: async () => rawProfile,
    });
    expect(run.status).toBe('error');
    expect(store.data.posts.size).toBe(0);
    expect(store.getRecentRuns(1)[0].status).toBe('error');
  });
});

describe('collectRawProfile pattern', () => {
  // The finder that picks the profile line out of the page text. Rebuilt here
  // because the original runs inside page.evaluate.
  const near = (word: string) => new RegExp(`\\d[\\d.,]*\\+?\\s*${word}`, 'i');

  it('finds a plain count', () => {
    expect(near('Follower').test('603 Follower:innen')).toBe(true);
    expect(near('Kontakt').test('491 Kontakte')).toBe(true);
  });

  it('finds the capped "500+" form', () => {
    // This is the case that silently produced null: the "+" broke the pattern.
    expect(near('Kontakt').test('500+ Kontakte')).toBe(true);
  });

  it('finds counts with thousands separators', () => {
    expect(near('Follower').test('7.892 Follower:innen')).toBe(true);
  });

  it('does not match a line without a number', () => {
    expect(near('Kontakt').test('Kontaktinformationen')).toBe(false);
  });
});
