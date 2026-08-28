import { loadConfig } from '../config.js';
import { openStore } from '../store/store.js';
import { launchSession } from '../browser/session.js';
import { runFeed } from '../feed/collector.js';
import { writeFeedRun } from '../feed/store.js';
import { runClaude } from '../ai/claude.js';
import { relevancePrompt, commentDraftPrompt } from '../ai/prompts.js';
import { parseRelevance, parseDrafts, hasRelevanceArray } from '../ai/parse.js';

import { getOwnName } from '../collector/collector.js';

const cfg = loadConfig();
const store = openStore(cfg.dataDir, cfg.machineId);
const ownPosts = [...store.data.posts.values()]
  .sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1))
  .map((p) => p.textExcerpt).filter(Boolean).slice(0, 5);
const ownTerms = Array.from(new Set(ownPosts.join(' ').toLowerCase().match(/[a-zäöü]{4,}/g) ?? [])).slice(0, 40);

const session = await launchSession({ profileDir: cfg.browserProfileDir, headless: false });
try {
  const ownName = await getOwnName(session.page).catch(() => '');
  const run = await runFeed({
    page: session.page, ownName, ownPosts, ownTerms, now: new Date(), cfg, limit: 25,
    relevance: async (posts, own) => {
      const out = await runClaude(relevancePrompt(posts, own));
      if (!hasRelevanceArray(out)) throw new Error('Keine Relevanz-Werte in der KI-Antwort');
      return parseRelevance(out, posts.length);
    },
    draft: async (post, own) => parseDrafts(await runClaude(commentDraftPrompt(post, own))),
  });
  if (run.posts.length === 0) {
    console.log('[feed] 0 Posts geladen — Feed leer, nicht eingeloggt oder zeitweiliger Block. Später erneut versuchen. (Dashboard behält den letzten Lauf.)');
    process.exitCode = 1;
  } else {
    writeFeedRun(cfg.dataDir, run);
    const withDrafts = Object.values(run.drafts).filter((d) => d.length > 0).length;
    console.log(`[feed] ${run.posts.length} Posts gerankt, Entwürfe für ${withDrafts} Top-Posts. Im Dashboard unter „Feed".`);
  }
} catch (err) {
  console.error(`✗ Feed-Lauf abgebrochen: ${(err as Error).message.split('\n')[0]}`);
  console.error('  Häufig: nicht eingeloggt (npm run login) oder zeitweiliger Anti-Bot-Block (HTTP 999).');
  process.exitCode = 1;
} finally {
  await session.close();
}
