import type { PowerApp, ConnectionReference } from '../generated/models/PowerAppsforAdminsModel.ts';
import { PowerAppsforAdminsService } from '../generated/services/PowerAppsforAdminsService.ts';
import type { IOperationResult } from '@microsoft/power-apps/data';

function unwrap<T>(result: IOperationResult<T>): T {
  if (!result.success || result.error) {
    throw new Error(result.error?.message ?? 'Operation failed');
  }
  return result.data;
}

export interface AppRoleAssignment {
  id: string;
  roleName: string;
  principalId: string;
  principalDisplayName?: string;
  principalEmail?: string;
  principalType: string;
  scope?: string;
}

export interface CanvasAppAdminInfo {
  owner: { id?: string; displayName?: string; email?: string; userPrincipalName?: string } | null;
  createdBy: { id?: string; displayName?: string; email?: string } | null;
  lastModifiedBy: { id?: string; displayName?: string; email?: string } | null;
  sharedUsersCount: number;
  sharedGroupsCount: number;
  bypassConsent: boolean;
  isFeaturedApp: boolean;
  description: string;
  appVersion: string;
  createdTime: string;
  lastModifiedTime: string;
  connectionReferences: ConnectionReference[];
  tags: {
    primaryFormFactor?: string;
    primaryDeviceWidth?: string;
    primaryDeviceHeight?: string;
    deviceCapabilities?: string;
    supportsPortrait?: string;
    supportsLandscape?: string;
  };
}

export async function getCanvasAppAdminInfo(
  environmentId: string,
  appId: string,
): Promise<CanvasAppAdminInfo> {
  const result = await PowerAppsforAdminsService.Get_AdminApp(environmentId, appId);
  const app: PowerApp = unwrap(result);
  const p = app.properties ?? {};

  return {
    owner: p.owner ?? null,
    createdBy: p.createdBy ?? null,
    lastModifiedBy: p.lastModifiedBy ?? null,
    sharedUsersCount: p.sharedUsersCount ?? 0,
    sharedGroupsCount: p.sharedGroupsCount ?? 0,
    bypassConsent: p.bypassConsent ?? false,
    isFeaturedApp: p.isFeaturedApp ?? false,
    description: p.description ?? '',
    appVersion: p.appVersion ?? '',
    createdTime: p.createdTime ?? '',
    lastModifiedTime: p.lastModifiedTime ?? '',
    connectionReferences: p.connectionReferences ?? [],
    tags: {
      primaryFormFactor: app.tags?.primaryFormFactor,
      primaryDeviceWidth: app.tags?.primaryDeviceWidth,
      primaryDeviceHeight: app.tags?.primaryDeviceHeight,
      deviceCapabilities: app.tags?.deviceCapabilities,
      supportsPortrait: app.tags?.supportsPortrait,
      supportsLandscape: app.tags?.supportsLandscape,
    },
  };
}

export async function getAppRoleAssignments(
  environmentId: string,
  appId: string,
): Promise<AppRoleAssignment[]> {
  const result = await PowerAppsforAdminsService.Get_AdminAppRoleAssignment(environmentId, appId);
  const raw = unwrap(result) as { value?: Array<Record<string, unknown>> };
  const items = raw?.value ?? [];

  return items.map(item => {
    const props = (item.properties ?? {}) as Record<string, unknown>;
    const principal = (props.principal ?? {}) as Record<string, unknown>;
    return {
      id: String(item.name ?? item.id ?? ''),
      roleName: String(props.roleName ?? ''),
      principalId: String(principal.id ?? ''),
      principalDisplayName: principal.displayName as string | undefined,
      principalEmail: principal.email as string | undefined,
      principalType: String(principal.type ?? 'User'),
      scope: props.scope as string | undefined,
    };
  });
}

export async function setAppQuarantineState(
  environmentId: string,
  appId: string,
  quarantined: boolean,
): Promise<void> {
  const result = await PowerAppsforAdminsService.Set_AppQuarantineState(
    environmentId,
    appId,
    undefined,
    'application/json',
    { quarantineState: { quarantineStatus: quarantined ? 'Quarantined' : 'Unquarantined' } },
  );
  unwrap(result);
}

