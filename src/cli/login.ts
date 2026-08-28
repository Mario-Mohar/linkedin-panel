import { loadConfig } from '../config.js';
import { launchSession, isLoggedIn } from '../browser/session.js';
import { createTranslator } from '../i18n/index.js';

const cfg = loadConfig();
const i18n = createTranslator(cfg.uiLang);
const session = await launchSession({ profileDir: cfg.browserProfileDir, headless: false });

try {
  await session.page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
} catch (err) {
  // LinkedIn temporarily blocks automated access with an error code
  // (net::ERR_HTTP_RESPONSE_CODE_FAILURE / HTTP 999). Exit cleanly instead of
  // crashing, otherwise the browser is left open with its tabs.
  console.error(i18n.t('cli.login.unreachable', { message: (err as Error).message.split('\n')[0] }));
  console.error(i18n.t('cli.login.blockHint'));
  console.error(i18n.t('cli.login.waitHint'));
  await session.close();
  process.exit(1);
}

console.log(i18n.t('cli.login.prompt'));

const deadline = Date.now() + 5 * 60_000;
while (Date.now() < deadline) {
  if (await isLoggedIn(session.page)) {
    console.log(i18n.t('cli.login.ok'));
    await session.close();
    process.exit(0);
  }
  await session.page.waitForTimeout(2000);
}
console.error(i18n.t('cli.login.timeout'));
await session.close();
process.exit(1);
