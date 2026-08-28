/**
 * LinkedIn activity IDs are Snowflake-like: the upper bits encode the creation
 * time in ms (id >> 22). Returns ISO 8601 or null.
 */
export function postedAtFromUrn(urn: string): string | null {
  const idPart = (urn ?? '').trim().split(':').pop() ?? '';
  if (!/^\d{6,}$/.test(idPart)) return null;
  try {
    const ms = Number(BigInt(idPart) >> 22n);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}
