import { loadConfig } from '../config.js';
import { openStore } from '../store/store.js';
import { createTranslator } from '../i18n/index.js';
import { exitIfHelp } from './help.js';

const cfg = loadConfig();
const i18n = createTranslator(cfg.uiLang);
exitIfHelp('status', i18n);
const store = openStore(cfg.dataDir, cfg.machineId);
console.log(i18n.t('cli.status.posts', { count: store.data.posts.size }));
console.log(i18n.t('cli.status.metrics', { count: store.data.metrics.length }));
console.log(`\n${i18n.t('cli.status.recentRuns')}`);
for (const run of store.getRecentRuns(10)) {
  const msg = run.message ? ` — ${run.message}` : '';
  console.log(`  [${run.status.toUpperCase()}] ${run.startedAt}  posts=${run.postsSeen}${msg}`);
}
