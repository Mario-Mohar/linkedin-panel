import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Post, PostMetrics, ProfileMetrics, CollectionRun, RunStatus } from '../parser/types.js';

export interface LoadedData {
  posts: Map<string, Post>;
  metrics: PostMetrics[];
  profile: ProfileMetrics[];
}
export interface Store {
  dataDir: string;
  machineId: string;
  data: LoadedData;
  upsertPost(post: Post): void;
  appendPostMetrics(m: PostMetrics): void;
  appendProfileMetrics(m: ProfileMetrics): void;
  startRun(startedAt: string): string;
  finishRun(id: string, patch: { finishedAt: string; status: RunStatus; postsSeen: number; message: string | null }): void;
  getRecentRuns(limit: number): CollectionRun[];
  /**
   * Re-reads the shard files when they changed on disk.
   *
   * The collectors run as their own processes, so anything they append is
   * invisible to a long-lived dashboard that only read the files at startup.
   * Without this the panel shows the numbers from whenever it was launched and
   * a finished run appears to have done nothing.
   */
  reload(): boolean;
  /**
   * Removes the bundled example data, once, on the first real collection.
   *
   * Without this a newcomer who just runs `npm run collect` ends up with their
   * own numbers merged into invented ones, and the averages are quietly wrong.
   * Returns the files it deleted, so the caller can say what happened.
   */
  dropExampleData(): string[];
}

type RunRec =
  | { id: string; phase: 'start'; startedAt: string }
  | { id: string; phase: 'finish'; finishedAt: string; status: RunStatus; postsSeen: number; message: string | null };

/** Marker written by scripts/make-example-data.mjs next to the example shards. */
export const EXAMPLE_MARKER = '.example-data';
export const EXAMPLE_SHARD = 'example';

function shardsFor(dataDir: string, kind: string): string[] {
  const d = path.join(dataDir, kind);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.ndjson')).map((f) => path.join(d, f));
}

function readLines<T>(file: string): T[] {
  const out: T[] = [];
  const raw = fs.readFileSync(file, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t) as T); }
    catch { console.warn(`[store] skipped broken line in ${path.basename(file)}`); }
  }
  return out;
}

function appendLine(dataDir: string, kind: string, machineId: string, obj: unknown): void {
  const d = path.join(dataDir, kind);
  fs.mkdirSync(d, { recursive: true });
  fs.appendFileSync(path.join(d, `${machineId}.ndjson`), JSON.stringify(obj) + '\n');
}

function postEquivalent(a: Post, b: Post): boolean {
  return a.url === b.url && a.postedAt === b.postedAt && a.format === b.format && a.textExcerpt === b.textExcerpt;
}

/**
 * Cheap fingerprint of the shard files: path, size and modification time. Lets
 * reload() skip the parsing when nothing has changed, which matters because the
 * dashboard checks on every request.
 */
function shardSignature(dataDir: string): string {
  const parts: string[] = [];
  for (const kind of ['posts', 'metrics', 'profile']) {
    for (const file of shardsFor(dataDir, kind)) {
      try {
        const stat = fs.statSync(file);
        parts.push(`${file}:${stat.size}:${stat.mtimeMs}`);
      } catch {
        // file vanished between listing and stat, treat as changed
        parts.push(`${file}:gone`);
      }
    }
  }
  return parts.sort().join('|');
}

export function openStore(dataDir: string, machineId: string): Store {
  const posts = new Map<string, Post>();
  const metrics: PostMetrics[] = [];
  const profile: ProfileMetrics[] = [];
  const data: LoadedData = { posts, metrics, profile };

  // Fills the containers in place, so anything holding a reference to `data`
  // keeps seeing the current contents after a reload.
  function readAll(): void {
    posts.clear();
    metrics.length = 0;
    profile.length = 0;
    for (const f of shardsFor(dataDir, 'posts')) for (const p of readLines<Post>(f)) posts.set(p.postUrn, p);
    for (const f of shardsFor(dataDir, 'metrics')) metrics.push(...readLines<PostMetrics>(f));
    for (const f of shardsFor(dataDir, 'profile')) profile.push(...readLines<ProfileMetrics>(f));
  }

  readAll();
  let signature = shardSignature(dataDir);

  return {
    dataDir, machineId, data,
    upsertPost(post) {
      const existing = data.posts.get(post.postUrn);
      if (existing && postEquivalent(existing, post)) return; // no append when nothing changed
      const toStore = existing ? { ...post, firstSeenAt: existing.firstSeenAt } : post;
      appendLine(dataDir, 'posts', machineId, toStore);
      data.posts.set(post.postUrn, toStore);
      signature = shardSignature(dataDir);
    },
    appendPostMetrics(m) {
      appendLine(dataDir, 'metrics', machineId, m);
      data.metrics.push(m);
      signature = shardSignature(dataDir);
    },
    appendProfileMetrics(m) {
      appendLine(dataDir, 'profile', machineId, m);
      data.profile.push(m);
      signature = shardSignature(dataDir);
    },
    startRun(startedAt) {
      const id = crypto.randomUUID();
      appendLine(dataDir, 'runs', machineId, { id, phase: 'start', startedAt } as RunRec);
      return id;
    },
    finishRun(id, patch) {
      appendLine(dataDir, 'runs', machineId, { id, phase: 'finish', ...patch } as RunRec);
    },
    reload() {
      const current = shardSignature(dataDir);
      if (current === signature) return false;
      readAll();
      signature = current;
      return true;
    },
    dropExampleData() {
      const marker = path.join(dataDir, EXAMPLE_MARKER);
      if (!fs.existsSync(marker)) return [];
      const removed: string[] = [];
      for (const kind of ['posts', 'metrics', 'profile', 'runs']) {
        const file = path.join(dataDir, kind, `${EXAMPLE_SHARD}.ndjson`);
        if (!fs.existsSync(file)) continue;
        fs.rmSync(file);
        removed.push(file);
      }
      fs.rmSync(marker);
      removed.push(marker);
      readAll();
      signature = shardSignature(dataDir);
      return removed;
    },
    getRecentRuns(limit) {
      const byId = new Map<string, CollectionRun>();
      const order: string[] = [];
      for (const f of shardsFor(dataDir, 'runs')) {
        for (const r of readLines<RunRec>(f)) {
          if (r.phase === 'start') {
            if (!byId.has(r.id)) { order.push(r.id); byId.set(r.id, { startedAt: r.startedAt, finishedAt: null, status: 'error', postsSeen: 0, message: null }); }
            else byId.get(r.id)!.startedAt = r.startedAt;
          } else {
            const cur = byId.get(r.id) ?? { startedAt: r.finishedAt, finishedAt: null, status: 'error' as RunStatus, postsSeen: 0, message: null };
            if (!byId.has(r.id)) order.push(r.id);
            byId.set(r.id, { ...cur, finishedAt: r.finishedAt, status: r.status, postsSeen: r.postsSeen, message: r.message });
          }
        }
      }
      return order.map((id) => byId.get(id)!).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, limit);
    },
  };
}
