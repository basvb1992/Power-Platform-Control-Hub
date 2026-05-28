export interface ResourceProperties {
  displayName?: string;
  createdAt?: string;
  modifiedAt?: string;
  environmentId?: string;
  createdBy?: string;
  ownerId?: string;
  environmentType?: string;
  isManaged?: boolean;
  [key: string]: unknown;
}

export interface Resource {
  id?: string;
  name: string;
  type: string;
  location?: string;
  properties: ResourceProperties;
  /** Computed join key — lower-cased environment ID. */
  joinKey?: string;
  /** Joined from the environment record. */
  environmentName?: string;
  environmentRegion?: string;
  environmentType?: string;
  isManagedEnvironment?: boolean | string;
}

export interface InventoryQueryResult {
  totalRecords: number;
  count: number;
  /** 0 = complete, 1 = truncated — use skipToken to page. */
  resultTruncated: number;
  skipToken?: string;
  data: Resource[];
}

export interface ResourceCounts {
  canvasApps: number;
  modelDrivenApps: number;
  cloudFlows: number;
  agents: number;
  agentFlows: number;
  codeApps: number;
  total: number;
}

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  'microsoft.powerapps/canvasapps': 'Canvas App',
  'microsoft.powerapps/modeldrivenapps': 'Model-Driven App',
  'microsoft.powerautomate/cloudflows': 'Cloud Flow',
  'microsoft.copilotstudio/agents': 'Copilot Studio Agent',
  'microsoft.powerautomate/agentflows': 'Agent Flow',
  'microsoft.powerapps/codeapps': 'Code App',
  'microsoft.powerplatform/environments': 'Environment',
};

export const RESOURCE_TYPES_FILTER = [
  { key: 'all', label: 'All Types' },
  { key: 'microsoft.powerapps/canvasapps', label: 'Canvas Apps' },
  { key: 'microsoft.powerapps/modeldrivenapps', label: 'Model-Driven Apps' },
  { key: 'microsoft.powerautomate/cloudflows', label: 'Cloud Flows' },
  { key: 'microsoft.copilotstudio/agents', label: 'Agents' },
  { key: 'microsoft.powerautomate/agentflows', label: 'Agent Flows' },
  { key: 'microsoft.powerapps/codeapps', label: 'Code Apps' },
] as const;
