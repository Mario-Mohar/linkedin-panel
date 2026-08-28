import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { openStore } from '../store/store.js';
import { createServer } from '../server/server.js';
import { Runner } from '../server/runner.js';
import { createTranslator } from '../i18n/index.js';

const cfg = loadConfig();
const store = openStore(cfg.dataDir, cfg.machineId);
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
const runner = new Runner();
const server = createServer({ store, cfg, webDir, runner });
// A collector started from the panel must not outlive the panel.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { runner.stop(); process.exit(0); });
}
server.listen(cfg.dashboardPort, '127.0.0.1', () => {
  console.log(createTranslator(cfg.uiLang).t('cli.dashboard.listening', {
    url: `http://localhost:${cfg.dashboardPort}`,
  }));
});
