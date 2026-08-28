#!/usr/bin/env node
/**
 * Generates the example data the repository can ship.
 *
 * Purpose: after cloning, `npm run dashboard` shows something straight away
 * without anyone having to attach their LinkedIn account first. The numbers are
 * made up and generated deterministically — this script is included so it stays
 * traceable where they came from.
 *
 *   node scripts/make-example-data.mjs
 *
 * Throw them away and continue with real data: `npm run reset`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { scriptTranslator } from './i18n.mjs';

const { t } = scriptTranslator();

const dataDir = process.env.LIP_DATA_DIR || path.resolve('data');
const SHARD = 'example';

/** Small deterministic generator so the files look the same on every run. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}
const rand = rng(20260828);
const between = (min, max) => Math.round(min + rand() * (max - min));

/** Build a LinkedIn activity URN from a timestamp (the time sits in the upper bits). */
const urnFor = (ms) => `urn:li:activity:${(BigInt(ms) << 22n).toString()}`;

const REFERENCE_NOW = Date.parse('2026-08-28T09:00:00.000Z');
const DAY = 86_400_000;

const TEXTS = [
  'We got our deploy pipeline from 20 minutes down to 4. The biggest lever was not the build, it was caching the dependencies.',
  'Three years freelancing, three things I would do differently. Mostly: say no earlier to projects without a clear counterpart.',
  'Genuine question: do you write tests before or after the feature? I have changed my mind about this over the last few months.',
  'A client asked why the migration takes three weeks when the tool does it in an hour. The answer is in the data model, not the tool.',
  'Monitoring without alerts is a poster on the wall. We halved our dashboards and armed four alerts instead.',
  'The best documentation I read this year was a single file titled "Why it looks the way it looks".',
  'We removed a feature after six weeks. Nobody had used it. That was the cheapest decision of the quarter.',
  'Code review is not a quality gate, it is knowledge transfer. The tone in the comments changes the moment you treat it that way.',
  'Legacy does not mean old. Legacy means nobody dares to touch it. That is a documentation problem, not a technical one.',
  'For a quarter now we measure how long a ticket waits instead of how long it takes. The numbers were uncomfortable and useful.',
  'Small note for everyone running Docker: a pinned base image tag saved us two outages this year.',
  'I stopped giving estimates in hours and give ranges with the assumptions instead. The conversations have been better since.',
];

const posts = [];
const metrics = [];

TEXTS.forEach((text, i) => {
  // Spread posts over the last ~5 months, the newest one 4 days ago.
  const ageDays = 4 + i * 13;
  const postedMs = REFERENCE_NOW - ageDays * DAY;
  const urn = urnFor(postedMs);
  const postedAt = new Date(postedMs).toISOString();

  posts.push({
    postUrn: urn,
    url: `https://www.linkedin.com/feed/update/${urn}/`,
    postedAt,
    format: i % 5 === 0 ? 'bild' : 'text',
    textExcerpt: text,
    firstSeenAt: new Date(postedMs + 3600_000).toISOString(),
  });

  const impressions = between(400, 4200);
  const reactions = Math.max(0, Math.round(impressions * (0.004 + rand() * 0.02)));
  const comments = Math.max(0, Math.round(reactions * (0.1 + rand() * 0.6)));
  const reposts = Math.max(0, Math.round(reactions * rand() * 0.12));
  const saves = Math.max(0, Math.round(reactions * rand() * 0.3));
  const sends = Math.max(0, Math.round(reactions * rand() * 0.2));
  const socialInteractions = reactions + comments + reposts;
  const inNetworkPct = Math.round((45 + rand() * 40) * 10) / 10;

  const breakdown = (total) => ({
    like: Math.round(total * 0.7), celebrate: Math.round(total * 0.12), support: Math.round(total * 0.06),
    love: Math.round(total * 0.07), insightful: Math.round(total * 0.04), funny: Math.round(total * 0.01),
  });

  // Two feed measurements, the way the feed collector writes them: one shortly
  // after posting, one later. Reactions grow in between.
  const early = Math.round(reactions * 0.55);
  metrics.push({
    postUrn: urn, capturedAt: new Date(postedMs + 6 * 3600_000).toISOString(),
    impressions: null, reactionsTotal: early, reactionsBreakdown: breakdown(early),
    comments: Math.round(comments * 0.5), reposts: Math.round(reposts * 0.5), source: 'feed',
  });
  metrics.push({
    postUrn: urn, capturedAt: new Date(Math.min(postedMs + 5 * DAY, REFERENCE_NOW)).toISOString(),
    impressions: null, reactionsTotal: reactions, reactionsBreakdown: breakdown(reactions),
    comments, reposts, source: 'feed',
  });

  // One analytics measurement with the reach figures. Deliberately OLDER than
  // the newest feed measurement — that is exactly how it looks in reality,
  // because the analytics run happens less often than the feed collector.
  metrics.push({
    postUrn: urn,
    capturedAt: new Date(Math.min(postedMs + 4 * DAY, REFERENCE_NOW)).toISOString(),
    impressions,
    reactionsTotal: reactions,
    reactionsBreakdown: { like: 0, celebrate: 0, support: 0, love: 0, insightful: 0, funny: 0 },
    comments, reposts, source: 'analytics',
    analytics: {
      membersReached: Math.round(impressions * (0.72 + rand() * 0.15)),
      inNetworkPct, outNetworkPct: Math.round((100 - inNetworkPct) * 10) / 10,
      socialInteractions, saves, sends,
      profileViews: Math.max(0, Math.round(impressions * rand() * 0.02)),
      followersGained: Math.max(0, Math.round(impressions * rand() * 0.004)),
    },
  });
});

// Follower history: weekly measurements with mild growth.
const profile = [];
let followers = 780;
for (let week = 22; week >= 0; week--) {
  const at = REFERENCE_NOW - week * 7 * DAY;
  profile.push({ capturedAt: new Date(at).toISOString(), followers, connections: 640 + between(0, 12) });
  followers += between(3, 21);
}

function write(kind, rows) {
  const dir = path.join(dataDir, kind);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${SHARD}.ndjson`);
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(t('example.wrote', { file: path.relative(process.cwd(), file), rows: rows.length }));
}

write('posts', posts);
write('metrics', metrics);
write('profile', profile);

fs.writeFileSync(
  path.join(dataDir, '.example-data'),
  'Example data, generated by scripts/make-example-data.mjs.\n' +
  'The dashboard points this out for as long as this file exists.\n' +
  'Remove it with: npm run reset\n',
);
console.log(t('example.marker'));
