import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('returns sensible defaults', () => {
    const cfg = loadConfig({});
    expect(cfg.postLimit).toBe(35);
    expect(cfg.baseIntervalMinutes).toBe(180);
    expect(cfg.goldenHourWindowMinutes).toBe(120);
    expect(cfg.goldenHourIntervalMinutes).toBe(25);
    expect(cfg.dbPath.endsWith('panel.db')).toBe(true);
    expect(cfg.freshDays).toBe(21);
    expect(cfg.tz).toBe('Europe/Berlin');
    expect(cfg.dashboardPort).toBe(4599);
    expect(typeof cfg.machineId).toBe('string');
    expect(cfg.machineId.length).toBeGreaterThan(0);
    expect(cfg.feedMaxAgeH).toBe(24);
    expect(cfg.feedTopN).toBe(5);
    expect(cfg.feedWeights).toEqual({ momentum: 0.40, topical: 0.35, relationship: 0.25 });
  });

  it('allows env overrides', () => {
    const cfg = loadConfig({ LIP_POST_LIMIT: '10', LIP_BASE_INTERVAL_MIN: '60' });
    expect(cfg.postLimit).toBe(10);
    expect(cfg.baseIntervalMinutes).toBe(60);
  });

  it('falls back to the default on an empty LIP_DATA_DIR', () => {
    const cfg = loadConfig({ LIP_DATA_DIR: '' });
    expect(cfg.dbPath.endsWith('panel.db')).toBe(true);
    expect(cfg.dataDir).not.toBe('');
    expect(path.isAbsolute(cfg.dataDir)).toBe(true);
  });
});
