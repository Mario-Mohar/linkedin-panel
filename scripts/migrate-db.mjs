// Einmalige Migration: data/panel.db -> NDJSON-Shard des aktuellen Rechners.
// Uses better-sqlite3 (still installed). Afterwards better-sqlite3 can be removed.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.resolve('data/panel.db');
if (!fs.existsSync(dbPath)) { console.log('Keine panel.db — nichts zu migrieren.'); process.exit(0); }
const { default: Database } = await import('better-sqlite3');
const db = new Database(dbPath, { readonly: true });
const machine = (process.env.LIP_MACHINE_ID || os.hostname() || 'unknown')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';

const postedAtFromUrn = (urn) => {
  const id = String(urn).split(':').pop();
  if (!/^\d{6,}$/.test(id)) return null;
  try { const ms = Number(BigInt(id) >> 22n); return (Number.isFinite(ms) && ms > 0) ? new Date(ms).toISOString() : null; }
  catch { return null; }
};
const write = (kind, rows) => {
  if (!rows.length) return;
  const d = path.join('data', kind); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, `${machine}.ndjson`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
};

write('posts', db.prepare('SELECT * FROM posts').all().map((p) => ({
  postUrn: p.post_urn, url: p.url, postedAt: postedAtFromUrn(p.post_urn) ?? p.posted_at,
  format: p.format, textExcerpt: p.text_excerpt, firstSeenAt: p.first_seen_at,
})));
write('metrics', db.prepare('SELECT * FROM post_metrics').all().map((m) => ({
  postUrn: m.post_urn, capturedAt: m.captured_at, impressions: m.impressions,
  reactionsTotal: m.reactions_total, reactionsBreakdown: JSON.parse(m.reactions_breakdown),
  comments: m.comments, reposts: m.reposts,
})));
write('profile', db.prepare('SELECT * FROM profile_metrics').all().map((p) => ({
  capturedAt: p.captured_at, followers: p.followers, connections: p.connections,
})));
db.close();
console.log(`Migration fertig -> data/*/${machine}.ndjson`);
