import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, it, expect, afterAll } from 'vitest';

// Runs the real entry point against an empty temp data dir, so nothing of the
// user's own data or setup is read.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lip-status-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const status = (lang: string) => execFileSync(
  process.execPath, ['--import', 'tsx', 'src/cli/status.ts'],
  { env: { PATH: process.env.PATH, HOME: dir, LIP_DATA_DIR: dir, LIP_MACHINE_ID: 'test', LIP_LANG: lang }, encoding: 'utf8' },
);

describe('status', () => {
  it('follows LIP_LANG', () => {
    const en = status('en');
    expect(en).toContain('Metric rows:');
    expect(en).toContain('Recent runs:');
    expect(en).not.toContain('Metrik-Zeilen');
    expect(status('de')).toContain('Letzte Läufe:');
  }, 20_000);
});
