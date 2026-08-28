#!/usr/bin/env node
/**
 * Empties the data directory so the panel starts on your own numbers.
 *
 * The repository can ship example data so the dashboard shows something right
 * after cloning. Anyone using it with their own account throws that away here:
 *
 *   npm run reset             # asks first
 *   npm run reset -- --yes    # no question asked, example data only
 *   npm run reset -- --yes --force   # also deletes collected data
 *
 * The browser session (browser-profile/) is left alone — a reset should not
 * mean having to log in again.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { scriptTranslator } from './i18n.mjs';

const { t } = scriptTranslator();

const dataDir = process.env.LIP_DATA_DIR || path.resolve('data');
const KINDS = ['posts', 'metrics', 'profile', 'runs', 'feed'];
const MARKER = path.join(dataDir, '.example-data');

function collectTargets() {
  const files = [];
  for (const kind of KINDS) {
    const dir = path.join(dataDir, kind);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.ndjson') || name.endsWith('.json')) files.push(path.join(dir, name));
    }
  }
  if (fs.existsSync(MARKER)) files.push(MARKER);
  // The old SQLite file from before the NDJSON shards, if it is still around.
  for (const leftover of ['panel.db', 'panel.db-journal', 'panel.db-wal', 'panel.db-shm']) {
    const p = path.join(dataDir, leftover);
    if (fs.existsSync(p)) files.push(p);
  }
  return files;
}

const targets = collectTargets();

if (targets.length === 0) {
  console.log(t('reset.nothing'));
  process.exit(0);
}

const hadExample = fs.existsSync(MARKER);
console.log(hadExample ? t('reset.exampleFound') : t('reset.realData'));
for (const f of targets) console.log(`  - ${path.relative(process.cwd(), f)}`);

const auto = process.argv.includes('--yes') || process.argv.includes('-y');
const force = process.argv.includes('--force');

// Deleting collected data without being asked has to be spelled out. `--yes`
// on its own is meant for the bundled example data; a real history is months of
// measurements that LinkedIn does not hand out a second time.
if (auto && !hadExample && !force) {
  console.error(t('reset.needsForce'));
  process.exit(2);
}

if (!auto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('\n' + t('reset.confirm', { count: targets.length }))).trim().toLowerCase();
  rl.close();
  if (answer !== 'j' && answer !== 'y') {
    console.log(t('reset.aborted'));
    process.exit(1);
  }
}

for (const f of targets) fs.rmSync(f);
console.log(t('reset.done', { count: targets.length }));
