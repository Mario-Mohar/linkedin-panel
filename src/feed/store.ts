import fs from 'node:fs';
import path from 'node:path';
import type { FeedRun } from './types.js';

export function writeFeedRun(dataDir: string, run: FeedRun): void {
  const dir = path.join(dataDir, 'feed');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(run, null, 2));
}

export function readFeedRun(dataDir: string): FeedRun | null {
  const file = path.join(dataDir, 'feed', 'latest.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as FeedRun; }
  catch { return null; }
}
