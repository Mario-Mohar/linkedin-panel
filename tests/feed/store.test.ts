import { describe, it, expect } from 'vitest';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
import { writeFeedRun, readFeedRun } from '../../src/feed/store.js';

describe('feed store', () => {
  it('writes and reads a FeedRun; missing -> null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lip-feed-'));
    expect(readFeedRun(dir)).toBeNull();
    const run = { generatedAt: '2026-07-18T12:00:00.000Z', posts: [], drafts: {} };
    writeFeedRun(dir, run);
    expect(readFeedRun(dir)).toEqual(run);
  });
});
