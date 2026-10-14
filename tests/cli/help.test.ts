import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, it, expect, afterAll } from 'vitest';
import { wantsHelp, usage, type CliCommand } from '../../src/cli/help.js';
import { createTranslator } from '../../src/i18n/index.js';

const commands: CliCommand[] = ['login', 'collect', 'analytics', 'feed', 'start', 'status', 'dashboard'];

describe('wantsHelp', () => {
  it('reacts to --help and -h', () => {
    expect(wantsHelp(['--help'])).toBe(true);
    expect(wantsHelp(['-h'])).toBe(true);
    expect(wantsHelp(['--dump-page', 'x.txt'])).toBe(false);
    expect(wantsHelp([])).toBe(false);
  });
});

describe('usage', () => {
  it('has a text for every command in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      const i18n = createTranslator(lang);
      for (const cmd of commands) {
        const text = usage(cmd, i18n);
        expect(text).toContain(`npm run ${cmd}`);
        expect(text).not.toContain('cli.help.');
      }
    }
  });
});

describe('entry points', () => {
  // Starting the browser in a test would contact LinkedIn, so the order is
  // checked in the source: the help check has to come before anything that
  // opens a browser or touches the data directory.
  it.each(commands)('%s checks for --help before doing anything', (cmd) => {
    const src = fs.readFileSync(path.resolve(`src/cli/${cmd}.ts`), 'utf8');
    const help = src.indexOf(`exitIfHelp('${cmd}'`);
    expect(help).toBeGreaterThan(-1);
    for (const sideEffect of ['launchSession(', 'openStore(', 'createServer(']) {
      const at = src.indexOf(sideEffect);
      if (at !== -1) expect(help).toBeLessThan(at);
    }
  });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lip-help-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  it('status --help prints usage and leaves the data dir alone', () => {
    const data = path.join(dir, 'data');
    const out = execFileSync(
      process.execPath, ['--import', 'tsx', 'src/cli/status.ts', '--help'],
      { env: { PATH: process.env.PATH, HOME: dir, LIP_DATA_DIR: data, LIP_MACHINE_ID: 'test', LIP_LANG: 'en' }, encoding: 'utf8' },
    );
    expect(out).toContain('Usage: npm run status');
    expect(fs.existsSync(data)).toBe(false);
  }, 20_000);
});
