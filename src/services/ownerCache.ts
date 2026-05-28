import { useEffect, useReducer } from 'react';
import { AaduserService } from '../generated/services/AaduserService.ts';

// GUIDs whose first three groups are all zeros are system/application accounts
const SYSTEM_PATTERN = /^0{8}-0{4}-0{4}/i;

const cache = new Map<string, string>();

// Pre-seed known system accounts
cache.set('00000000-0000-0000-0000-000000000000', 'SYSTEM');

function isSystemGuid(guid: string): boolean {
  return SYSTEM_PATTERN.test(guid);
}

// Listeners so hooks can react when a new GUID resolves
const listeners = new Set<() => void>();
function notify() {
  for (const fn of listeners) fn();
}

export async function resolveOwner(guid: string | undefined | null): Promise<string> {
  if (!guid) return '—';
  const key = guid.toLowerCase();

  if (cache.has(key)) return cache.get(key)!;

  if (isSystemGuid(key)) {
    cache.set(key, 'SYSTEM');
    notify();
    return 'SYSTEM';
  }

  try {
    const result = await AaduserService.get(guid);
    if (result.success && result.data?.displayname) {
      cache.set(key, result.data.displayname);
      notify();
      return result.data.displayname;
    }
    if (result.success && result.data?.mail) {
      cache.set(key, result.data.mail);
      notify();
      return result.data.mail;
    }
  } catch {
    // Dataverse unavailable — fall through
  }

  // Unresolvable — cache as-is to avoid repeated calls
  cache.set(key, guid);
  notify();
  return guid;
}

/** Resolve multiple GUIDs in parallel, no-op for already-cached ones. */
export function prefetchOwners(guids: (string | undefined | null)[]): void {
  for (const guid of guids) {
    if (!guid) continue;
    const key = guid.toLowerCase();
    if (!cache.has(key)) {
      void resolveOwner(guid);
    }
  }
}

/**
 * Hook: resolves all provided GUIDs and returns a Map<guid, displayName>.
 * Re-renders when any GUID in the list resolves.
 */
export function useOwners(guids: (string | undefined | null)[]): Map<string, string> {
  // forceUpdate trick — increment to trigger re-render when cache changes
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    listeners.add(forceUpdate);
    return () => { listeners.delete(forceUpdate); };
  }, []);

  useEffect(() => {
    prefetchOwners(guids);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guids.join(',')]);

  const result = new Map<string, string>();
  for (const guid of guids) {
    if (!guid) continue;
    const key = guid.toLowerCase();
    result.set(key, cache.get(key) ?? guid);
  }
  return result;
}

/** Convenience hook for a single GUID. */
export function useOwner(guid: string | undefined | null): string {
  const map = useOwners(guid ? [guid] : []);
  if (!guid) return '—';
  return map.get(guid.toLowerCase()) ?? guid;
}
