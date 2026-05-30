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

type ExecutorType = { execute: <T>(service: string, action: string, params: unknown[]) => Promise<{ success: boolean; data: T }> };

async function getExecutor(): Promise<ExecutorType | null> {
  try {
    // @ts-expect-error — internal Power Apps SDK path not in exports map but physically present
    const mod = await import('@microsoft/power-apps/dist/internal/data/core/runtime/getRuntimeContext') as { getExecutor: () => ExecutorType };
    return mod.getExecutor();
  } catch {
    return null;
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
/**
 * Attempt to acquire a dynamic Dataverse access token for the given resource identifier.
 * Tries multiple identifier formats so we have the best chance of success against
 * environments that are NOT in the app's pre-configured databaseReferences.
 *
 * The Power Apps player's AppIdentityServicePlugin interprets the string passed to
 * getAppDynamicResourceAccessTokenAsync as the Dataverse resource identifier.
 * Empirically the most reliable format is the full instanceUrl (e.g.
 * "https://orgXXX.crm.dynamics.com/"), followed by the org unique name.
 */
async function acquireDynamicToken(
  instanceUrl: string,
  uniqueName: string,
): Promise<{ token: string; source: string } | null> {
  const executor = await getExecutor();
  if (!executor) return null;

  const candidates = [
    { id: instanceUrl.endsWith('/') ? instanceUrl : `${instanceUrl}/`, label: 'instanceUrl+slash' },
    { id: instanceUrl, label: 'instanceUrl' },
    { id: uniqueName, label: 'uniqueName' },
  ];

  for (const { id, label } of candidates) {
    try {
      const result = await executor.execute<string>(
        'AppIdentityServicePlugin',
        'getAppDynamicResourceAccessTokenAsync',
        [id],
      );
      if (result.success && result.data) {
        return { token: result.data, source: label };
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

/**
 * Parse the HTTP plugin response body into a string regardless of the return shape.
 * With returnDirectResponse:true the executor wraps the result as [responseInfo, ArrayBuffer].
 */
function parseHttpPluginBody(data: unknown): string | null {
  if (Array.isArray(data) && data.length >= 2) {
    const body = data[1];
    if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
    if (typeof body === 'string') return body;
  }
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    try { return JSON.stringify(data); } catch { return null; }
  }
  return null;
}

async function fetchBotFromEnvironment(
  instanceUrl: string,
  uniqueName: string,
  botId: string,
): Promise<Bots | null> {
  const base = instanceUrl.endsWith('/') ? instanceUrl : `${instanceUrl}/`;
  const url = `${base}api/data/v9.2/bots(${botId})?$select=${BOT_SELECT}`;
  const errors: string[] = [];

  try {
    const executor = await getExecutor();
    if (!executor) {
      errors.push('No executor available');
    } else {
      const acquired = await acquireDynamicToken(instanceUrl, uniqueName);
      if (!acquired) {
        errors.push('Token acquisition failed for all candidate identifiers');
      } else {
        const { token, source } = acquired;

        // Strategy A: direct fetch with the token as Bearer (works if token is a real AAD JWT)
        try {
          const resp = await fetch(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
              'OData-MaxVersion': '4.0',
              'OData-Version': '4.0',
            },
          });
          if (resp.ok) {
            const bot = await resp.json() as Bots;
            if (bot?.botid) return bot;
            errors.push(`Bearer fetch (${source}): ok but missing botid`);
          } else if (resp.status === 404) {
            return null; // Bot doesn't exist in this environment
          } else {
            errors.push(`Bearer fetch (${source}): HTTP ${resp.status}`);
          }
        } catch (e) {
          errors.push(`Bearer fetch (${source}): ${e instanceof Error ? e.message : String(e)}`);
        }

        // Strategy B: AppHttpClientPlugin with dynamicauth token
        try {
          const httpResult = await executor.execute<unknown>(
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
          if (httpResult.success && httpResult.data) {
            const text = parseHttpPluginBody(httpResult.data);
            if (text) {
              const bot = JSON.parse(text) as Bots;
              if (bot?.botid) return bot;
              errors.push(`Plugin dynauth (${source}): parsed but missing botid`);
            } else {
              errors.push(`Plugin dynauth (${source}): empty body`);
            }
          } else {
            errors.push(`Plugin dynauth (${source}): call returned no data`);
          }
        } catch (e) {
          errors.push(`Plugin dynauth (${source}): ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Strategy C: AppHttpClientPlugin with instanceUrl directly as dynamicauth value
      try {
        const httpResult = await executor.execute<unknown>(
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
                Authorization: `dynamicauth ${base}`,
                Accept: 'application/json',
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
              },
            },
            '',
            'arraybuffer',
          ],
        );
        if (httpResult.success && httpResult.data) {
          const text = parseHttpPluginBody(httpResult.data);
          if (text) {
            const bot = JSON.parse(text) as Bots;
            if (bot?.botid) return bot;
            errors.push(`Plugin url-dynauth: parsed but missing botid`);
          } else {
            errors.push(`Plugin url-dynauth: empty body`);
          }
        } else {
          errors.push(`Plugin url-dynauth: call returned no data`);
        }
      } catch (e) {
        errors.push(`Plugin url-dynauth: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    errors.push(`Outer error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Surface failure reason so callers can show a meaningful message
  const reason = errors.join(' | ');
  throw new Error(`Cross-environment Dataverse query failed: ${reason}`);
}

/**
 * Search for a bot in a cross-environment Dataverse by display name or resource name.
 */
async function findBotInEnvironment(
  instanceUrl: string,
  uniqueName: string,
  botName: string,
): Promise<Bots | null> {
  const base = instanceUrl.endsWith('/') ? instanceUrl : `${instanceUrl}/`;
  const filter = encodeURIComponent(`name eq '${botName}'`);
  const url = `${base}api/data/v9.2/bots?$select=${BOT_SELECT}&$filter=${filter}&$top=1`;
  const errors: string[] = [];

  try {
    const executor = await getExecutor();
    if (!executor) return null;

    const acquired = await acquireDynamicToken(instanceUrl, uniqueName);
    if (!acquired) return null;
    const { token, source } = acquired;

    // Direct fetch first
    try {
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
        },
      });
      if (resp.ok) {
        const parsed = await resp.json() as { value?: Bots[] };
        return parsed?.value?.[0] ?? null;
      }
    } catch (e) {
      errors.push(`Bearer find (${source}): ${e instanceof Error ? e.message : String(e)}`);
    }

    // Plugin fallback
    const httpResult = await executor.execute<unknown>(
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
    if (httpResult.success && httpResult.data) {
      const text = parseHttpPluginBody(httpResult.data);
      if (text) {
        const parsed = JSON.parse(text) as { value?: Bots[] };
        return parsed?.value?.[0] ?? null;
      }
    }
  } catch {
    // ignore
  }
  return null;
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

  // Fall back to cross-environment query if we have Dataverse info for the agent's env
  if (envInfo?.instanceUrl && envInfo?.uniqueName) {
    try {
      const crossEnvById = await fetchBotFromEnvironment(envInfo.instanceUrl, envInfo.uniqueName, resourceName);
      if (crossEnvById) return { bot: crossEnvById };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Try the name-based search as a last resort
      try {
        const crossEnvByName = await findBotInEnvironment(envInfo.instanceUrl, envInfo.uniqueName, resourceName);
        if (crossEnvByName) return { bot: crossEnvByName };
      } catch {
        // ignore
      }
      return { bot: null, crossEnvError: msg };
    }
    const crossEnvByName = await findBotInEnvironment(envInfo.instanceUrl, envInfo.uniqueName, resourceName);
    if (crossEnvByName) return { bot: crossEnvByName };
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
