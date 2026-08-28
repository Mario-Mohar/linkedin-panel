/** true when the model output contains a JSON array at all. */
export function hasRelevanceArray(modelOutput: string): boolean {
  return typeof modelOutput === 'string' && /\[[\s\S]*?\]/.test(modelOutput);
}

export function parseRelevance(modelOutput: string, count: number): number[] {
  const out = new Array(Math.max(0, count)).fill(0);
  if (typeof modelOutput !== 'string') return out;
  const match = modelOutput.match(/\[[\s\S]*?\]/); // erstes JSON-Array
  if (match) {
    try {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr)) {
        for (let i = 0; i < count; i++) {
          const n = Number(arr[i]);
          out[i] = Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : 0;
        }
      }
    } catch { /* Nullen behalten */ }
  }
  return out;
}

export function parseDrafts(modelOutput: string): string[] {
  if (typeof modelOutput !== 'string') return [];
  const text = modelOutput.trim();
  if (!text) return [];
  const numbered = [...text.matchAll(/^\s*\d+\.\s*(.+?)(?=\n\s*\d+\.|\s*$)/gms)].map((m) => m[1].trim()).filter(Boolean);
  if (numbered.length > 0) return numbered.slice(0, 2);
  return [text];
}
