import type { IOperationResult } from '@microsoft/power-apps/data';
import { getContext } from '@microsoft/power-apps/app';
import { PowerPlatformforAdminsV2Service } from '../generated/services/PowerPlatformforAdminsV2Service.ts';

const API = '2024-10-01';

function unwrapOperationResult<T>(result: IOperationResult<T>): T {
  if (!result.success || result.error) {
    throw new Error(result.error?.message ?? 'Operation failed');
  }
  return result.data;
}

export async function enableEnvironment(environmentId: string): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.EnableEnvironment(environmentId, API);
  unwrapOperationResult(result);
}

export async function disableEnvironment(environmentId: string, reason = 'UserRequested'): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.DisableEnvironment(environmentId, API, undefined, undefined, { reason });
  unwrapOperationResult(result);
}

export async function enableManagedEnvironment(environmentId: string): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.EnableManagedEnvironment(environmentId, API);
  unwrapOperationResult(result);
}

export async function disableManagedEnvironment(environmentId: string): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.DisableManagedEnvironment(environmentId, API);
  unwrapOperationResult(result);
}

export async function createEnvironmentBackup(environmentId: string, notes: string): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.CreateEnvironmentBackup(
    environmentId,
    API,
    { label: notes },
  );
  unwrapOperationResult(result);
}

/**
 * Adds the currently signed-in user as System Administrator on the given environment.
 * Looks up the System Administrator role definition by name from ListRoleDefinitions,
 * then calls CreateEnvironmentRoleAssignment.
 */
export async function addSelfAsEnvironmentAdmin(environmentId: string): Promise<void> {
  const ctx = await getContext();
  const objectId = ctx.user.objectId;
  if (!objectId) throw new Error('Could not determine current user object ID.');

  // Find the System Administrator role definition ID
  const rolesResult = await PowerPlatformforAdminsV2Service.ListRoleDefinitions(API);
  const roles = unwrapOperationResult(rolesResult);
  const sysAdminRole = roles.value?.find(
    (r) => r.roleDefinitionName?.toLowerCase() === 'system administrator',
  );
  if (!sysAdminRole?.roleDefinitionId) {
    throw new Error('Could not find System Administrator role definition.');
  }

  const assignResult = await PowerPlatformforAdminsV2Service.CreateEnvironmentRoleAssignment(
    environmentId,
    API,
    {
      principalObjectId: objectId,
      roleDefinitionId: sysAdminRole.roleDefinitionId,
      principalType: 'User',
    },
  );
  unwrapOperationResult(assignResult);
}
