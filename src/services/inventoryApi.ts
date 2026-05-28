import type { InventoryQueryResult, Resource, ResourceCounts } from '../types/inventory.ts';

const API_URL =
  'https://api.powerplatform.com/resourcequery/resources/query?api-version=2024-10-01';

async function queryInventory(
  token: string,
  body: Record<string, unknown>,
): Promise<InventoryQueryResult> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Inventory API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<InventoryQueryResult>;
}

/**
 * Fetches all non-environment Power Platform resources (canvas apps, model-driven
 * apps, cloud flows, agents, agent flows, code apps) enriched with environment info.
 */
export async function fetchResources(token: string): Promise<Resource[]> {
  const body: Record<string, unknown> = {
    Options: { Top: 1000, Skip: 0, SkipToken: '' },
    TableName: 'PowerPlatformResources',
    Clauses: [
      {
        $type: 'extend',
        FieldName: 'joinKey',
        Expression: 'tolower(tostring(properties.environmentId))',
      },
      {
        $type: 'join',
        JoinKind: 'leftouter',
        RightTable: {
          TableName: 'PowerPlatformResources',
          Clauses: [
            {
              $type: 'where',
              FieldName: 'type',
              Operator: '==',
              Values: ["'microsoft.powerplatform/environments'"],
            },
            {
              $type: 'project',
              FieldList: [
                'joinKey = tolower(name)',
                'environmentName = properties.displayName',
                'environmentRegion = location',
                'environmentType = properties.environmentType',
                'isManagedEnvironment = properties.isManaged',
              ],
            },
          ],
        },
        LeftColumnName: 'joinKey',
        RightColumnName: 'joinKey',
      },
      {
        $type: 'where',
        FieldName: 'type',
        Operator: 'in~',
        Values: [
          "'microsoft.powerapps/canvasapps'",
          "'microsoft.powerapps/modeldrivenapps'",
          "'microsoft.powerautomate/cloudflows'",
          "'microsoft.copilotstudio/agents'",
          "'microsoft.powerautomate/agentflows'",
          "'microsoft.powerapps/codeapps'",
        ],
      },
      {
        $type: 'orderby',
        FieldNamesAscDesc: {
          'tostring(properties.createdAt)': 'desc',
        },
      },
    ],
  };

  const result = await queryInventory(token, body);
  return result.data ?? [];
}

/** Fetches all Power Platform environments. */
export async function fetchEnvironments(token: string): Promise<Resource[]> {
  const body: Record<string, unknown> = {
    Options: { Top: 500, Skip: 0, SkipToken: '' },
    TableName: 'PowerPlatformResources',
    Clauses: [
      {
        $type: 'where',
        FieldName: 'type',
        Operator: '==',
        Values: ["'microsoft.powerplatform/environments'"],
      },
      {
        $type: 'orderby',
        FieldNamesAscDesc: {
          'properties.displayName': 'asc',
        },
      },
    ],
  };

  const result = await queryInventory(token, body);
  return result.data ?? [];
}

/** Computes resource counts from an already-fetched resource array. */
export function computeResourceCounts(resources: Resource[]): ResourceCounts {
  const counts: ResourceCounts = {
    canvasApps: 0,
    modelDrivenApps: 0,
    cloudFlows: 0,
    agents: 0,
    agentFlows: 0,
    codeApps: 0,
    total: resources.length,
  };

  for (const r of resources) {
    switch (r.type.toLowerCase()) {
      case 'microsoft.powerapps/canvasapps':
        counts.canvasApps++;
        break;
      case 'microsoft.powerapps/modeldrivenapps':
        counts.modelDrivenApps++;
        break;
      case 'microsoft.powerautomate/cloudflows':
        counts.cloudFlows++;
        break;
      case 'microsoft.copilotstudio/agents':
        counts.agents++;
        break;
      case 'microsoft.powerautomate/agentflows':
        counts.agentFlows++;
        break;
      case 'microsoft.powerapps/codeapps':
        counts.codeApps++;
        break;
    }
  }

  return counts;
}
