import type { IOperationResult } from '@microsoft/power-apps/data';
import type {
  CrossTenantConnectionReport as CrossTenantConnectionReportModel,
  EnvironmentGroup as EnvironmentGroupModel,
  Policy as PolicyModel,
  Principal,
  RuleSetDto,
} from '../generated/models/PowerPlatformforAdminsV2Model.ts';
import { PowerPlatformforAdminsV2Service } from '../generated/services/PowerPlatformforAdminsV2Service.ts';
import type { CrossTenantReport, EnvironmentGroup, GovernanceRuleSet, RuleBasedPolicy } from '../types/admin.ts';

const API = '2024-10-01';

function unwrapOperationResult<T>(result: IOperationResult<T>): T {
  if (!result.success || result.error) {
    throw new Error(result.error?.message ?? 'Operation failed');
  }
  return result.data;
}

function mapPrincipal(principal?: Principal) {
  return {
    id: principal?.id ?? '',
    displayName: principal?.displayName,
    email: principal?.email,
    type: principal?.type ?? '',
    tenantId: principal?.tenantId,
  };
}

function mapEnvironmentGroup(group: EnvironmentGroupModel): EnvironmentGroup {
  return {
    id: group.id ?? '',
    displayName: group.displayName ?? '',
    description: group.description ?? '',
    parentGroupId: group.parentGroupId,
    childrenGroupIds: group.childrenGroupIds,
    createdTime: group.createdTime ?? '',
    createdBy: mapPrincipal(group.createdBy),
    lastModifiedTime: group.lastModifiedTime ?? '',
    lastModifiedBy: mapPrincipal(group.lastModifiedBy),
  };
}

function mapCrossTenantReport(report: CrossTenantConnectionReportModel): CrossTenantReport {
  return {
    tenantId: report.tenantId,
    reportId: report.reportId,
    requestDate: report.requestDate,
    startDate: report.startDate,
    endDate: report.endDate,
    status: report.status,
    connections: report.connections?.map((connection) => ({
      tenantId: connection.tenantId,
      connectionType: connection.connectionType,
    })),
  };
}

export async function createEnvironmentGroup(displayName: string, description: string): Promise<EnvironmentGroup> {
  const body: EnvironmentGroupModel = { displayName, description };
  const result = await PowerPlatformforAdminsV2Service.CreateEnvironmentGroup(API, body);
  return mapEnvironmentGroup(unwrapOperationResult(result));
}

export async function updateEnvironmentGroup(id: string, displayName: string, description: string): Promise<EnvironmentGroup> {
  const body: EnvironmentGroupModel = { id, displayName, description };
  const result = await PowerPlatformforAdminsV2Service.UpdateEnvironmentGroup(id, API, body);
  return mapEnvironmentGroup(unwrapOperationResult(result));
}

export async function deleteEnvironmentGroup(id: string): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.DeleteEnvironmentGroup(id, API);
  unwrapOperationResult(result);
}

export async function triggerCrossTenantReport(): Promise<CrossTenantReport> {
  const result = await PowerPlatformforAdminsV2Service.CreateCrossTenantConnectionReport(API);
  return mapCrossTenantReport(unwrapOperationResult(result));
}

export async function createRuleBasedPolicy(name: string): Promise<RuleBasedPolicy> {
  const result = await PowerPlatformforAdminsV2Service.CreateRuleBasedPolicy(API, { name });
  const p: PolicyModel = unwrapOperationResult(result);
  return { id: p.id ?? '', name: p.name ?? '', lastModified: p.lastModified ?? '', ruleSetCount: p.ruleSetCount ?? 0, ruleSets: [] };
}

export async function assignPolicyToGroup(policyId: string, groupId: string): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.CreateEnviornmentGroupRuleBasedAssignment(policyId, groupId, API, {});
  unwrapOperationResult(result);
}

export async function updateRuleBasedPolicy(
  policyId: string,
  name: string,
  ruleSets: { id: string; version: string; inputs: Record<string, unknown> }[],
): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.UpdateRuleBasedPolicyByID(policyId, API, {
    name,
    ruleSets: ruleSets.map((rs) => ({ id: rs.id, version: rs.version, inputs: rs.inputs })),
  });
  unwrapOperationResult(result);
}

function toRuleSetDto(rs: Omit<GovernanceRuleSet, 'id' | 'lastModified'>): RuleSetDto {
  return {
    environmentFilter: {
      type: rs.environmentFilterType || undefined,
      values: rs.environmentFilterValues.map((v) => ({ id: v.id, type: v.type, name: v.name })),
    },
    parameters: rs.parameters.map((p) => ({
      type: p.type,
      resourceType: p.resourceType,
      value: p.rules.map((r) => ({ id: r.id, value: r.value })),
    })),
  };
}

export async function createGovernanceRuleSet(groupId: string, rs: Omit<GovernanceRuleSet, 'id' | 'lastModified'>): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.CreateRuleSet(groupId, API, toRuleSetDto(rs));
  unwrapOperationResult(result);
}

export async function updateGovernanceRuleSet(ruleSetId: string, rs: Omit<GovernanceRuleSet, 'id' | 'lastModified'>): Promise<GovernanceRuleSet> {
  const result = await PowerPlatformforAdminsV2Service.UpdateRuleSet(ruleSetId, API, toRuleSetDto(rs));
  const dto = unwrapOperationResult(result);
  return {
    id: dto.id ?? ruleSetId,
    lastModified: dto.lastModified ?? '',
    environmentFilterType: dto.environmentFilter?.type ?? '',
    environmentFilterValues: (dto.environmentFilter?.values ?? []).map((v) => ({ id: v.id ?? '', type: v.type ?? '', name: v.name ?? '' })),
    parameters: (dto.parameters ?? []).map((p) => ({
      type: p.type ?? '',
      resourceType: p.resourceType ?? '',
      rules: (p.value ?? []).map((r) => ({ id: r.id ?? '', value: r.value ?? '' })),
    })),
  };
}

export async function deleteGovernanceRuleSet(ruleSetId: string): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.DeleteRuleSet(ruleSetId, API);
  unwrapOperationResult(result);
}
