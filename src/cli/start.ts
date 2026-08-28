import { loadConfig } from '../config.js';
import { openStore } from '../store/store.js';
import { launchSession } from '../browser/session.js';
import { runCollection } from '../collector/collector.js';
import { startScheduler } from '../scheduler/scheduler.js';

const cfg = loadConfig();
const store = openStore(cfg.dataDir, cfg.machineId);

const tick = async (): Promise<number[]> => {
  const session = await launchSession({ profileDir: cfg.browserProfileDir, headless: true });
  try {
    const now = new Date();
    const run = await runCollection({ store, page: session.page, limit: cfg.postLimit, now });
    console.log(`[tick] status=${run.status} posts=${run.postsSeen}`);
    return [...store.data.posts.values()].map((p) => (now.getTime() - new Date(p.postedAt).getTime()) / 60_000);
  } finally { await session.close(); }
};

const handle = startScheduler({ cfg, tick });
console.log('Scheduler läuft. Beenden mit Strg+C.');
const shutdown = () => { handle.stop(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
