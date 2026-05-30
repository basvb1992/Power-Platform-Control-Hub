/**
 * Cross-environment Dataverse queries via the Microsoft Dataverse connector
 * (shared_commondataserviceforapps). Using the `GetItemWithOrganization` and
 * `ListRecordsWithOrganization` operations passes an `organization` header that
 * routes the call to the correct environment's Dataverse — the connector handles
 * authentication automatically without any internal SDK hacks.
 */
import { getClient } from '@microsoft/power-apps/data';
import type { IOperationResult } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo.ts';
import type { Bots } from '../generated/models/BotsModel.ts';

const client = getClient(dataSourcesInfo);
const DATA_SOURCE = 'commondataserviceforapps';

/**
 * Fetch a single bot record from any Dataverse environment by its ID.
 * @param instanceUrl  The Dataverse org URL, e.g. "https://orgXXX.crm.dynamics.com"
 * @param botId        The bot's GUID (the `name` field on the Inventory resource)
 * @param $select      Comma-separated list of OData fields to retrieve
 */
export async function getDataverseBotById(
  instanceUrl: string,
  botId: string,
  $select: string,
): Promise<IOperationResult<Bots>> {
  const org = instanceUrl.endsWith('/') ? instanceUrl.slice(0, -1) : instanceUrl;
  return client.executeAsync<Record<string, unknown>, Bots>({
    connectorOperation: {
      tableName: DATA_SOURCE,
      operationName: 'GetItemWithOrganization',
      parameters: {
        organization: org,
        entityName: 'bots',
        recordId: botId,
        prefer: 'odata.include-annotations=*',
        accept: 'application/json',
        '$select': $select,
      },
    },
  });
}

/**
 * List bot records from any Dataverse environment using an OData filter.
 * Returns the `value` array from the OData response.
 * @param instanceUrl  The Dataverse org URL
 * @param $filter      OData filter expression, e.g. "name eq 'abc123'"
 * @param $select      Comma-separated list of OData fields to retrieve
 */
export async function listDataverseBots(
  instanceUrl: string,
  $filter: string,
  $select: string,
): Promise<IOperationResult<{ value?: Bots[] }>> {
  const org = instanceUrl.endsWith('/') ? instanceUrl.slice(0, -1) : instanceUrl;
  return client.executeAsync<Record<string, unknown>, { value?: Bots[] }>({
    connectorOperation: {
      tableName: DATA_SOURCE,
      operationName: 'ListRecordsWithOrganization',
      parameters: {
        organization: org,
        entityName: 'bots',
        '$filter': $filter,
        '$select': $select,
        '$top': 1,
        accept: 'application/json',
      },
    },
  });
}
