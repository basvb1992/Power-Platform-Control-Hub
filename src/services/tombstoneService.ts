/**
 * Tombstone service — persists deleted resource IDs so they stay hidden
 * across all users and sessions until the Inventory API refreshes.
 *
 * PRIMARY: Dataverse table `vbd_resourcetombstone` (shared across all users).
 * FALLBACK: localStorage (per user/browser) when Dataverse is unavailable
 *           (e.g. running locally without a live connection).
 *
 * To upgrade another tenant: import the solution in `solution/`, then run:
 *   npx power-apps add-data-source --api-id dataverse \
 *     --resource-name vbd_resourcetombstone --org-url <your-org-url>
 */

import { Vbd_resourcetombstonesService } from '../generated/services/Vbd_resourcetombstonesService.ts';

const LS_KEY = 'vbd_resourceTombstones';
const MAX_AGE_DAYS = 30;

export interface TombstoneEntry {
  resourceId: string;
  resourceType: string;
  environmentId: string;
  displayName: string;
  deletedBy?: string;
}

// Local cache: resourceId → Dataverse record GUID (for fast deletes)
const dvIdCache = new Map<string, string>();

// ── localStorage fallback ─────────────────────────────────────────────────

interface LocalEntry extends TombstoneEntry { deletedOn: string }

function lsLoad(): LocalEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as LocalEntry[];
    const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
    return entries.filter((e) => new Date(e.deletedOn).getTime() > cutoff);
  } catch { return []; }
}

function lsSave(entries: LocalEntry[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(entries)); } catch { /* quota */ }
}

function lsGetIds(): Set<string> {
  return new Set(lsLoad().map((e) => e.resourceId));
}

function lsAdd(entry: TombstoneEntry): void {
  const entries = lsLoad();
  if (entries.some((e) => e.resourceId === entry.resourceId)) return;
  entries.push({ ...entry, deletedOn: new Date().toISOString() });
  lsSave(entries);
}

function lsRemove(resourceId: string): void {
  lsSave(lsLoad().filter((e) => e.resourceId !== resourceId));
}

// ── Dataverse operations ──────────────────────────────────────────────────

async function dvGetIds(): Promise<Set<string>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

  const result = await Vbd_resourcetombstonesService.getAll({
    select: ['vbd_resourceid', 'vbd_resourcetombstoneid', 'vbd_deletedon'],
    filter: `vbd_deletedon ge ${cutoff.toISOString()}`,
  });

  if (!result.success || !result.data) return new Set();

  const ids = new Set<string>();
  for (const record of result.data) {
    if (!record.vbd_resourceid) continue;
    ids.add(record.vbd_resourceid);
    if (record.vbd_resourcetombstoneid) {
      dvIdCache.set(record.vbd_resourceid, record.vbd_resourcetombstoneid);
    }
  }
  return ids;
}

async function dvAdd(entry: TombstoneEntry): Promise<void> {
  // ownerid and statecode are intentionally omitted — Dataverse assigns the
  // current user as owner and defaults statecode to 0 (Active) automatically.
  const payload = {
    vbd_resourceid: entry.resourceId,
    vbd_resourcetype: entry.resourceType,
    vbd_environmentid: entry.environmentId,
    vbd_displayname: entry.displayName,
    vbd_deletedby: entry.deletedBy ?? '',
    vbd_deletedon: new Date().toISOString(),
  } as Parameters<typeof Vbd_resourcetombstonesService.create>[0];

  const result = await Vbd_resourcetombstonesService.create(payload);
  if (result.success && result.data?.vbd_resourcetombstoneid) {
    dvIdCache.set(entry.resourceId, result.data.vbd_resourcetombstoneid);
  } else if (!result.success) {
    console.error('[Tombstone] Dataverse create failed:', result.error);
    throw new Error(result.error?.message ?? 'Dataverse create failed');
  }
}

async function dvRemove(resourceId: string): Promise<void> {
  let id = dvIdCache.get(resourceId);
  if (!id) {
    const lookup = await Vbd_resourcetombstonesService.getAll({
      select: ['vbd_resourcetombstoneid'],
      filter: `vbd_resourceid eq '${resourceId.replace(/'/g, "''")}'`,
    });
    id = lookup.data?.[0]?.vbd_resourcetombstoneid;
  }
  if (id) {
    await Vbd_resourcetombstonesService.delete(id);
    dvIdCache.delete(resourceId);
  }
}

// ── Public API (async) ────────────────────────────────────────────────────

/**
 * Fetches all tombstoned resource IDs.
 * Tries Dataverse first; falls back to localStorage on error.
 */
export async function fetchTombstonedIds(): Promise<Set<string>> {
  try {
    const ids = await dvGetIds();
    // Merge with any local entries written while offline
    for (const id of lsGetIds()) ids.add(id);
    return ids;
  } catch {
    return lsGetIds();
  }
}

/**
 * Records a resource as deleted. Writes to both Dataverse and localStorage
 * so the entry is available even before the next fetch completes.
 */
export async function addTombstone(entry: TombstoneEntry): Promise<void> {
  lsAdd(entry); // instant local write first
  try {
    await dvAdd(entry);
  } catch {
    // Dataverse unavailable — localStorage write above is the fallback
  }
}

/**
 * Removes a tombstone (rollback on failed delete).
 */
export async function removeTombstone(resourceId: string): Promise<void> {
  lsRemove(resourceId);
  try {
    await dvRemove(resourceId);
  } catch {
    // Best effort
  }
}
