import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { Store } from '../store/store.js';
import type { AppConfig } from '../config.js';
import { computeDashboard, computePostHistory } from '../analytics/analytics.js';
import { readFeedRun } from '../feed/store.js';
import { createTranslator, weekdayLabels } from '../i18n/index.js';
import { Runner, isRunKind, normaliseLimit } from './runner.js';

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

/** Resolves a request path to a file INSIDE webRoot, or null if it escapes. */
export function resolveStaticFile(webRoot: string, pathname: string): string | null {
  const root = path.resolve(webRoot);
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

/**
 * Guards the endpoints that start something.
 *
 * The panel listens on localhost, but any web page the user has open can send a
 * cross-origin POST there. So a request that starts a collector must prove it
 * came from the panel itself: same origin, and a header a simple cross-origin
 * form post cannot set. Reading data stays open — it is local and harmless.
 */
export function isSameOrigin(req: http.IncomingMessage, port: number): boolean {
  if (req.headers['x-requested-with'] !== 'linkedin-panel') return false;
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin fetch may omit it
  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`;
}

function readJsonBody(req: http.IncomingMessage, limitBytes = 4096): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > limitBytes) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

export function createServer(opts: { store: Store; cfg: AppConfig; webDir: string; runner?: Runner }): http.Server {
  const i18n = createTranslator(opts.cfg.uiLang);
  const runner = opts.runner ?? new Runner();
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const send = (code: number, type: string, body: string | Buffer) => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };

    // The frontend fetches the message catalogue once at startup and labels
    // itself with it, so there is one source for the texts instead of one in
    // the server and another in the browser.
    if (url.pathname === '/api/i18n') {
      return send(200, 'application/json', JSON.stringify({ lang: i18n.lang, messages: i18n.messages }));
    }
    if (url.pathname === '/api/data') {
      // The collectors are separate processes; without this the panel keeps
      // showing whatever was on disk when it started.
      opts.store.reload();
      const data = computeDashboard(opts.store.data, {
        now: new Date(), freshDays: opts.cfg.freshDays, tz: opts.cfg.tz,
        weekdayLabels: weekdayLabels(i18n.messages),
      });
      // While the marker is present the numbers come from the bundled example
      // data. The dashboard has to say so — otherwise someone takes the made-up
      // figures for their own.
      const isExample = fs.existsSync(path.join(opts.cfg.dataDir, '.example-data'));
      return send(200, 'application/json', JSON.stringify({ ...data, isExample }));
    }
    if (url.pathname.startsWith('/api/post/')) {
      opts.store.reload();
      const urn = decodeURIComponent(url.pathname.slice('/api/post/'.length));
      return send(200, 'application/json', JSON.stringify(computePostHistory(opts.store.data, urn)));
    }
    // --- starting collectors from the panel ---
    if (url.pathname === '/api/run' && req.method === 'GET') {
      return send(200, 'application/json', JSON.stringify(runner.getState()));
    }
    if (url.pathname === '/api/run' && req.method === 'POST') {
      if (!isSameOrigin(req, opts.cfg.dashboardPort)) {
        return send(403, 'application/json', JSON.stringify({ error: 'forbidden' }));
      }
      void readJsonBody(req).then((body) => {
        const { kind, limit } = (body ?? {}) as { kind?: unknown; limit?: unknown };
        if (!isRunKind(kind)) {
          return send(400, 'application/json', JSON.stringify({ error: 'unknown kind' }));
        }
        const fallback = kind === 'analytics' ? opts.cfg.analyticsLimit : opts.cfg.postLimit;
        const started = runner.start(kind, { limit: normaliseLimit(limit, fallback) });
        if (!started) {
          return send(409, 'application/json', JSON.stringify({ error: 'busy', state: runner.getState() }));
        }
        send(200, 'application/json', JSON.stringify(started));
      }).catch(() => send(400, 'application/json', JSON.stringify({ error: 'bad request' })));
      return;
    }
    if (url.pathname === '/api/feed') {
      const run = readFeedRun(opts.cfg.dataDir) ?? { generatedAt: null, posts: [], drafts: {} };
      return send(200, 'application/json', JSON.stringify(run));
    }
    // statische Files
    const file = resolveStaticFile(opts.webDir, url.pathname);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(404, 'text/plain', 'not found');
    send(200, MIME[path.extname(file)] ?? 'application/octet-stream', fs.readFileSync(file));
  });
}
