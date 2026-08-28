import { describe, it, expect, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { openStore } from '../../src/store/store.js';
import type { Post, PostMetrics } from '../../src/parser/types.js';

const post: Post = {
  postUrn: 'urn:li:activity:1', url: 'https://x/1', postedAt: '2026-07-18T08:00:00.000Z',
  format: 'text', textExcerpt: 'Hallo', firstSeenAt: '2026-07-18T09:00:00.000Z',
};
const metric = (capturedAt: string): PostMetrics => ({
  postUrn: 'urn:li:activity:1', capturedAt, impressions: null, reactionsTotal: 10,
  reactionsBreakdown: { like: 10, celebrate: 0, support: 0, love: 0, insightful: 0, funny: 0 },
  comments: 3, reposts: 1,
});

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lip-store-')); });

describe('store reload', () => {
  it('picks up lines another process appended', () => {
    // The collectors run as their own processes. A dashboard that only read the
    // files at startup would show stale numbers after every run.
    const reader = openStore(dir, 'a');
    expect(reader.data.profile).toHaveLength(0);

    const writer = openStore(dir, 'b');
    writer.appendProfileMetrics({ capturedAt: '2026-08-28T10:00:00.000Z', followers: 603, connections: 500 });

    expect(reader.reload()).toBe(true);
    expect(reader.data.profile).toHaveLength(1);
    expect(reader.data.profile[0].followers).toBe(603);
  });

  it('reports no change when nothing was written', () => {
    const store = openStore(dir, 'a');
    store.appendProfileMetrics({ capturedAt: '2026-08-28T10:00:00.000Z', followers: 1, connections: null });
    expect(store.reload()).toBe(false);
  });

  it('does not duplicate its own appends after a reload', () => {
    const store = openStore(dir, 'a');
    store.appendProfileMetrics({ capturedAt: '2026-08-28T10:00:00.000Z', followers: 1, connections: null });
    store.reload();
    expect(store.data.profile).toHaveLength(1);
  });
});

describe('store', () => {
  it('upsertPost appends only when new or changed; dedupes by urn on reload', () => {
    const s1 = openStore(dir, 'hostA');
    s1.upsertPost(post);
    s1.upsertPost(post); // unchanged -> no second append
    const lines = fs.readFileSync(path.join(dir, 'posts', 'hostA.ndjson'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    s1.upsertPost({ ...post, textExcerpt: 'Geändert' }); // changed -> append
    const s2 = openStore(dir, 'hostA');
    expect(s2.data.posts.get(post.postUrn)!.textExcerpt).toBe('Geändert'); // the last one wins
    expect(s2.data.posts.size).toBe(1);
  });

  it('metrics are append-only (a time series)', () => {
    const s = openStore(dir, 'hostA');
    s.upsertPost(post);
    s.appendPostMetrics(metric('2026-07-18T09:00:00.000Z'));
    s.appendPostMetrics(metric('2026-07-18T12:00:00.000Z'));
    expect(openStore(dir, 'hostA').data.metrics).toHaveLength(2);
  });

  it('merges across shards from several machines', () => {
    openStore(dir, 'hostA').appendPostMetrics(metric('2026-07-18T09:00:00.000Z'));
    openStore(dir, 'hostB').appendPostMetrics(metric('2026-07-18T10:00:00.000Z'));
    expect(openStore(dir, 'hostA').data.metrics).toHaveLength(2); // sieht beide Shards
  });

  it('skips broken lines', () => {
    fs.mkdirSync(path.join(dir, 'profile'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'profile', 'hostA.ndjson'),
      '{"capturedAt":"2026-07-18T09:00:00.000Z","followers":563,"connections":491}\nKAPUTT\n');
    expect(openStore(dir, 'hostA').data.profile).toHaveLength(1);
  });

  it('run lifecycle: start -> finish; crashed (start only) stays error', () => {
    const s = openStore(dir, 'hostA');
    const id = s.startRun('2026-07-18T09:00:00.000Z');
    s.finishRun(id, { finishedAt: '2026-07-18T09:01:00.000Z', status: 'ok', postsSeen: 35, message: null });
    const s2 = openStore(dir, 'hostA');
    const runs = s2.getRecentRuns(5);
    expect(runs[0].status).toBe('ok');
    expect(runs[0].postsSeen).toBe(35);
    // simulate a crash: only a start record
    const s3 = openStore(dir, 'hostA');
    s3.startRun('2026-07-18T10:00:00.000Z');
    expect(openStore(dir, 'hostA').getRecentRuns(1)[0].status).toBe('error');
  });
});

describe('dropExampleData', () => {
  const asPost = (urn: string): Post => ({ ...post, postUrn: urn });

  const writeExample = (d: string) => {
    fs.mkdirSync(path.join(d, 'posts'), { recursive: true });
    fs.mkdirSync(path.join(d, 'metrics'), { recursive: true });
    fs.writeFileSync(path.join(d, 'posts', 'example.ndjson'), JSON.stringify(asPost('example-1')) + '\n');
    fs.writeFileSync(path.join(d, 'metrics', 'example.ndjson'), JSON.stringify(metric('2026-01-01T00:00:00.000Z')) + '\n');
    fs.writeFileSync(path.join(d, '.example-data'), 'marker\n');
  };

  it('removes the example shards and the marker', () => {
    // Otherwise a newcomer who just runs collect gets their own numbers merged
    // into invented ones, and every average is quietly wrong.
    writeExample(dir);
    const store = openStore(dir, 'own');
    expect(store.data.posts.size).toBe(1);

    const removed = store.dropExampleData();

    expect(removed).toHaveLength(3);
    expect(fs.existsSync(path.join(dir, '.example-data'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'posts', 'example.ndjson'))).toBe(false);
    expect(store.data.posts.size).toBe(0);
  });

  it('does nothing without the marker, so real data is never touched', () => {
    const store = openStore(dir, 'own');
    store.upsertPost(asPost('mine'));
    expect(store.dropExampleData()).toEqual([]);
    expect(store.data.posts.size).toBe(1);
  });

  it('is safe to call twice', () => {
    writeExample(dir);
    const store = openStore(dir, 'own');
    expect(store.dropExampleData()).toHaveLength(3);
    expect(store.dropExampleData()).toEqual([]);
  });

  it('leaves a shard that only happens to sit next to the example one', () => {
    writeExample(dir);
    fs.writeFileSync(path.join(dir, 'posts', 'own.ndjson'), JSON.stringify(asPost('mine')) + '\n');
    const store = openStore(dir, 'own');
    store.dropExampleData();
    expect(fs.existsSync(path.join(dir, 'posts', 'own.ndjson'))).toBe(true);
    expect(store.data.posts.has('mine')).toBe(true);
  });
});
