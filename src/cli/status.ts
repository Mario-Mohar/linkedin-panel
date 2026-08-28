import { loadConfig } from '../config.js';
import { openStore } from '../store/store.js';

const cfg = loadConfig();
const store = openStore(cfg.dataDir, cfg.machineId);
console.log(`Posts:         ${store.data.posts.size}`);
console.log(`Metrik-Zeilen: ${store.data.metrics.length}`);
console.log('\nLetzte Läufe:');
for (const run of store.getRecentRuns(10)) {
  const msg = run.message ? ` — ${run.message}` : '';
  console.log(`  [${run.status.toUpperCase()}] ${run.startedAt}  posts=${run.postsSeen}${msg}`);
}
