import type { Bots } from '../generated/models/BotsModel.ts';
import { BotsService } from '../generated/services/BotsService.ts';
import { PowerPlatformforAdminsService } from '../generated/services/PowerPlatformforAdminsService.ts';
import { PowerPlatformforAdminsV2Service } from '../generated/services/PowerPlatformforAdminsV2Service.ts';
import type { IOperationResult } from '@microsoft/power-apps/data';

const API_VERSION = '2024-10-01';

const BOT_SELECT = [
  'botid', 'name', 'statecode', 'statuscode', 'schemaname',
  'language', 'authenticationmode', 'authenticationtrigger',
  'publishedon', 'template', 'configuration',
  'createdon', 'modifiedon',
  '_ownerid_value', 'owneridname',
  '_createdby_value', 'createdbyname',
  '_modifiedby_value', 'modifiedbyname',
].join(',');

function unwrap<T>(result: IOperationResult<T>): T {
  if (!result.success || result.error) {
    const raw = result.error?.message ?? 'Operation failed';
    let msg = raw;
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string; code?: string }; message?: string; code?: string };
      if (parsed?.error?.message) {
        msg = parsed.error.code ? `[${parsed.error.code}] ${parsed.error.message}` : parsed.error.message;
      } else if (parsed?.message) {
        msg = parsed.code ? `[${parsed.code}] ${parsed.message}` : parsed.message;
      }
    } catch {
      // not JSON
    }
    throw new Error(msg);
  }
  return result.data;
}

export interface BotEnvironmentInfo {
  instanceUrl?: string;
  instanceApiUrl?: string;
  uniqueName?: string;
  friendlyName?: string;
}

/** Resolve Dataverse instance URL for an environment using the Power Platform for Admins connector. */
export async function getEnvironmentDataverseInfo(environmentId: string): Promise<BotEnvironmentInfo> {
  try {
    const result = await PowerPlatformforAdminsService.GetSingleEnvironment(environmentId);
    const env = unwrap(result);
    const linked = env.properties?.linkedEnvironmentMetadata;
    return {
      instanceUrl: linked?.instanceUrl,
      instanceApiUrl: linked?.instanceApiUrl,
      uniqueName: linked?.uniqueName,
      friendlyName: linked?.friendlyName,
    };
  } catch {
    return {};
  }
}

/**
 * Query any environment's Dataverse directly by making an OData call via the Power Apps
 * internal HTTP + identity plugins. This allows cross-environment bot lookups without
 * requiring a pre-configured Dataverse connection for every environment.
 *
 * Uses the same `AppHttpClientPlugin` / `AppIdentityServicePlugin` mechanism that the
 * built-in CDS client uses, so auth is handled identically.
 */
async function getExecutor(): Promise<{ execute: <T>(service: string, action: string, params: unknown[]) => Promise<{ success: boolean; data: T }> } | null> {
  try {
    // @ts-expect-error — internal Power Apps SDK path not in exports map but physically present
    const mod = await import('@microsoft/power-apps/dist/internal/data/core/runtime/getRuntimeContext') as { getExecutor: () => { execute: <T>(service: string, action: string, params: unknown[]) => Promise<{ success: boolean; data: T }> } };
    return mod.getExecutor();
  } catch {
    return null;
  }
}

