import { useState, useEffect, useCallback } from 'react';
import {
  fetchResources,
  fetchEnvironments,
  computeResourceCounts,
} from '../services/inventoryApi.ts';
import type { Resource, ResourceCounts } from '../types/inventory.ts';

interface UseInventoryOptions {
  isAuthenticated: boolean;
  getToken: () => Promise<string | null>;
}

export interface UseInventoryResult {
  resources: Resource[];
  environments: Resource[];
  counts: ResourceCounts | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useInventory({
  isAuthenticated,
  getToken,
}: UseInventoryOptions): UseInventoryResult {
  const [resources, setResources] = useState<Resource[]>([]);
  const [environments, setEnvironments] = useState<Resource[]>([]);
  const [counts, setCounts] = useState<ResourceCounts | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setError('Could not acquire an access token. Please sign in again.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [fetchedResources, fetchedEnvironments] = await Promise.all([
        fetchResources(token),
        fetchEnvironments(token),
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
  }, [getToken]);

  useEffect(() => {
    if (isAuthenticated) {
      void loadData();
    }
  }, [isAuthenticated, loadData]);

  return { resources, environments, counts, isLoading, error, refresh: loadData };
}
