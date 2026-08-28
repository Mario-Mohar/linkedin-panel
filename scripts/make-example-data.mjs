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
  'Wir haben unsere Deploy-Pipeline von 20 auf 4 Minuten gebracht. Der größte Hebel war nicht der Build, sondern das Caching der Abhängigkeiten.',
  'Drei Jahre Freelancing, drei Dinge, die ich anders machen würde. Vor allem: früher Nein sagen zu Projekten ohne klaren Ansprechpartner.',
  'Kurze Frage in die Runde: schreibt ihr Tests vor oder nach dem Feature? Ich habe meine Meinung dazu in den letzten Monaten geändert.',
  'Ein Kunde fragte, warum die Migration drei Wochen dauert, wenn das Tool sie in einer Stunde macht. Die Antwort steckt im Datenmodell, nicht im Tool.',
  'Monitoring ohne Alarme ist ein Poster an der Wand. Wir haben unsere Dashboards halbiert und dafür vier Alarme scharf gestellt.',
  'Die beste Dokumentation, die ich dieses Jahr gelesen habe, war eine einzige Datei mit dem Titel "Warum es so aussieht, wie es aussieht".',
  'Wir haben ein Feature nach sechs Wochen wieder ausgebaut. Niemand hat es benutzt. Das war die günstigste Entscheidung des Quartals.',
  'Codereview ist kein Qualitätstor, sondern Wissenstransfer. Sobald man es so behandelt, ändert sich der Ton in den Kommentaren.',
  'Legacy heißt nicht alt. Legacy heißt: niemand traut sich, es anzufassen. Das ist ein Dokumentationsproblem, kein Technikproblem.',
  'Wir messen seit einem Quartal, wie lange ein Ticket wartet statt wie lange es dauert. Die Zahlen waren unangenehm und hilfreich.',
  'Kleiner Hinweis für alle mit Docker-Setups: ein gepinnter Basis-Image-Tag hat uns dieses Jahr zwei Ausfälle erspart.',
  'Ich habe aufgehört, Schätzungen in Stunden abzugeben, und gebe stattdessen Bandbreiten mit Annahmen an. Die Gespräche sind seitdem besser.',
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
