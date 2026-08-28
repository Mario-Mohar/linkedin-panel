import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
import type { Server } from 'node:http';
import { createServer, resolveStaticFile } from '../../src/server/server.js';
import { openStore } from '../../src/store/store.js';
import { loadConfig } from '../../src/config.js';
import { writeFeedRun } from '../../src/feed/store.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lip-srv-'));
const store = openStore(dir, 'test');
store.appendProfileMetrics({ capturedAt: '2026-07-18T00:00:00.000Z', followers: 563, connections: 491 });
let server: Server; let port: number;

beforeAll(async () => {
  server = createServer({ store, cfg: loadConfig({ LIP_DATA_DIR: dir }), webDir: path.resolve('src/web') });
  writeFeedRun(dir, { generatedAt: '2026-07-18T12:00:00.000Z', posts: [], drafts: {} });
  await new Promise<void>((r) => server.listen(0, r));
  port = (server.address() as { port: number }).port;
});
afterAll(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const get = async (pathname: string) => {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`);
  return { status: res.status, body: await res.text() };
};

describe('server', () => {
  it('GET /api/data returns valid dashboard JSON', async () => {
    const { status, body } = await get('/api/data');
    expect(status).toBe(200);
    const data = JSON.parse(body);
    expect(data.kpis.followers).toBe(563);
    expect(Array.isArray(data.posts)).toBe(true);
  });
  it('GET / returns the HTML page', async () => {
    const { status, body } = await get('/');
    expect(status).toBe(200);
    expect(body).toContain('LinkedIn Panel');
  });
  it('GET /../src/server/server.ts (path traversal) is rejected', async () => {
    // Note: fetch/WHATWG URL normalization may collapse the ".." before the
    // request even reaches the server, so this HTTP-level check alone only
    // documents fetch/URL behavior. See resolveStaticFile unit tests below
    // for the real, discriminating guard coverage.
    expect((await get('/../src/server/server.ts')).status).toBe(404);
  });
  it('GET /api/feed returns the FeedRun (or empty)', async () => {
    const { status, body } = await get('/api/feed');
    expect(status).toBe(200);
    const data = JSON.parse(body);
    expect(Array.isArray(data.posts)).toBe(true);
  });
});

describe('resolveStaticFile (path containment)', () => {
  const root = '/srv/web';
  it('allows legitimate files', () => {
    expect(resolveStaticFile(root, '/')).toBe(path.resolve(root, 'index.html'));
    expect(resolveStaticFile(root, '/app.js')).toBe(path.resolve(root, 'app.js'));
  });
  it('rejects a sibling-prefix escape (the case a bare startsWith would let through)', () => {
    // /srv/web-secret is NOT inside /srv/web but shares the prefix "web"
    expect(resolveStaticFile(root, '/../web-secret/passwd')).toBeNull();
  });
  it('rejects a .. escape', () => {
    expect(resolveStaticFile(root, '/a/../../etc/passwd')).toBeNull();
    expect(resolveStaticFile(root, '/../../etc/passwd')).toBeNull();
  });
});
