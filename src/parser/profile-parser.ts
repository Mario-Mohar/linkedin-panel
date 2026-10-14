import type { ProfileMetrics, RawProfile } from './types.js';
import { parseCount } from './normalize.js';

/**
 * Note on connections: LinkedIn stops counting the display at "500+", so this
 * is a floor from that point on, not an exact figure. Storing 500 keeps what
 * LinkedIn shows; storing null would throw the information away.
 *
 * Unreadable followers throw instead of turning into 0: a stored 0 looks like
 * a real data point and drags the KPI, the trend and every follower quota
 * down. The collector turns the error into a warning and stores nothing.
 */
export function parseProfile(raw: RawProfile, now: Date): ProfileMetrics {
  const followers = parseCount(raw.followersText);
  if (followers === null) throw new Error(`follower count unreadable: "${raw.followersText}"`);
  return {
    capturedAt: now.toISOString(),
    followers,
    connections: parseCount(raw.connectionsText),
    // "500+" means at least 500, not exactly 500.
    ...((raw.connectionsText ?? '').includes('+') ? { connectionsCapped: true } : {}),
  };
}
