import { useCallback, useEffect, useState } from 'react';
import {
  fetchAdvisorRecommendations,
  fetchAllRuleAssignments,
  fetchBillingPolicies,
  fetchCrossTenantReports,
  fetchEnvironmentGroups,
  fetchRoleAssignments,
  fetchRuleBasedPolicies,
  fetchRuleSets,
} from '../services/adminApi.ts';
import { fetchDlpPolicies } from '../services/dlpService.ts';
import { extractMessage } from '../utils/errorUtils.ts';
import type {
  AdvisorRecommendation,
  BillingPolicy,
  CrossTenantReport,
  EnvironmentGroup,
  GovernanceRuleSet,
  PolicyRuleAssignment,
  RoleAssignment,
  RuleBasedPolicy,
} from '../types/admin.ts';
import type { PolicyV2 } from '../services/dlpService.ts';

export interface UseAdminDataResult {
  recommendations: AdvisorRecommendation[];
  roleAssignments: RoleAssignment[];
  envGroups: EnvironmentGroup[];
  billingPolicies: BillingPolicy[];
  crossTenantReports: CrossTenantReport[];
  ruleBasedPolicies: RuleBasedPolicy[];
  ruleAssignments: PolicyRuleAssignment[];
  ruleSets: GovernanceRuleSet[];
  dlpPolicies: PolicyV2[];
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
  const [ruleBasedPolicies, setRuleBasedPolicies] = useState<RuleBasedPolicy[]>([]);
  const [ruleAssignments, setRuleAssignments] = useState<PolicyRuleAssignment[]>([]);
  const [ruleSets, setRuleSets] = useState<GovernanceRuleSet[]>([]);
  const [dlpPolicies, setDlpPolicies] = useState<PolicyV2[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetData = useCallback(() => {
    setRecommendations([]);
    setRoleAssignments([]);
    setEnvGroups([]);
    setBillingPolicies([]);
    setCrossTenantReports([]);
    setRuleBasedPolicies([]);
    setRuleAssignments([]);
    setRuleSets([]);
    setDlpPolicies([]);
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
        e instanceof Error ? extractMessage(e.message) : 'Failed to load Power Platform admin data.',
      );
    } finally {
      setIsLoading(false);
    }

    // Fetch policy data best-effort — failures here don't affect the rest of the data
    try {
      const [policies, assignments, sets] = await Promise.all([
        fetchRuleBasedPolicies(),
        fetchAllRuleAssignments(),
        fetchRuleSets(),
      ]);
      setRuleBasedPolicies(policies);
      setRuleAssignments(assignments);
      setRuleSets(sets);
    } catch {
      // Policy APIs may not be available in all tenants — leave empty
    }

    // Fetch DLP policies best-effort
    try {
      const dlp = await fetchDlpPolicies();
      setDlpPolicies(dlp);
    } catch {
      // DLP API may not be available in all tenants — leave empty
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
    ruleBasedPolicies,
    ruleAssignments,
    ruleSets,
    dlpPolicies,
    isLoading,
    error,
    refresh,
  };
}
