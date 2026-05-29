import { PowerPlatformforAdminsService } from '../generated/services/PowerPlatformforAdminsService.ts';
import type { IOperationResult } from '@microsoft/power-apps/data';
import type { ManagedPolicyV2, PolicyV2 } from '../generated/models/PowerPlatformforAdminsModel.ts';

function unwrap<T>(result: IOperationResult<T>): T {
  if (result.error) throw new Error(result.error.message ?? JSON.stringify(result.error));
  return result.value as T;
}

export type { PolicyV2 };

export async function fetchDlpPolicies(): Promise<PolicyV2[]> {
  const result = await PowerPlatformforAdminsService.ListPoliciesV2();
  return unwrap(result).value ?? [];
}

export async function createDlpPolicy(data: ManagedPolicyV2): Promise<PolicyV2> {
  const result = await PowerPlatformforAdminsService.CreatePolicyV2(data);
  return unwrap(result) as PolicyV2;
}

export async function deleteDlpPolicy(policyName: string): Promise<void> {
  const result = await PowerPlatformforAdminsService.DeletePolicyV2(policyName);
  unwrap(result);
}
