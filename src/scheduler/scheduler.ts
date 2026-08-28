import type { AppConfig } from '../config.js';

export function computeNextDelayMinutes(
  postAgesMinutes: number[],
  cfg: Pick<AppConfig, 'baseIntervalMinutes' | 'goldenHourWindowMinutes' | 'goldenHourIntervalMinutes'>,
): number {
  const hasFresh = postAgesMinutes.some((age) => age <= cfg.goldenHourWindowMinutes);
  return hasFresh ? cfg.goldenHourIntervalMinutes : cfg.baseIntervalMinutes;
}

export function startScheduler(
  opts: { cfg: AppConfig; tick: () => Promise<number[]> },
): { stop: () => void } {
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const loop = async () => {
    if (stopped) return;
    let delayMinutes = opts.cfg.baseIntervalMinutes;
    try {
      const ages = await opts.tick();
      delayMinutes = computeNextDelayMinutes(ages, opts.cfg);
    } catch (err) {
      console.error('[scheduler] tick fehlgeschlagen:', (err as Error).message);
    }
    if (!stopped) {
      console.log(`[scheduler] nächster Lauf in ${delayMinutes} Min.`);
      timer = setTimeout(loop, delayMinutes * 60_000);
    }
  };

  void loop();
  return {
    stop: () => { stopped = true; if (timer) clearTimeout(timer); },
  };
}
