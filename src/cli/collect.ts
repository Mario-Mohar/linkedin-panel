import { loadConfig } from '../config.js';
import { openStore } from '../store/store.js';
import { launchSession, ensureLoggedIn } from '../browser/session.js';
import { runCollection } from '../collector/collector.js';
import { createTranslator } from '../i18n/index.js';
import { resolveLabels } from './li-lang.js';

const cfg = loadConfig();
const store = openStore(cfg.dataDir, cfg.machineId);
const i18n = createTranslator(cfg.uiLang);
const session = await launchSession({ profileDir: cfg.browserProfileDir, headless: true });
try {
  // Navigate first so the language can be detected off the real page.
  const loggedIn = await ensureLoggedIn(session.page);
  const labels = await resolveLabels({
    page: session.page, liLang: cfg.liLang, labelsFile: cfg.liLabelsFile, i18n, cmd: 'collect',
  });
  const run = await runCollection({
    store, page: session.page, limit: cfg.postLimit, now: new Date(), i18n, labels,
    loggedIn: async () => loggedIn,
  });
  console.log(i18n.t('cli.collect.done', { status: run.status, posts: run.postsSeen })
    + (run.message ? ` msg=${run.message}` : ''));
  process.exitCode = run.status === 'error' ? 1 : 0;
} finally {
  await session.close();
}
