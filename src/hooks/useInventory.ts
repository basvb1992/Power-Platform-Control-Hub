import { useCallback, useEffect, useState } from 'react';
import {
  computeResourceCounts,
  fetchEnvironments,
  fetchResources,
} from '../services/inventoryApi.ts';
import type { Resource, ResourceCounts } from '../types/inventory.ts';
import { extractMessage } from '../utils/errorUtils.ts';

export interface UseInventoryResult {
  resources: Resource[];
  environments: Resource[];
  counts: ResourceCounts | null;
  isLoading: boolean;
  loadingLabel: string | null;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useInventory(): UseInventoryResult {
  const [resources, setResources] = useState<Resource[]>([]);
  const [environments, setEnvironments] = useState<Resource[]>([]);
  const [counts, setCounts] = useState<ResourceCounts | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadingLabel('Loading resources…');
    setError(null);

    try {
      const [fetchedResources, fetchedEnvironments] = await Promise.all([
        fetchResources((page, count) => {
          if (page > 1) setLoadingLabel(`Loading resources… (${count.toLocaleString()} so far)`);
        }),
        fetchEnvironments(),
      ]);

      setResources(fetchedResources);
      setEnvironments(fetchedEnvironments);
      setCounts(computeResourceCounts(fetchedResources));
    } catch (e: unknown) {
      setError(
        e instanceof Error ? extractMessage(e.message) : 'Failed to load Power Platform inventory.',
      );
    } finally {
      setIsLoading(false);
      setLoadingLabel(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { resources, environments, counts, isLoading, loadingLabel, error, refresh };
}
