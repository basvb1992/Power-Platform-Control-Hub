import type { IOperationResult } from '@microsoft/power-apps/data';
import type {
  Clause,
  ResourceItem,
  ResourceQueryRequest,
  ResourceQueryResponse,
} from '../generated/models/PowerPlatformforAdminsV2Model.ts';
import { PowerPlatformforAdminsV2Service } from '../generated/services/PowerPlatformforAdminsV2Service.ts';
import type { Resource, ResourceCounts } from '../types/inventory.ts';

// Helper: the generated Clause interface only declares $type, but the actual
// clause subtypes (ExtendClause, JoinClause, etc.) carry additional fields.
// This cast lets us pass correctly-shaped objects without fighting the type.
function c(clause: Record<string, unknown>): Clause {
  return clause as unknown as Clause;
}

const API_VERSION = '2024-10-01';

function unwrapOperationResult<T>(result: IOperationResult<T>): T {
  if (!result.success || result.error) {
    throw new Error(result.error?.message ?? 'Operation failed');
  }
  return result.data;
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

async function queryInventoryPage(body: ResourceQueryRequest): Promise<ResourceQueryResponse> {
  const result = await PowerPlatformforAdminsV2Service.QueryResources(API_VERSION, body);
  return unwrapOperationResult(result);
}

/**
 * Fetches all pages for a query, following skipToken continuation tokens.
 * Calls onProgress(pageIndex, totalSoFar) after each page if provided.
 */
async function queryInventoryAll(
  body: ResourceQueryRequest,
  onProgress?: (page: number, count: number) => void,
): Promise<ResourceItem[]> {
  const allItems: ResourceItem[] = [];
  let skipToken: string | undefined;
  let page = 1;

  do {
    const pageBody: ResourceQueryRequest = {
      ...body,
      Options: skipToken
        ? { Top: 1000, SkipToken: skipToken }       // omit Skip when using SkipToken
        : { Top: 1000, Skip: 0, SkipToken: '' },
    };

    const response = await queryInventoryPage(pageBody);
    const items = response.data ?? [];
    allItems.push(...items);
    onProgress?.(page, allItems.length);

    // resultTruncated '0' means more data available; '1' (or missing) means done
    const hasMore = response.resultTruncated === '0' && !!response.skipToken;
    skipToken = hasMore ? response.skipToken : undefined;
    page++;
  } while (skipToken);

  return allItems;
}

/**
 * Fetches all non-environment Power Platform resources (canvas apps, model-driven
 * apps, cloud flows, agents, agent flows, app builder apps, M365 agent flows,
 * and code apps) enriched with environment info. Automatically follows skipToken
 * pagination to retrieve more than 1 000 resources.
 */
export async function fetchResources(
  onProgress?: (page: number, count: number) => void,
): Promise<Resource[]> {
  const body: ResourceQueryRequest = {
    Options: { Top: 1000, Skip: 0, SkipToken: '' },
    TableName: 'PowerPlatformResources',
    Clauses: [
      c({ $type: 'extend', FieldName: 'joinKey', Expression: 'tolower(tostring(properties.environmentId))' }),
      c({
        $type: 'join',
        JoinKind: 'leftouter',
        RightTable: {
          TableName: 'PowerPlatformResources',
          Clauses: [
            c({ $type: 'where', FieldName: 'type', Operator: '==', Values: ["'microsoft.powerplatform/environments'"] }),
            c({ $type: 'project', FieldList: ['joinKey = tolower(name)', 'environmentName = properties.displayName', 'environmentRegion = location', 'environmentType = properties.environmentType', 'isManagedEnvironment = properties.isManaged'] }),
          ],
        },
        LeftColumnName: 'joinKey',
        RightColumnName: 'joinKey',
      }),
      c({
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
      }),
      c({ $type: 'extend', FieldName: 'createdAtStr', Expression: 'tostring(properties.createdAt)' }),
      c({ $type: 'orderby', FieldNamesAscDesc: { createdAtStr: 'desc' } }),
    ],
  };

  const items = await queryInventoryAll(body, onProgress);
  return items.map(normalizeResource);
}

/** Fetches all Power Platform environments, paginating if needed. */
export async function fetchEnvironments(): Promise<Resource[]> {
  const body: ResourceQueryRequest = {
    Options: { Top: 1000, Skip: 0, SkipToken: '' },
    TableName: 'PowerPlatformResources',
    Clauses: [
      c({ $type: 'where', FieldName: 'type', Operator: '==', Values: ["'microsoft.powerplatform/environments'"] }),
      c({ $type: 'extend', FieldName: 'displayNameStr', Expression: 'tostring(properties.displayName)' }),
      c({ $type: 'orderby', FieldNamesAscDesc: { displayNameStr: 'asc' } }),
    ],
  };

  const items = await queryInventoryAll(body);
  return items.map(normalizeResource);
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