async function fetchBotFromEnvironment(
  instanceUrl: string,
  uniqueName: string,
  botId: string,
): Promise<Bots | null> {
  try {
    const executor = await getExecutor();
    if (!executor) return null;
    // Get a dynamic Bearer token for the target Dataverse environment.
    const tokenResult = await executor.execute<string>(
      'AppIdentityServicePlugin',
      'getAppDynamicResourceAccessTokenAsync',
      [uniqueName],
    );
    if (!tokenResult.success || !tokenResult.data) return null;
    const token = tokenResult.data;

    const base = instanceUrl.endsWith('/') ? instanceUrl : `${instanceUrl}/`;
    const url = `${base}api/data/v9.2/bots(${botId})?$select=${BOT_SELECT}`;

    const response = await executor.execute<[Record<string, unknown>, ArrayBuffer]>(
      'AppHttpClientPlugin',
      'sendHttpAsync',
      [
        {
          url,
          method: 'GET',
          requestSource: 'PublishedApp',
          allowSessionStorage: true,
          returnDirectResponse: true,
          headers: {
            Authorization: `dynamicauth ${token}`,
            Accept: 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        },
        '',
        'arraybuffer',
      ],
    );

    if (!response.success || !response.data) return null;
    const [, buffer] = response.data;
    const text = new TextDecoder().decode(buffer);
    const bot = JSON.parse(text) as Bots;
    return bot?.botid ? bot : null;
  } catch {
    return null;
  }
}

/**
 * Search for a bot in a cross-environment Dataverse by display name or schema name.
 * Falls back to OData $filter query when the bot ID lookup returns nothing.
 */
async function findBotInEnvironment(
  instanceUrl: string,
  uniqueName: string,
  botName: string,
): Promise<Bots | null> {
  try {
    const executor = await getExecutor();
    if (!executor) return null;
    const tokenResult = await executor.execute<string>(
      'AppIdentityServicePlugin',
      'getAppDynamicResourceAccessTokenAsync',
      [uniqueName],
    );
    if (!tokenResult.success || !tokenResult.data) return null;
    const token = tokenResult.data;

    const base = instanceUrl.endsWith('/') ? instanceUrl : `${instanceUrl}/`;
    const filter = encodeURIComponent(`name eq '${botName}'`);
    const url = `${base}api/data/v9.2/bots?$select=${BOT_SELECT}&$filter=${filter}&$top=1`;

    const response = await executor.execute<[Record<string, unknown>, ArrayBuffer]>(
      'AppHttpClientPlugin',
      'sendHttpAsync',
      [
        {
          url,
          method: 'GET',
          requestSource: 'PublishedApp',
          allowSessionStorage: true,
          returnDirectResponse: true,
          headers: {
            Authorization: `dynamicauth ${token}`,
            Accept: 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        },
        '',
        'arraybuffer',
      ],
    );

    if (!response.success || !response.data) return null;
    const [, buffer] = response.data;
    const text = new TextDecoder().decode(buffer);
    const parsed = JSON.parse(text) as { value?: Bots[] };
    return parsed?.value?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Fetch a bot record from the admin environment's Dataverse by botId. */
export async function getBotById(botId: string): Promise<Bots | null> {
  try {
    const result = await BotsService.get(botId, {
      select: [
        'botid', 'name', 'statecode', 'statuscode', 'schemaname',
        'language', 'authenticationmode', 'authenticationtrigger',
        'publishedon', 'template', 'configuration',
        'createdon', 'modifiedon',
        '_ownerid_value', 'owneridname',
        '_createdby_value', 'createdbyname',
        '_modifiedby_value', 'modifiedbyname',
      ],
    });
    return unwrap(result);
  } catch {
    return null;
  }
}

/** Search for a bot in the admin environment's Dataverse by name (GUID match). */
export async function findBotByName(botName: string): Promise<Bots | null> {
  try {
    const result = await BotsService.getAll({
      select: [
        'botid', 'name', 'statecode', 'statuscode', 'schemaname',
        'language', 'authenticationmode', 'authenticationtrigger',
        'publishedon', 'template', 'configuration',
        'createdon', 'modifiedon',
        '_ownerid_value', 'owneridname',
        '_createdby_value', 'createdbyname',
      ],
      filter: `name eq '${botName}'`,
      top: 1,
    });
    const bots = unwrap(result);
    return bots.length > 0 ? bots[0] : null;
  } catch {
    return null;
  }
}

/**
 * Fetch bot details: first try the admin env Dataverse, then fall back to the
 * agent's own environment Dataverse (cross-environment query).
 */
export async function fetchBotDetails(
  resourceName: string,
  envInfo?: BotEnvironmentInfo,
): Promise<Bots | null> {
  // Try admin env first (by ID, then by name)
  const byId = await getBotById(resourceName);
  if (byId) return byId;
  const byName = await findBotByName(resourceName);
  if (byName) return byName;

  // Fall back to cross-environment query if we have Dataverse info for the agent's env
  if (envInfo?.instanceUrl && envInfo?.uniqueName) {
    const crossEnvById = await fetchBotFromEnvironment(envInfo.instanceUrl, envInfo.uniqueName, resourceName);
    if (crossEnvById) return crossEnvById;
    return findBotInEnvironment(envInfo.instanceUrl, envInfo.uniqueName, resourceName);
  }

  return null;
}

// ── Admin actions (cross-environment via Admin V2 connector) ──────────────────

export async function deleteCopilotAgent(environmentId: string, botId: string): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.DeleteCopilotAgent(environmentId, botId, API_VERSION);
  unwrap(result);
}

export async function getBotQuarantineStatus(environmentId: string, botId: string): Promise<boolean> {
  const result = await PowerPlatformforAdminsV2Service.GetBotQuarantineStatus(environmentId, botId, API_VERSION);
  const status = unwrap(result);
  return status.isBotQuarantined ?? false;
}

export async function quarantineBot(environmentId: string, botId: string): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.SetBotAsQuarantined(environmentId, botId, API_VERSION);
  unwrap(result);
}

export async function unquarantineBot(environmentId: string, botId: string): Promise<void> {
  const result = await PowerPlatformforAdminsV2Service.SetBotAsUnquarantined(environmentId, botId, API_VERSION);
  unwrap(result);
}
