import os from 'node:os';
import path from 'node:path';
import type { ScoreParts } from './feed/types.js';
import { resolveUiLang, type UiLang } from './i18n/index.js';

export interface AppConfig {
  dataDir: string;
  dbPath: string;
  browserProfileDir: string;
  postLimit: number;
  analyticsLimit: number;
  /** Language of the tool itself (dashboard, console output). */
  uiLang: UiLang;
  /**
   * Language LinkedIn's own interface is set to — decides how pages are read.
   * `auto` means: detect it from the open page instead of asking the user.
   */
  liLang: string;
  liLabelsFile?: string;
  baseIntervalMinutes: number;
  goldenHourWindowMinutes: number;
  goldenHourIntervalMinutes: number;
  machineId: string;
  freshDays: number;
  tz: string;
  dashboardPort: number;
  feedMaxAgeH: number;
  feedTopN: number;
  feedWeights: ScoreParts;
  feedExcludeCompanies: boolean;
}

function intFrom(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = env.LIP_DATA_DIR || path.resolve('data');
  const machineId = (env.LIP_MACHINE_ID || os.hostname() || 'unknown')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
  return {
    dataDir,
    dbPath: path.join(dataDir, 'panel.db'),
    browserProfileDir: env.LIP_PROFILE_DIR || path.resolve('browser-profile'),
    postLimit: intFrom(env.LIP_POST_LIMIT, 35),
    // The analytics collector opens one page per post and takes noticeably
    // longer, hence its own, smaller default.
    analyticsLimit: intFrom(env.LIP_ANALYTICS_LIMIT, 15),
    uiLang: resolveUiLang(env),
    liLang: env.LIP_LI_LANG || 'auto',
    ...(env.LIP_LI_LABELS ? { liLabelsFile: env.LIP_LI_LABELS } : {}),
    baseIntervalMinutes: intFrom(env.LIP_BASE_INTERVAL_MIN, 180),
    goldenHourWindowMinutes: intFrom(env.LIP_GOLDEN_WINDOW_MIN, 120),
    goldenHourIntervalMinutes: intFrom(env.LIP_GOLDEN_INTERVAL_MIN, 25),
    machineId,
    freshDays: intFrom(env.LIP_FRESH_DAYS, 21),
    tz: env.LIP_TZ || 'Europe/Berlin',
    dashboardPort: intFrom(env.LIP_DASHBOARD_PORT, 4599),
    feedMaxAgeH: intFrom(env.LIP_FEED_MAX_AGE_H, 24),
    feedTopN: intFrom(env.LIP_FEED_TOPN, 5),
    feedWeights: { momentum: 0.40, topical: 0.35, relationship: 0.25 },
    feedExcludeCompanies: (env.LIP_FEED_EXCLUDE_COMPANIES ?? 'true') !== 'false',
  };
}
