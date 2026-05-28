import type { IOperationResult } from '@microsoft/power-apps/data';
import type {
  ResourceItem,
  ResourceQueryRequest,
  ResourceQueryResponse,
} from '../generated/models/PowerPlatformforAdminsV2Model.ts';
import { PowerPlatformforAdminsV2Service } from '../generated/services/PowerPlatformforAdminsV2Service.ts';
import type { Resource, ResourceCounts } from '../types/inventory.ts';

const API_VERSION = '2024-10-01';

function unwrapOperationResult<T>(result: IOperationResult<T>): T {
  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.value;
}

function normalizeResource(resource: ResourceItem): Resource {
  const record = resource as ResourceItem & { joinKey?: string };

  return {
    id: resource.id,
    name: resource.name ?? '',
    type: resource.type ?? '',
    location: resource.location,
    properties: (resource.properties as Resource['properties'] | undefined) ?? {},
    joinKey: record.joinKey,
    environmentName: resource.environmentName,
    environmentRegion: resource.environmentRegion,
    environmentType: resource.environmentType,
    isManagedEnvironment: resource.isManagedEnvironment,
  };
}

async function queryInventory(body: ResourceQueryRequest): Promise<ResourceQueryResponse> {
  const result = await PowerPlatformforAdminsV2Service.QueryResources(API_VERSION, body);
  return unwrapOperationResult(result);
}

/**
 * Fetches all non-environment Power Platform resources (canvas apps, model-driven
 * apps, cloud flows, agents, agent flows, app builder apps, M365 agent flows,
 * and code apps) enriched with environment info.
 */
export async function fetchResources(): Promise<Resource[]> {
  const body: ResourceQueryRequest = {
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
          "'microsoft.powerapps/apps'",
          "'microsoft.powerautomate/m365agentflows'",
          "'microsoft.powerapps/codeapps'",
        ],
      },
      {
        $type: 'extend',
        FieldName: 'createdAtStr',
        Expression: 'tostring(properties.createdAt)',
      },
      {
        $type: 'orderby',
        FieldNamesAscDesc: {
          createdAtStr: 'desc',
        },
      },
    ],
  };

  const result = await queryInventory(body);
  return (result.data ?? []).map(normalizeResource);
}

/** Fetches all Power Platform environments. */
export async function fetchEnvironments(): Promise<Resource[]> {
  const body: ResourceQueryRequest = {
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
        $type: 'extend',
        FieldName: 'displayNameStr',
        Expression: 'tostring(properties.displayName)',
      },
      {
        $type: 'orderby',
        FieldNamesAscDesc: {
          displayNameStr: 'asc',
        },
      },
    ],
  };

  const result = await queryInventory(body);
  return (result.data ?? []).map(normalizeResource);
}

/** Computes resource counts from an already-fetched resource array. */
export function computeResourceCounts(resources: Resource[]): ResourceCounts {
  const counts: ResourceCounts = {
    canvasApps: 0,
    modelDrivenApps: 0,
    cloudFlows: 0,
    agents: 0,
    agentFlows: 0,
    appBuilderApps: 0,
    m365AgentFlows: 0,
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
      case 'microsoft.powerapps/apps':
        counts.appBuilderApps++;
        break;
      case 'microsoft.powerautomate/m365agentflows':
        counts.m365AgentFlows++;
        break;
      case 'microsoft.powerapps/codeapps':
        counts.codeApps++;
        break;
    }
  }

  return counts;
}
