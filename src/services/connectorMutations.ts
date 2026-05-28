import type { IOperationResult } from '@microsoft/power-apps/data';
import { PowerPlatformforAdminsV2Service } from '../generated/services/PowerPlatformforAdminsV2Service.ts';

const API = '2024-10-01';

function unwrapOperationResult<T>(result: IOperationResult<T>): T {
  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.value;
}

export async function deleteConnection(connectionId: string): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.DeleteConnection(connectionId, API);
  unwrapOperationResult(result);
}
