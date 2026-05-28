import type { IOperationResult } from '@microsoft/power-apps/data';
import type {
  CrossTenantConnectionReport as CrossTenantConnectionReportModel,
  EnvironmentGroup as EnvironmentGroupModel,
  Principal,
} from '../generated/models/PowerPlatformforAdminsV2Model.ts';
import { PowerPlatformforAdminsV2Service } from '../generated/services/PowerPlatformforAdminsV2Service.ts';
import type { CrossTenantReport, EnvironmentGroup } from '../types/admin.ts';

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
