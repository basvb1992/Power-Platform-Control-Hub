/**
 * Tombstone service — persists deleted resource IDs across sessions so they
 * stay hidden until the Inventory API refreshes.
 *
 * CURRENT IMPLEMENTATION: localStorage (per user, per browser).
 *   Works out of the box with no extra setup.
 *
 * UPGRADE PATH (shared across all users):
 *   1. Import the solution in `solution/` → creates `ppa_resourcetombstone` table.
 *   2. Run: npx power-apps add-data-source --api-id dataverse
 *            --resource-name ppa_resourcetombstone --org-url <your-org-url>
 *   3. Replace load/save below with the generated Dataverse service calls.
 */

const LS_KEY = 'ppa_resourceTombstones';
const MAX_AGE_DAYS = 30; // auto-expire; Inventory API will have refreshed by then

export interface TombstoneEntry {
  resourceId: string;
  resourceType: string;
  environmentId: string;
  displayName: string;
  deletedOn: string; // ISO 8601
  deletedBy: string;
}

// ── Storage helpers ────────────────────────────────────────────────────────

function load(): TombstoneEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as TombstoneEntry[];
    const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
    return entries.filter((e) => new Date(e.deletedOn).getTime() > cutoff);
  } catch {
    return [];
  }
}

function persist(entries: TombstoneEntry[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch {
    // Storage quota exceeded — not critical, in-memory state still works
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/** Returns the set of resource IDs that have been tombstoned. */
export function getTombstonedIds(): Set<string> {
  return new Set(load().map((e) => e.resourceId));
}

/** Records a deleted resource. No-ops if already tombstoned. */
export function addTombstone(entry: Omit<TombstoneEntry, 'deletedOn'>): void {
  const entries = load();
  if (entries.some((e) => e.resourceId === entry.resourceId)) return;
  entries.push({ ...entry, deletedOn: new Date().toISOString() });
  persist(entries);
}

/** Removes a tombstone (used to roll back a failed delete). */
export function removeTombstone(resourceId: string): void {
  persist(load().filter((e) => e.resourceId !== resourceId));
}
