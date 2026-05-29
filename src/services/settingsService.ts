import { PowerPlatformforAdminsV2Service } from '../generated/services/PowerPlatformforAdminsV2Service.ts';
import type { EnvironmentManagementSetting } from '../generated/models/PowerPlatformforAdminsV2Model.ts';

const API = '2024-10-01';

export async function fetchEnvironmentSettings(environmentId: string): Promise<EnvironmentManagementSetting | null> {
  const result = await PowerPlatformforAdminsV2Service.ListEnvironmentManagementSettings(environmentId, API);
  if (!result.success || result.error) {
    throw new Error(result.error?.message ?? 'Failed to load environment settings');
  }
  return result.data?.objectResult?.[0] ?? null;
}

export async function updateEnvironmentSettings(
  environmentId: string,
  settings: EnvironmentManagementSetting,
): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.UpdateEnvironmentManagementSettings(
    environmentId,
    API,
    settings as unknown as Record<string, unknown>,
  );
  if (!result.success || result.error) {
    throw new Error(result.error?.message ?? 'Failed to update environment settings');
  }
}
