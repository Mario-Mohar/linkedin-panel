import { describe, it, expect, vi } from 'vitest';
import { computeNextDelayMinutes, startScheduler } from '../../src/scheduler/scheduler.js';
import { loadConfig } from '../../src/config.js';

const cfg = { baseIntervalMinutes: 180, goldenHourWindowMinutes: 120, goldenHourIntervalMinutes: 25 };

describe('computeNextDelayMinutes', () => {
  it('fresh post inside the golden hour -> short interval', () => {
    expect(computeNextDelayMinutes([30, 5000], cfg)).toBe(25);
  });
  it('no fresh post -> base interval', () => {
    expect(computeNextDelayMinutes([500, 5000], cfg)).toBe(180);
  });
  it('no posts -> base interval', () => {
    expect(computeNextDelayMinutes([], cfg)).toBe(180);
  });
  it('a post exactly on the window edge still counts as fresh', () => {
    expect(computeNextDelayMinutes([120], cfg)).toBe(25);
  });
});

describe('startScheduler output', () => {
  it('speaks the configured language', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const cfg = loadConfig({ LIP_LANG: 'en', LIP_DATA_DIR: '/nonexistent' });
      const handle = startScheduler({ cfg, tick: async () => { throw new Error('boom'); } });
      await vi.waitFor(() => expect(log).toHaveBeenCalled());
      handle.stop();
      expect(err.mock.calls[0][0]).toBe('[scheduler] tick failed: boom');
      expect(log.mock.calls[0][0]).toBe('[scheduler] next run in 180 min.');
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  });
});
