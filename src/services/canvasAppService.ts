import JSZip from 'jszip';

const POWERAPPS_API = 'https://api.powerapps.com';

// ─── Data model ──────────────────────────────────────────────────────────────

export interface CanvasAppFiles {
  dataSources: DataSourceEntry[];
  properties: AppProperties | null;
  screens: ScreenEntry[];
  resources: ResourceEntry[];
  fileNames: string[];
  /** 'json' = classic pkgs/*.json format, 'yaml' = modern Src/*.yaml format */
  format: 'json' | 'yaml' | 'unknown';
}

export interface DataSourceEntry {
  Name?: string;
  Type?: string;
  ApiId?: string;
  ConnectionId?: string;
  DatasetName?: string;
  TableName?: string;
  Description?: string;
  IsWritable?: boolean;
}

export interface AppProperties {
  Name?: string;
  Id?: string;
  Description?: string;
  Author?: string;
  DocumentLayoutWidth?: number;
  DocumentLayoutHeight?: number;
  DocumentLayoutOrientation?: string;
  MSAppStructureVersion?: number;
}

export interface ControlNode {
  Name?: string;
  Type?: string;
  Children?: ControlNode[];
  Rules?: RuleEntry[];
}

export interface RuleEntry {
  Property?: string;
  InvariantScript?: string;
}

export interface ScreenEntry {
  name: string;
  controls: ControlNode[];
  /** Recursive total count of all controls */
  totalControls: number;
}

export interface ResourceEntry {
  Name?: string;
  FileName?: string;
  Type?: string;
  /** Estimated byte size decoded from base64 Content field, or from zip entry */
  sizeBytes?: number;
}

// ─── MSAL token extraction ────────────────────────────────────────────────────

const POWERAPPS_AUDIENCES = [
  'api.powerapps.com',
  'service.powerapps.com',
  'service.flow.microsoft.com',
];

function getTokenFromStorage(): string | null {
  const storages: Storage[] = [];
  try { storages.push(localStorage); } catch { /* sandboxed */ }
  try { storages.push(sessionStorage); } catch { /* sandboxed */ }

  for (const storage of storages) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      try {
        const raw = storage.getItem(key);
        if (!raw || !raw.includes('"secret"')) continue;
        const val = JSON.parse(raw) as Record<string, unknown>;
        const credType = String(val['credentialType'] ?? val['credential_type'] ?? '');
        const secret = val['secret'];
        const target = String(val['target'] ?? val['realm'] ?? val['scopes'] ?? '');
        if (
          credType === 'AccessToken' &&
          typeof secret === 'string' && secret.length > 100 &&
          POWERAPPS_AUDIENCES.some(a => target.toLowerCase().includes(a))
        ) {
          // Check expiry
          const exp = val['expiresOn'] ?? val['expires_on'];
          if (exp) {
            const raw = String(exp);
            const ms = raw.includes('.') ? parseFloat(raw) * 1000 : parseInt(raw, 10) * 1000;
            if (!isNaN(ms) && ms < Date.now()) continue; // expired
          }
          return secret;
        }
      } catch { /* not JSON or unexpected format */ }
    }
  }
  return null;
}

// ─── Export API call ──────────────────────────────────────────────────────────

