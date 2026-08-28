import { describe, it, expect } from 'vitest';
import { parseProfile } from '../../src/parser/profile-parser.js';

const now = new Date('2026-07-18T12:00:00.000Z');

describe('parseProfile', () => {
  it('reads the capped "500+" that LinkedIn shows instead of an exact count', () => {
    // LinkedIn stops counting the connections display at 500+. Treating that as
    // unreadable would throw away a number the page is actually showing.
    const p = parseProfile({ followersText: '603 Follower:innen', connectionsText: '500+ Kontakte' }, new Date('2026-08-28T10:00:00.000Z'));
    expect(p.followers).toBe(603);
    expect(p.connections).toBe(500);
    expect(p.connectionsCapped).toBe(true);
  });

  it('does not mark an exact count as capped', () => {
    const p = parseProfile({ followersText: '563 Follower', connectionsText: '491 Kontakte' }, new Date('2026-08-28T10:00:00.000Z'));
    expect(p.connections).toBe(491);
    expect(p.connectionsCapped).toBeUndefined();
  });

  it('parses followers and connections', () => {
    const m = parseProfile({ followersText: '5.678 Follower:innen', connectionsText: '500+ Kontakte' }, now);
    expect(m.followers).toBe(5678);
    expect(m.connections).toBe(500);
    expect(m.capturedAt).toBe(now.toISOString());
  });
  it('unreadable followers -> 0, a null connections stays null', () => {
    const m = parseProfile({ followersText: '', connectionsText: null }, now);
    expect(m.followers).toBe(0);
    expect(m.connections).toBeNull();
  });
});
