import type { Page } from 'playwright';
import { detectInterfaceLang } from '../browser/session.js';
import { labelsForDetected, loadLabels, type SummaryLabels } from '../parser/summary-labels.js';
import type { Translator } from '../i18n/index.js';

/**
 * Works out which label set to read LinkedIn's pages with.
 *
 * `LIP_LI_LANG=auto` (the default) detects it from the open page. That matters
 * for anyone who just cloned the repo: a wrong language does not throw, it
 * quietly yields empty numbers, and there is no reason to suspect a language
 * setting. An explicit setting always wins, and so does a custom label file.
 */
export async function resolveLabels(opts: {
  page: Page;
  liLang: string;
  labelsFile?: string;
  i18n: Translator;
  cmd: string;
  log?: (message: string) => void;
}): Promise<SummaryLabels> {
  const log = opts.log ?? ((m: string) => console.log(m));

  if (opts.labelsFile) return loadLabels({ lang: opts.liLang, labelsFile: opts.labelsFile });

  if (opts.liLang !== 'auto') {
    log(opts.i18n.t('cli.li.configured', { cmd: opts.cmd, lang: opts.liLang }));
    return loadLabels({ lang: opts.liLang });
  }

  const detected = await detectInterfaceLang(opts.page);
  const labels = labelsForDetected(detected);
  log(detected
    ? opts.i18n.t('cli.li.detected', { cmd: opts.cmd, lang: labels.lang })
    : opts.i18n.t('cli.li.detectFailed', { cmd: opts.cmd, lang: labels.lang }));
  return labels;
}
