import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { Runner, isRunKind, normaliseLimit, LIMIT_MIN, LIMIT_MAX } from '../../src/server/runner.js';
import { isSameOrigin } from '../../src/server/server.js';
import type { IncomingMessage } from 'node:http';

/** Fake child process: emits what a test tells it to and then closes. */
function fakeChild() {
  const child = new EventEmitter() as unknown as ChildProcess & { emitOut(text: string): void; end(code: number): void };
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  Object.assign(child, {
    stdout, stderr,
    kill: () => true,
    emitOut: (text: string) => stdout.emit('data', text),
    end: (code: number) => (child as unknown as EventEmitter).emit('close', code),
  });
  return child;
}

describe('isRunKind', () => {
  it('accepts only the known commands', () => {
    expect(isRunKind('collect')).toBe(true);
    expect(isRunKind('analytics')).toBe(true);
    expect(isRunKind('login')).toBe(true);
  });

  it('rejects anything else, including attempts to smuggle a command in', () => {
    // Nothing from a request may ever become part of a command line.
    expect(isRunKind('rm -rf /')).toBe(false);
    expect(isRunKind('')).toBe(false);
    expect(isRunKind(undefined)).toBe(false);
    expect(isRunKind({ kind: 'collect' })).toBe(false);
  });
});

describe('normaliseLimit', () => {
  it('keeps a sensible number', () => {
    expect(normaliseLimit(15, 35)).toBe(15);
    expect(normaliseLimit('20', 35)).toBe(20);
  });

  it('clamps to the allowed range', () => {
    expect(normaliseLimit(0, 35)).toBe(LIMIT_MIN);
    expect(normaliseLimit(9999, 35)).toBe(LIMIT_MAX);
  });

  it('falls back to the configured default for nonsense', () => {
    expect(normaliseLimit('abc', 35)).toBe(35);
    expect(normaliseLimit(null, 35)).toBe(35);
    expect(normaliseLimit(undefined, 15)).toBe(15);
  });
});

describe('Runner', () => {
  it('starts a command and reports it as running', () => {
    const child = fakeChild();
    const runner = new Runner({ spawnFn: () => child });
    const state = runner.start('collect', { limit: 7 });
    expect(state?.running).toBe(true);
    expect(state?.kind).toBe('collect');
  });

  it('passes the limit through the right env variable', () => {
    let seen: NodeJS.ProcessEnv = {};
    const runner = new Runner({ spawnFn: (_script, env) => { seen = env; return fakeChild(); } });
    runner.start('analytics', { limit: 7, env: {} });
    expect(seen.LIP_ANALYTICS_LIMIT).toBe('7');
    expect(seen.LIP_POST_LIMIT).toBeUndefined();
  });

  it('runs the script that belongs to the kind', () => {
    let script = '';
    const runner = new Runner({ spawnFn: (s) => { script = s; return fakeChild(); } });
    runner.start('login', {});
    expect(script).toBe('src/cli/login.ts');
  });

  it('refuses a second run while one is going', () => {
    // Two runs would fight over the same browser profile lock.
    const runner = new Runner({ spawnFn: () => fakeChild() });
    expect(runner.start('collect', {})).not.toBeNull();
    expect(runner.start('analytics', {})).toBeNull();
  });

  it('collects output lines and drops empty ones', () => {
    const child = fakeChild();
    const runner = new Runner({ spawnFn: () => child });
    runner.start('collect', {});
    child.emitOut('erste Zeile\n\nzweite Zeile\n');
    expect(runner.getState().lines).toEqual(['erste Zeile', 'zweite Zeile']);
  });

  it('records the exit code and frees the slot again', () => {
    const child = fakeChild();
    const runner = new Runner({ spawnFn: () => child });
    runner.start('collect', {});
    child.end(0);
    const state = runner.getState();
    expect(state.running).toBe(false);
    expect(state.exitCode).toBe(0);
    expect(runner.start('analytics', {})).not.toBeNull();
  });

  it('reports a failed start as a finished run rather than hanging', () => {
    const child = fakeChild();
    const runner = new Runner({ spawnFn: () => child });
    runner.start('collect', {});
    (child as unknown as EventEmitter).emit('error', new Error('npx not found'));
    const state = runner.getState();
    expect(state.running).toBe(false);
    expect(state.exitCode).toBe(1);
    expect(state.lines.join(' ')).toMatch(/npx not found/);
  });

  it('hands out a copy of the lines, not the live array', () => {
    const child = fakeChild();
    const runner = new Runner({ spawnFn: () => child });
    runner.start('collect', {});
    child.emitOut('eins\n');
    const snapshot = runner.getState();
    child.emitOut('zwei\n');
    expect(snapshot.lines).toEqual(['eins']);
  });
});

describe('isSameOrigin', () => {
  const req = (headers: Record<string, string>) => ({ headers } as unknown as IncomingMessage);

  it('accepts a request from the panel itself', () => {
    expect(isSameOrigin(req({ 'x-requested-with': 'linkedin-panel', origin: 'http://localhost:4599' }), 4599)).toBe(true);
    expect(isSameOrigin(req({ 'x-requested-with': 'linkedin-panel', origin: 'http://127.0.0.1:4599' }), 4599)).toBe(true);
  });

  it('accepts a same-origin fetch that omits the origin header', () => {
    expect(isSameOrigin(req({ 'x-requested-with': 'linkedin-panel' }), 4599)).toBe(true);
  });

  it('rejects a request from another page', () => {
    // The panel listens on localhost, but any site the user has open could post
    // to it. Without this the page could start a browser automation.
    expect(isSameOrigin(req({ 'x-requested-with': 'linkedin-panel', origin: 'https://evil.example' }), 4599)).toBe(false);
  });

  it('rejects a plain form post, which cannot set the header', () => {
    expect(isSameOrigin(req({ origin: 'http://localhost:4599' }), 4599)).toBe(false);
    expect(isSameOrigin(req({}), 4599)).toBe(false);
  });
});
