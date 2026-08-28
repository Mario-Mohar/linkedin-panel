import { execFile } from 'node:child_process';

/** Calls the local claude CLI in print mode (uses the subscription). */
export function runClaude(prompt: string, opts: { timeoutMs?: number; model?: string } = {}): Promise<string> {
  const args = ['-p', prompt, '--output-format', 'text'];
  if (opts.model) args.push('--model', opts.model);
  return new Promise((resolve, reject) => {
    execFile('claude', args, { timeout: opts.timeoutMs ?? 90_000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}
