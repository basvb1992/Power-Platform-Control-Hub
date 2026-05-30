/**
 * Resolves AAD user object IDs (GUIDs) to display names via the Dataverse
 * `aadusers` virtual entity, which is backed by the AAD connector.
 * Results are cached module-level so repeated calls are free.
 */
import { AaduserService } from '../generated/services/AaduserService.ts';

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuid(s: string): boolean {
  return GUID_RE.test(s);
}

/** Persistent display-name cache: guid → display name (or original guid on failure). */
const nameCache = new Map<string, string>();

/**
 * Resolves a list of AAD user GUIDs to display names.
 * Already-cached IDs are skipped. Results are stored in the cache.
 * @returns The populated cache map (guid → display name).
 */
export async function resolveUserIds(ids: string[]): Promise<Map<string, string>> {
  const toFetch = [...new Set(ids.filter((id) => id && isGuid(id) && !nameCache.has(id)))];
  if (toFetch.length === 0) return nameCache;

  // Batch into groups to avoid overwhelming the API
  const BATCH = 20;
  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch = toFetch.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((id) =>
        AaduserService.get(id, { select: ['displayname', 'mail', 'userprincipalname'] }),
      ),
    );
    results.forEach((result, idx) => {
      const id = batch[idx];
      if (result.status === 'fulfilled' && result.value.success) {
        const u = result.value.data;
        nameCache.set(id, u.displayname ?? u.mail ?? u.userprincipalname ?? id);
      } else {
        // Cache failure so we don't retry on every render
        nameCache.set(id, id);
      }
    });
  }

  return nameCache;
}

/** Synchronous cache lookup — returns undefined if not yet resolved. */
export function getCachedUserName(id: string): string | undefined {
  return nameCache.get(id);
}