export async function fetchCanvasAppFiles(
  environmentId: string,
  appId: string,
): Promise<CanvasAppFiles> {
  const token = getTokenFromStorage();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/octet-stream, application/json, */*',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url =
    `${POWERAPPS_API}/providers/Microsoft.PowerApps/scopes/admin/environments` +
    `/${environmentId}/apps/${appId}/exportPackage?api-version=2016-11-01`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      credentials: token ? 'same-origin' : 'include',
      body: JSON.stringify({}),
    });
  } catch (e) {
    const msg = e instanceof TypeError ? e.message : String(e);
    if (msg.toLowerCase().includes('cors') || msg.toLowerCase().includes('network')) {
      throw new Error(
        'Network request blocked. This is likely a CORS restriction. ' +
        'The browser cannot call api.powerapps.com directly from this context. ' +
        'Try opening the app in a browser tab where you are signed into Power Apps.',
      );
    }
    throw new Error(`Network error: ${msg}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText);
    const extracted = tryExtractMessage(body);
    throw new Error(`Export failed (HTTP ${response.status}): ${extracted}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  let zipBuffer: ArrayBuffer;

  if (contentType.includes('application/json') || contentType.includes('text/')) {
    // The response might be JSON with a packageLink / downloadLink
    const json = await response.json() as {
      packageLink?: { value?: string };
      downloadLink?: string;
      downloadUrl?: string;
      value?: string;
    };
    const dlUrl =
      json.packageLink?.value ??
      json.downloadLink ??
      json.downloadUrl ??
      json.value;
    if (!dlUrl) throw new Error('Export response did not include a download link. The API may have changed.');
    const dlResponse = await fetch(dlUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!dlResponse.ok) throw new Error(`Download failed (HTTP ${dlResponse.status})`);
    zipBuffer = await dlResponse.arrayBuffer();
  } else {
    zipBuffer = await response.arrayBuffer();
  }

  return extractAndParseMsapp(zipBuffer);
}

// ─── ZIP unpacking ────────────────────────────────────────────────────────────

async function extractAndParseMsapp(exportZipBuffer: ArrayBuffer): Promise<CanvasAppFiles> {
  const outerZip = await JSZip.loadAsync(exportZipBuffer);
  const fileNames = Object.keys(outerZip.files);

  // Look for a .msapp file anywhere in the export package
  const msappPath = fileNames.find(f => f.endsWith('.msapp'));
  let msappBuffer: ArrayBuffer;

  if (msappPath) {
    msappBuffer = await outerZip.files[msappPath].async('arraybuffer');
  } else {
    // The export zip might itself be the msapp
    msappBuffer = exportZipBuffer;
  }

  return parseMsapp(msappBuffer);
}

function countControls(node: ControlNode): number {
  return 1 + (node.Children ?? []).reduce((s, c) => s + countControls(c), 0);
}

async function parseMsapp(buffer: ArrayBuffer): Promise<CanvasAppFiles> {
  const zip = await JSZip.loadAsync(buffer);
  const fileNames = Object.keys(zip.files).filter(f => !zip.files[f].dir);

  // ── Properties.json ──────────────────────────────────────────────────────
  let properties: AppProperties | null = null;
  const propsFile = fileNames.find(f => f.toLowerCase().endsWith('properties.json'));
  if (propsFile) {
    try {
      const raw = await zip.files[propsFile].async('string');
      properties = JSON.parse(raw) as AppProperties;
    } catch { /* malformed */ }
  }

  // ── DataSources.json ─────────────────────────────────────────────────────
  let dataSources: DataSourceEntry[] = [];
  const dsFile = fileNames.find(f => f.toLowerCase().endsWith('datasources.json'));
  if (dsFile) {
    try {
      const raw = await zip.files[dsFile].async('string');
      const parsed = JSON.parse(raw) as { DataSources?: DataSourceEntry[] };
      dataSources = parsed.DataSources ?? [];
    } catch { /* malformed */ }
  }

  // ── Screens from pkgs/*.json (classic JSON format) ───────────────────────
  const screens: ScreenEntry[] = [];
  const pkgFiles = fileNames.filter(f => /pkgs[\\/].+\.json$/i.test(f));

  for (const pf of pkgFiles) {
    try {
      const raw = await zip.files[pf].async('string');
      const parsed = JSON.parse(raw) as { TopParent?: ControlNode };
      if (parsed.TopParent) {
        const controls = [parsed.TopParent];
        screens.push({
          name: parsed.TopParent.Name ?? pf,
          controls,
          totalControls: countControls(parsed.TopParent),
        });
      }
    } catch { /* skip malformed */ }
  }

  // ── YAML screens (modern format) ─────────────────────────────────────────
  const yamlFiles = fileNames.filter(f => /Src[\\/].+\.yaml$/i.test(f));
  if (screens.length === 0 && yamlFiles.length > 0) {
    for (const yf of yamlFiles) {
      const raw = await zip.files[yf].async('string');
      // Simple heuristic: count control-like lines
      const ctrlCount = (raw.match(/^\s{4,}[A-Za-z][A-Za-z0-9_]+:/gm) ?? []).length;
      const name = yf.replace(/^.*[\\/]/, '').replace(/\.yaml$/, '');
      // Build a synthetic screen entry for analysis
      screens.push({ name, controls: [], totalControls: ctrlCount });
    }
  }

  // ── Resources.json ────────────────────────────────────────────────────────
  let resources: ResourceEntry[] = [];
  const resFile = fileNames.find(f => f.toLowerCase().endsWith('resources.json'));
  if (resFile) {
    try {
      const raw = await zip.files[resFile].async('string');
      const parsed = JSON.parse(raw) as {
        Resources?: Array<{ Name?: string; FileName?: string; Type?: string; Content?: string }>;
      };
      resources = (parsed.Resources ?? []).map(r => ({
        Name: r.Name,
        FileName: r.FileName,
        Type: r.Type,
        // Estimate decoded byte size from base64 length
        sizeBytes: r.Content ? Math.floor((r.Content.replace(/=+$/, '').length * 3) / 4) : 0,
      }));
    } catch { /* malformed */ }
  }

  const format = pkgFiles.length > 0 ? 'json' : yamlFiles.length > 0 ? 'yaml' : 'unknown';

  return { dataSources, properties, screens, resources, fileNames, format };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tryExtractMessage(raw: string): string {
  try {
    const p = JSON.parse(raw) as { error?: { message?: string }; message?: string };
    return p?.error?.message ?? p?.message ?? raw;
  } catch {
    return raw.slice(0, 300);
  }
}
