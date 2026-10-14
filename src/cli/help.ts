import type { Translator } from '../i18n/index.js';

export type CliCommand = 'login' | 'collect' | 'analytics' | 'feed' | 'start' | 'status' | 'dashboard';

export function wantsHelp(argv: string[] = process.argv.slice(2)): boolean {
  return argv.includes('--help') || argv.includes('-h');
}

export function usage(cmd: CliCommand, i18n: Translator): string {
  return `${i18n.t('cli.help.usage', { cmd })}\n\n${i18n.t(`cli.help.${cmd}`)}\n\n${i18n.t('cli.help.env')}`;
}

/**
 * Has to run before anything opens a browser: someone asking for the options
 * must not trigger a run against LinkedIn.
 */
export function exitIfHelp(cmd: CliCommand, i18n: Translator, argv: string[] = process.argv.slice(2)): void {
  if (!wantsHelp(argv)) return;
  console.log(usage(cmd, i18n));
  process.exit(0);
}
