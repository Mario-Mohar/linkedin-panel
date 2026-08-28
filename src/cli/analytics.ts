import fs from 'node:fs';
import { loadConfig } from '../config.js';
import { openStore } from '../store/store.js';
import { launchSession, ensureLoggedIn } from '../browser/session.js';
import { runAnalyticsCollection, analyticsUrlFor, listOwnPostRefs } from '../collector/analytics-collector.js';
import { isVerified } from '../parser/summary-labels.js';
import { resolveLabels } from './li-lang.js';
import { parseSummary, missingFields } from '../parser/summary-parser.js';
import { createTranslator } from '../i18n/index.js';

const cfg = loadConfig();
const i18n = createTranslator(cfg.uiLang);
const log = (m: string) => console.log(`[analytics] ${m}`);

/**
 * Diagnostic mode. The analytics page has no stable selectors, everything hangs
 * off the labels. Anyone running a different interface language therefore needs
 * a way to see the real labels without digging through the code.
 */
const dumpIndex = process.argv.indexOf('--dump-page');
const store = openStore(cfg.dataDir, cfg.machineId);
const session = await launchSession({ profileDir: cfg.browserProfileDir, headless: dumpIndex === -1 });

try {
  const loggedIn = await ensureLoggedIn(session.page);
  const labels = await resolveLabels({
    page: session.page, liLang: cfg.liLang, labelsFile: cfg.liLabelsFile, i18n, cmd: 'analytics',
  });
  if (!isVerified(labels) && !cfg.liLabelsFile) {
    console.warn(i18n.t('cli.analytics.unverifiedLabels', { lang: labels.lang }));
  }

  if (dumpIndex !== -1) {
    const refs = await listOwnPostRefs(session.page, 1, log, i18n);
    if (!refs.length) throw new Error(i18n.t('cli.analytics.noPostFound'));
    await session.page.goto(analyticsUrlFor(refs[0].postUrn), { waitUntil: 'domcontentloaded' });
    await session.page.waitForTimeout(8000);
    const text = await session.page.evaluate(() => document.body.innerText);
    const next = process.argv[dumpIndex + 1];
    const out = next && !next.startsWith('--') ? next : 'analytics-page.txt';
    fs.writeFileSync(out, text);
    const found = parseSummary(text, labels);
    console.log(i18n.t('cli.analytics.dumpWritten', { file: out }));
    console.log(i18n.t('cli.analytics.dumpRecognised', {
      lang: labels.lang, fields: Object.keys(found).join(', ') || '–',
    }));
    console.log(i18n.t('cli.analytics.dumpMissing', { fields: missingFields(found).join(', ') || '–' }));
  } else {
    const run = await runAnalyticsCollection({
      store, page: session.page, limit: cfg.analyticsLimit, now: new Date(), labels, i18n, log,
      loggedIn: async () => loggedIn,
    });
    console.log(i18n.t('cli.analytics.done', { status: run.status, posts: run.postsSeen })
      + (run.message ? ` msg=${run.message}` : ''));
    process.exitCode = run.status === 'error' ? 1 : 0;
  }
} finally {
  await session.close();
}
