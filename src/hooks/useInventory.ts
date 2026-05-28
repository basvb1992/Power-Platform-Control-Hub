import { useCallback, useEffect, useState } from 'react';
import {
  computeResourceCounts,
  fetchEnvironments,
  fetchResources,
} from '../services/inventoryApi.ts';
import type { Resource, ResourceCounts } from '../types/inventory.ts';

export interface UseInventoryResult {
  resources: Resource[];
  environments: Resource[];
  counts: ResourceCounts | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useInventory(): UseInventoryResult {
  const [resources, setResources] = useState<Resource[]>([]);
  const [environments, setEnvironments] = useState<Resource[]>([]);
  const [counts, setCounts] = useState<ResourceCounts | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [fetchedResources, fetchedEnvironments] = await Promise.all([
        fetchResources(),
        fetchEnvironments(),
      ]);

      setResources(fetchedResources);
      setEnvironments(fetchedEnvironments);
      setCounts(computeResourceCounts(fetchedResources));
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : 'Failed to load Power Platform inventory.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { resources, environments, counts, isLoading, error, refresh };
}
