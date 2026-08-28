#!/usr/bin/env node
/**
 * One command to get from a fresh clone to your own numbers.
 *
 *   npm run setup
 *
 * It checks the prerequisites, installs the browser, clears any bundled example
 * data, walks you through the login and runs the first collection. Every step
 * says what it is about to do; nothing here is irreversible without asking.
 *
 * Everything it does can also be done by hand — see the README. This script
 * exists so nobody has to read the README first.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { scriptTranslator } from './i18n.mjs';

const { t, lang } = scriptTranslator();
const dataDir = process.env.LIP_DATA_DIR || path.resolve('data');
const auto = process.argv.includes('--yes') || process.argv.includes('-y');

const say = (key, vars) => console.log(t(key, vars));
const step = (n, key, vars) => console.log(`\n[${n}/5] ${t(key, vars)}`);

// Without a terminal a question can never be answered and readline would just
// hang. Better to say so and stop than to look frozen.
if (!auto && !process.stdin.isTTY) {
  console.error(t('setup.needsTty'));
  process.exit(1);
}

async function confirm(key, vars) {
  if (auto) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(t(key, vars))).trim().toLowerCase();
  rl.close();
  return answer === '' || answer === 'j' || answer === 'y';
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  return res.status === 0;
}

// --- 1. Node version -------------------------------------------------------
step(1, 'setup.step.node');
const major = Number.parseInt(process.versions.node.split('.')[0], 10);
if (major < 20) {
  console.error(t('setup.node.tooOld', { version: process.versions.node }));
  process.exit(1);
}
say('setup.node.ok', { version: process.versions.node });

// --- 2. Browser ------------------------------------------------------------
step(2, 'setup.step.browser');
// Playwright's Chromium is the fallback when no Brave/Chromium is installed.
// Downloading it is a few hundred MB, so it is worth asking rather than
// assuming.
if (await confirm('setup.browser.ask')) {
  if (!run('npx', ['playwright', 'install', 'chromium'])) {
    console.error(t('setup.browser.failed'));
    process.exit(1);
  }
} else {
  say('setup.browser.skipped');
}

// --- 3. Example data -------------------------------------------------------
step(3, 'setup.step.data');
const marker = path.join(dataDir, '.example-data');
if (fs.existsSync(marker)) {
  if (await confirm('setup.data.ask')) {
    run(process.execPath, [path.resolve('scripts/reset-data.mjs'), '--yes']);
  } else {
    say('setup.data.kept');
  }
} else {
  say('setup.data.none');
}

// --- 4. Login --------------------------------------------------------------
step(4, 'setup.step.login');
say('setup.login.explain');
if (await confirm('setup.login.ask')) {
  if (!run('npx', ['tsx', 'src/cli/login.ts'])) {
    console.error(t('setup.login.failed'));
    process.exit(1);
  }
} else {
  say('setup.login.skipped');
  process.exit(0);
}

// --- 5. First run ----------------------------------------------------------
step(5, 'setup.step.collect');
if (await confirm('setup.collect.ask')) {
  run('npx', ['tsx', 'src/cli/collect.ts']);
  say('setup.collect.analyticsHint');
}

console.log('\n' + t('setup.done', { lang }));
