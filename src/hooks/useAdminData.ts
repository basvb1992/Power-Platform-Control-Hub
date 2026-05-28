import { useCallback, useEffect, useState } from 'react';
import {
  fetchAdvisorRecommendations,
  fetchBillingPolicies,
  fetchCrossTenantReports,
  fetchEnvironmentGroups,
  fetchRoleAssignments,
} from '../services/adminApi.ts';
import type {
  AdvisorRecommendation,
  BillingPolicy,
  CrossTenantReport,
  EnvironmentGroup,
  RoleAssignment,
} from '../types/admin.ts';

export interface UseAdminDataResult {
  recommendations: AdvisorRecommendation[];
  roleAssignments: RoleAssignment[];
  envGroups: EnvironmentGroup[];
  billingPolicies: BillingPolicy[];
  crossTenantReports: CrossTenantReport[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAdminData(): UseAdminDataResult {
  const [recommendations, setRecommendations] = useState<AdvisorRecommendation[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [envGroups, setEnvGroups] = useState<EnvironmentGroup[]>([]);
  const [billingPolicies, setBillingPolicies] = useState<BillingPolicy[]>([]);
  const [crossTenantReports, setCrossTenantReports] = useState<CrossTenantReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetData = useCallback(() => {
    setRecommendations([]);
    setRoleAssignments([]);
    setEnvGroups([]);
    setBillingPolicies([]);
    setCrossTenantReports([]);
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [
        fetchedRecommendations,
        fetchedRoleAssignments,
        fetchedEnvironmentGroups,
        fetchedBillingPolicies,
        fetchedCrossTenantReports,
      ] = await Promise.all([
        fetchAdvisorRecommendations(),
        fetchRoleAssignments(),
        fetchEnvironmentGroups(),
        fetchBillingPolicies(),
        fetchCrossTenantReports(),
      ]);

      setRecommendations(fetchedRecommendations);
      setRoleAssignments(fetchedRoleAssignments);
      setEnvGroups(fetchedEnvironmentGroups);
      setBillingPolicies(fetchedBillingPolicies);
      setCrossTenantReports(fetchedCrossTenantReports);
    } catch (e: unknown) {
      resetData();
      setError(
        e instanceof Error ? e.message : 'Failed to load Power Platform admin data.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [resetData]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    recommendations,
    roleAssignments,
    envGroups,
    billingPolicies,
    crossTenantReports,
    isLoading,
    error,
    refresh,
  };
}
