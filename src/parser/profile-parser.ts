import type { ProfileMetrics, RawProfile } from './types.js';
import { parseCount } from './normalize.js';

/**
 * Note on connections: LinkedIn stops counting the display at "500+", so this
 * is a floor from that point on, not an exact figure. Storing 500 keeps what
 * LinkedIn shows; storing null would throw the information away.
 */
export function parseProfile(raw: RawProfile, now: Date): ProfileMetrics {
  return {
    capturedAt: now.toISOString(),
    followers: parseCount(raw.followersText) ?? 0,
    connections: parseCount(raw.connectionsText),
    // "500+" means at least 500, not exactly 500.
    ...((raw.connectionsText ?? '').includes('+') ? { connectionsCapped: true } : {}),
  };
}
