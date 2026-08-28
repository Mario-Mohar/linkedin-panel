import { spawn, type ChildProcess } from 'node:child_process';

/**
 * Starts the collectors from the dashboard.
 *
 * The panel used to be a pure viewer; everything that collects was a terminal
 * command. Running them from the page is a lot friendlier, but it also means a
 * web page can now start a browser automation, so two things are fixed here:
 * only a closed set of commands can be started, and never more than one at a
 * time. The request-side protection (origin check) sits in the server.
 */

export type RunKind = 'login' | 'collect' | 'analytics';

/** Fixed command table. Nothing from a request ever becomes part of a command. */
const COMMANDS: Record<RunKind, { script: string; limitEnv?: string }> = {
  login: { script: 'src/cli/login.ts' },
  collect: { script: 'src/cli/collect.ts', limitEnv: 'LIP_POST_LIMIT' },
  analytics: { script: 'src/cli/analytics.ts', limitEnv: 'LIP_ANALYTICS_LIMIT' },
};

export const LIMIT_MIN = 1;
export const LIMIT_MAX = 100;

/** Keeps the log from growing without bound during a long run. */
const MAX_LINES = 200;

export interface RunState {
  kind: RunKind | null;
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  lines: string[];
}

export interface RunnerDeps {
  /** Injectable so the flow can be tested without starting real processes. */
  spawnFn?: (script: string, env: NodeJS.ProcessEnv) => ChildProcess;
  now?: () => Date;
}

export function isRunKind(value: unknown): value is RunKind {
  return typeof value === 'string' && value in COMMANDS;
}

/**
 * Validates the post count coming from the page. Out of range or not a number
 * means: fall back to the configured default rather than passing something
 * surprising to the collector.
 */
export function normaliseLimit(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, Math.trunc(n)));
}

function defaultSpawn(script: string, env: NodeJS.ProcessEnv): ChildProcess {
  // npx resolves the locally installed tsx; shell: false so nothing is
  // interpreted by a shell.
  return spawn('npx', ['tsx', script], { env, shell: false });
}

export class Runner {
  private state: RunState = {
    kind: null, running: false, startedAt: null, finishedAt: null, exitCode: null, lines: [],
  };

  private child: ChildProcess | null = null;

  constructor(private deps: RunnerDeps = {}) {}

  getState(): RunState {
    return { ...this.state, lines: [...this.state.lines] };
  }

  /**
   * Starts a run. Returns null when one is already going — the caller turns
   * that into a "busy" answer instead of starting a second browser session on
   * the same profile, which would fight over the profile lock.
   */
  start(kind: RunKind, opts: { limit?: number; env?: NodeJS.ProcessEnv }): RunState | null {
    if (this.state.running) return null;

    const now = (this.deps.now ?? (() => new Date()))();
    const command = COMMANDS[kind];
    const env: NodeJS.ProcessEnv = { ...(opts.env ?? process.env) };
    if (command.limitEnv && opts.limit !== undefined) env[command.limitEnv] = String(opts.limit);

    this.state = {
      kind, running: true, startedAt: now.toISOString(), finishedAt: null, exitCode: null, lines: [],
    };

    const spawnFn = this.deps.spawnFn ?? defaultSpawn;
    const child = spawnFn(command.script, env);
    this.child = child;

    const absorb = (chunk: unknown) => this.push(String(chunk));
    child.stdout?.on('data', absorb);
    child.stderr?.on('data', absorb);

    child.on('error', (err: Error) => {
      this.push(err.message);
      this.finish(1);
    });
    child.on('close', (code: number | null) => this.finish(code ?? 0));

    return this.getState();
  }

  private push(text: string): void {
    for (const line of text.split('\n')) {
      const trimmed = line.trimEnd();
      if (!trimmed) continue;
      this.state.lines.push(trimmed);
    }
    if (this.state.lines.length > MAX_LINES) {
      this.state.lines = this.state.lines.slice(-MAX_LINES);
    }
  }

  private finish(code: number): void {
    if (!this.state.running) return;
    const now = (this.deps.now ?? (() => new Date()))();
    this.state.running = false;
    this.state.finishedAt = now.toISOString();
    this.state.exitCode = code;
    this.child = null;
  }

  /** Stops a running command. Used when the server shuts down. */
  stop(): void {
    this.child?.kill();
  }
}
