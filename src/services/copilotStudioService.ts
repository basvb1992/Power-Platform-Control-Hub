import type { Bots } from '../generated/models/BotsModel.ts';
import { BotsService } from '../generated/services/BotsService.ts';
import { PowerPlatformforAdminsService } from '../generated/services/PowerPlatformforAdminsService.ts';
import { PowerPlatformforAdminsV2Service } from '../generated/services/PowerPlatformforAdminsV2Service.ts';
import type { IOperationResult } from '@microsoft/power-apps/data';
import { getDataverseBotById, listDataverseBots } from './dataverseConnectorService.ts';

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
 * Fetch bot details: first try the admin env Dataverse, then cross-environment
 * via the Microsoft Dataverse connector (GetItemWithOrganization /
 * ListRecordsWithOrganization operations).
 * Returns `{ bot, crossEnvError }` so callers can show meaningful diagnostics.
 */
export async function fetchBotDetails(
  resourceName: string,
  envInfo?: BotEnvironmentInfo,
): Promise<{ bot: Bots | null; crossEnvError?: string }> {
  // Try admin env first (by ID, then by name)
  const byId = await getBotById(resourceName);
  if (byId) return { bot: byId };
  const byName = await findBotByName(resourceName);
  if (byName) return { bot: byName };

  // Cross-environment query via the Dataverse connector
  if (envInfo?.instanceUrl) {
    try {
      // Try by ID first
      const result = await getDataverseBotById(envInfo.instanceUrl, resourceName, BOT_SELECT);
      const bot = unwrap(result);
      if (bot?.botid) return { bot };
    } catch {
      // Not found by ID — try by name filter
    }

    try {
      const result = await listDataverseBots(envInfo.instanceUrl, `name eq '${resourceName}'`, BOT_SELECT);
      const data = unwrap(result);
      const bot = data.value?.[0] ?? null;
      if (bot?.botid) return { bot };
    } catch (e) {
      return { bot: null, crossEnvError: e instanceof Error ? e.message : String(e) };
    }
  }

  return { bot: null };
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
