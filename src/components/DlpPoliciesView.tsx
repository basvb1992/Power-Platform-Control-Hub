import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Button,
  Card,
  Dropdown,
  Field,
  Input,
  Option,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowLeftRegular, AddRegular, DeleteRegular } from '@fluentui/react-icons';
import type {
  ManagedPolicyV2,
  ManagedPolicyV2defaultConnectorsClassification,
  ManagedPolicyV2environmentType,
  PolicyV2,
} from '../generated/models/PowerPlatformforAdminsModel.ts';
import type { Connection } from '../types/admin.ts';
import type { Resource } from '../types/inventory.ts';
import { fetchConnectors } from '../services/adminApi.ts';
import { createDlpPolicy, deleteDlpPolicy } from '../services/dlpService.ts';
import { useMutation } from '../hooks/useMutation.tsx';
import ConfirmDialog from './ConfirmDialog.tsx';

interface DlpPoliciesViewProps {
  dlpPolicies: PolicyV2[];
  isLoading: boolean;
  environments: Resource[];
  onRefresh: () => Promise<void>;
}

type DlpPage =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'detail'; policy: PolicyV2 };

type ConnectorClassification = ManagedPolicyV2defaultConnectorsClassification;

type ConnectorItem = {
  id: string;
  name: string;
  type: string;
  classification: ConnectorClassification;
};

const ENV_TYPE_LABELS: Record<ManagedPolicyV2environmentType, string> = {
  AllEnvironments: 'All Environments',
  OnlyEnvironments: 'Only Environments',
  ExceptEnvironments: 'Except Environments',
  SingleEnvironment: 'Single Environment',
};

const CLASSIFICATION_LABELS: Record<ConnectorClassification, string> = {
  Confidential: 'Confidential (Business)',
  General: 'General (Non-Business)',
  Blocked: 'Blocked',
};

const CLASSIFICATION_COLORS: Record<ConnectorClassification, 'success' | 'warning' | 'danger' | 'informative'> = {
  Confidential: 'warning',
  General: 'success',
  Blocked: 'danger',
};

const CONNECTOR_CLASSIFICATIONS: ConnectorClassification[] = ['Confidential', 'General', 'Blocked'];

const HIDDEN_CONNECTORS: Array<Omit<ConnectorItem, 'classification'>> = [
  {
    id: '/providers/Microsoft.PowerApps/apis/shared_microsoftspatialservices',
    name: 'Spatial Services',
    type: 'Microsoft.PowerApps/apis',
  },
  {
    id: 'HttpRequestReceived',
    name: 'When a HTTP request is received',
    type: 'Microsoft.PowerApps/apis',
  },
  {
    id: 'HttpWebhook',
    name: 'HTTP Webhook',
    type: 'Microsoft.PowerApps/apis',
  },
  {
    id: 'Http',
    name: 'HTTP',
    type: 'Microsoft.PowerApps/apis',
  },
];

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    flexShrink: 0,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  backBtn: {
    alignSelf: 'flex-start',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    paddingRight: tokens.spacingHorizontalXS,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxWidth: '920px',
  },
  formSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  sectionTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  infoCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  tableWrapper: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '760px',
  },
  th: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    textAlign: 'left',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: `2px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: 'middle',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalXXL,
    minHeight: '240px',
    color: tokens.colorNeutralForeground3,
  },
  connectorTag: {
    display: 'inline-flex',
  },
  actionBar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  stageActionBar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  nameButton: {
    justifyContent: 'flex-start',
    paddingLeft: '0',
    minWidth: '0',
  },
  pageTitle: {
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightSemibold,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  titleMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  listHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  helperText: {
    color: tokens.colorNeutralForeground3,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
  },
  connectorList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
  },
  accordion: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  bucketHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  connectorChipList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  connectorChip: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  connectorChipName: {
    flex: 1,
    minWidth: '220px',
  },
  connectorChipSelect: {
    minWidth: '220px',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusSmall,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase200,
  },
  divider: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingBottom: tokens.spacingVerticalM,
  },
});

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getEnvironmentScopeLabel(environmentType?: string): string {
  if (!environmentType) return '—';
  return ENV_TYPE_LABELS[environmentType as ManagedPolicyV2environmentType] ?? environmentType;
}

function getClassificationColor(classification?: string): 'success' | 'warning' | 'danger' | 'informative' {
  if (!classification) return 'informative';
  return CLASSIFICATION_COLORS[classification as ConnectorClassification] ?? 'informative';
}

function getClassificationLabel(classification?: string): string {
  if (!classification) return 'Unknown';
  return CLASSIFICATION_LABELS[classification as ConnectorClassification] ?? classification;
}

function getInventoryEnvironmentLabel(environment: Resource): string {
  return environment.properties.displayName ?? environment.name;
}

function getTotalConnectors(policy: PolicyV2): number {
  return policy.connectorGroups?.reduce((total, group) => total + (group.connectors?.length ?? 0), 0) ?? 0;
}

function getPrincipalName(principal?: { displayName?: string; id?: string }): string {
  return principal?.displayName || principal?.id || '—';
}

function getPolicyEnvironmentBadgeLabel(environment: { id: string; name: string; type: string }): string {
  return environment.id || environment.name || environment.type;
}

function connectorMatchesSearch(connector: ConnectorItem, filter: string): boolean {
  if (!filter) return true;
  const query = filter.toLowerCase();
  return connector.name.toLowerCase().includes(query) || connector.id.toLowerCase().includes(query);
}

function mapConnectionToConnectorItem(
  connector: Connection,
  classification: ConnectorClassification,
): ConnectorItem {
  const id = connector.name || connector.id;
  return {
    id,
    name: connector.properties.displayName || id,
    type: connector.type,
    classification,
  };
}

function getConnectorGroups(connectors: ConnectorItem[]): ManagedPolicyV2['connectorGroups'] {
  return CONNECTOR_CLASSIFICATIONS.map((classification) => ({
    classification,
    connectors: connectors
      .filter((connector) => connector.classification === classification)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(({ id, name, type }) => ({ id, name, type })),
  }));
}

export default function DlpPoliciesView({
  dlpPolicies,
  isLoading,
  environments,
  onRefresh,
}: DlpPoliciesViewProps): ReactElement {
  const styles = useStyles();
  const [page, setPage] = useState<DlpPage>({ type: 'list' });
  const [displayName, setDisplayName] = useState('');
  const [envType, setEnvType] = useState<ManagedPolicyV2environmentType>('AllEnvironments');
  const [defaultClass, setDefaultClass] = useState<ConnectorClassification>('General');
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState('');
  const [connectorItems, setConnectorItems] = useState<ConnectorItem[]>([]);
  const [connectorSearch, setConnectorSearch] = useState('');
  const [connectorSourceEnvironmentId, setConnectorSourceEnvironmentId] = useState<string | null>(null);
  const [connectorLoadError, setConnectorLoadError] = useState('');
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(false);
  const [displayNameError, setDisplayNameError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PolicyV2 | null>(null);

  const sortedPolicies = useMemo(
    () => [...dlpPolicies].sort((left, right) => (left.displayName || left.name).localeCompare(right.displayName || right.name)),
    [dlpPolicies],
  );

  const currentPolicy = page.type === 'detail'
    ? sortedPolicies.find((policy) => policy.name === page.policy.name) ?? page.policy
    : null;

  const environmentOptions = useMemo(
    () => [...environments]
      .map((environment) => ({
        id: environment.name,
        label: getInventoryEnvironmentLabel(environment),
      }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    [environments],
  );

  const selectedEnvironmentLabel = useMemo(
    () => environmentOptions.find((option) => option.id === selectedEnvironmentId)?.label ?? '',
    [environmentOptions, selectedEnvironmentId],
  );

  const connectorsByClassification = useMemo(() => ({
    Confidential: connectorItems.filter((connector) => connector.classification === 'Confidential'),
    General: connectorItems.filter((connector) => connector.classification === 'General'),
    Blocked: connectorItems.filter((connector) => connector.classification === 'Blocked'),
  }), [connectorItems]);

  const filteredConnectorsByClassification = useMemo(() => ({
    Confidential: connectorsByClassification.Confidential.filter((connector) => connectorMatchesSearch(connector, connectorSearch)),
    General: connectorsByClassification.General.filter((connector) => connectorMatchesSearch(connector, connectorSearch)),
    Blocked: connectorsByClassification.Blocked.filter((connector) => connectorMatchesSearch(connector, connectorSearch)),
  }), [connectorSearch, connectorsByClassification]);

  useEffect(() => {
    if (page.type !== 'create') return;
    if (!environmentOptions.length) {
      setSelectedEnvironmentId('');
      return;
    }

    if (!selectedEnvironmentId || !environmentOptions.some((option) => option.id === selectedEnvironmentId)) {
      setSelectedEnvironmentId(environmentOptions[0].id);
    }
  }, [environmentOptions, page.type, selectedEnvironmentId]);

  function resetForm() {
    setDisplayName('');
    setEnvType('AllEnvironments');
    setDefaultClass('General');
    setSelectedEnvironmentId('');
    setConnectorItems([]);
    setConnectorSearch('');
    setConnectorSourceEnvironmentId(null);
    setConnectorLoadError('');
    setIsLoadingConnectors(false);
    setDisplayNameError('');
  }

  function handleBackToList() {
    resetForm();
    setPage({ type: 'list' });
  }

  function handleOpenCreate() {
    resetForm();
    setPage({ type: 'create' });
  }

  const handleLoadConnectors = useCallback(async (environmentId = selectedEnvironmentId) => {
    if (!environmentId) {
      setConnectorLoadError('Select an environment to load connectors from.');
      return;
    }

    setIsLoadingConnectors(true);
    setConnectorLoadError('');

    try {
      const apiConnectors = await fetchConnectors(environmentId);
      const mergedConnectors = [
        ...apiConnectors.map((connector) => mapConnectionToConnectorItem(connector, defaultClass)),
        ...HIDDEN_CONNECTORS.map((connector) => ({ ...connector, classification: defaultClass })),
      ];
      const uniqueConnectors = new Map<string, ConnectorItem>();

      for (const connector of mergedConnectors) {
        if (!connector.id) continue;
        const key = connector.id.toLowerCase();
        if (!uniqueConnectors.has(key)) {
          uniqueConnectors.set(key, {
            ...connector,
            name: connector.name.trim() || connector.id,
          });
        }
      }

      setConnectorItems(Array.from(uniqueConnectors.values()).sort((left, right) => left.name.localeCompare(right.name)));
      setConnectorSearch('');
      setConnectorSourceEnvironmentId(environmentId);
    } catch (error: unknown) {
      setConnectorItems([]);
      setConnectorSourceEnvironmentId(null);
      setConnectorLoadError(error instanceof Error ? error.message : 'Failed to load connectors.');
    } finally {
      setIsLoadingConnectors(false);
    }
  }, [defaultClass, selectedEnvironmentId]);

  useEffect(() => {
    if (page.type !== 'create') return;
    if (environmentOptions.length !== 1) return;
    if (!selectedEnvironmentId || connectorSourceEnvironmentId === selectedEnvironmentId || isLoadingConnectors) return;
    void handleLoadConnectors(selectedEnvironmentId);
  }, [
    connectorSourceEnvironmentId,
    environmentOptions.length,
    handleLoadConnectors,
    isLoadingConnectors,
    page.type,
    selectedEnvironmentId,
  ]);

  function handleConnectorClassificationChange(connectorId: string, classification: ConnectorClassification) {
    setConnectorItems((current) => current.map((connector) => (
      connector.id === connectorId
        ? { ...connector, classification }
        : connector
    )));
  }

  const { execute: execCreateDlp, isLoading: isCreating } = useMutation(createDlpPolicy, {
    successMessage: 'DLP policy created.',
    onSuccess: () => {
      handleBackToList();
      void onRefresh();
    },
  });

  const { execute: execDeleteDlp, isLoading: isDeleting } = useMutation(deleteDlpPolicy, {
    successMessage: 'DLP policy deleted.',
    onSuccess: () => {
      setDeleteTarget(null);
      setPage({ type: 'list' });
      void onRefresh();
    },
  });

  function handleCreateSubmit() {
    const trimmedDisplayName = displayName.trim();
    if (!trimmedDisplayName) {
      setDisplayNameError('Display name is required.');
      return;
    }

    if (!connectorItems.length) {
      setConnectorLoadError('Load connectors before creating the policy.');
      return;
    }

    setDisplayNameError('');
    setConnectorLoadError('');

    const payload: ManagedPolicyV2 = {
      displayName: trimmedDisplayName,
      environmentType: envType,
      defaultConnectorsClassification: defaultClass,
      environments: [],
      connectorGroups: getConnectorGroups(connectorItems),
    };

    void execCreateDlp(payload);
  }

  let renderedPage: ReactElement;

  if (page.type === 'create') {
    renderedPage = (
      <>
        <div className={styles.header}>
          <Button className={styles.backBtn} appearance="subtle" icon={<ArrowLeftRegular />} onClick={handleBackToList}>
            Back to DLP Policies
          </Button>
          <div className={styles.listHeader}>
            <Text className={styles.pageTitle}>New DLP Policy</Text>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.form}>
            <Card>
              <div className={styles.formSection}>
                <Text className={styles.sectionTitle}>Basic Settings</Text>
                <Field
                  label="Display Name"
                  required
                  validationState={displayNameError ? 'error' : 'none'}
                  validationMessage={displayNameError || undefined}
                >
                  <Input
                    value={displayName}
                    onChange={(_, data) => {
                      setDisplayName(data.value);
                      if (displayNameError && data.value.trim()) setDisplayNameError('');
                    }}
                    placeholder="My DLP Policy"
                  />
                </Field>
                <Field label="Environment Scope" required>
                  <Dropdown
                    value={getEnvironmentScopeLabel(envType)}
                    selectedOptions={[envType]}
                    onOptionSelect={(_, data) => setEnvType((data.optionValue as ManagedPolicyV2environmentType | undefined) ?? 'AllEnvironments')}
                  >
                    {Object.entries(ENV_TYPE_LABELS).map(([value, label]) => (
                      <Option key={value} value={value}>{label}</Option>
                    ))}
                  </Dropdown>
                </Field>
                <Field label="Default Connector Classification" required>
                  <Dropdown
                    value={getClassificationLabel(defaultClass)}
                    selectedOptions={[defaultClass]}
                    onOptionSelect={(_, data) => setDefaultClass((data.optionValue as ConnectorClassification | undefined) ?? 'General')}
                  >
                    {CONNECTOR_CLASSIFICATIONS.map((classification) => (
                      <Option key={classification} value={classification}>{getClassificationLabel(classification)}</Option>
                    ))}
                  </Dropdown>
                </Field>
                <Field label="Load connectors from environment" required>
                  <Dropdown
                    placeholder={environmentOptions.length ? 'Select an environment' : 'No environments available'}
                    value={selectedEnvironmentLabel}
                    selectedOptions={selectedEnvironmentId ? [selectedEnvironmentId] : []}
                    onOptionSelect={(_, data) => {
                      const nextEnvironmentId = data.optionValue ?? '';
                      setSelectedEnvironmentId(nextEnvironmentId);
                      setConnectorItems([]);
                      setConnectorSearch('');
                      setConnectorSourceEnvironmentId(null);
                      setConnectorLoadError('');
                    }}
                  >
                    {environmentOptions.map((environment) => (
                      <Option key={environment.id} value={environment.id}>{environment.label}</Option>
                    ))}
                  </Dropdown>
                </Field>
                <Text className={styles.helperText}>
                  Load every connector from one environment, then move connectors into the Confidential, General, and Blocked buckets.
                </Text>
                {connectorLoadError ? <Text className={styles.errorText}>{connectorLoadError}</Text> : null}
                <div className={styles.stageActionBar}>
                  <Button
                    appearance="secondary"
                    disabled={!selectedEnvironmentId || !environmentOptions.length || isLoadingConnectors}
                    icon={isLoadingConnectors ? <Spinner size="tiny" /> : undefined}
                    onClick={() => void handleLoadConnectors()}
                  >
                    {isLoadingConnectors ? 'Loading…' : connectorSourceEnvironmentId ? 'Reload Connectors' : 'Load Connectors'}
                  </Button>
                  {connectorSourceEnvironmentId ? (
                    <Text className={styles.helperText}>
                      {connectorItems.length} connector{connectorItems.length === 1 ? '' : 's'} loaded from {selectedEnvironmentLabel}.
                    </Text>
                  ) : null}
                </div>
              </div>
            </Card>

            {connectorSourceEnvironmentId ? (
              <Card>
                <div className={styles.formSection}>
                  <div className={styles.listHeader}>
                    <Text className={styles.sectionTitle}>Connector Classification</Text>
                    <Text className={styles.helperText}>
                      All connectors started in the {getClassificationLabel(defaultClass)} bucket when they were loaded.
                    </Text>
                  </div>
                  <Field label="Filter connectors">
                    <Input
                      value={connectorSearch}
                      onChange={(_, data) => setConnectorSearch(data.value)}
                      placeholder="Search by connector name or id"
                    />
                  </Field>
                  <Accordion className={styles.accordion} multiple collapsible defaultOpenItems={CONNECTOR_CLASSIFICATIONS}>
                    {CONNECTOR_CLASSIFICATIONS.map((classification) => {
                      const connectors = connectorsByClassification[classification];
                      const filteredConnectors = filteredConnectorsByClassification[classification];

                      return (
                        <AccordionItem key={classification} value={classification}>
                          <AccordionHeader>
                            <div className={styles.bucketHeader}>
                              <Text weight="semibold">{getClassificationLabel(classification)}</Text>
                              <Badge appearance="tint" color={getClassificationColor(classification)}>{connectors.length}</Badge>
                            </div>
                          </AccordionHeader>
                          <AccordionPanel>
                            {filteredConnectors.length === 0 ? (
                              <Text className={styles.helperText}>
                                {connectorSearch ? 'No connectors match the current filter.' : 'No connectors assigned to this bucket.'}
                              </Text>
                            ) : (
                              <div className={styles.connectorChipList}>
                                {filteredConnectors.map((connector) => (
                                  <div key={connector.id} className={styles.connectorChip}>
                                    <Text className={styles.connectorChipName}>{connector.name}</Text>
                                    <select
                                      className={styles.connectorChipSelect}
                                      value={connector.classification}
                                      onChange={(event) => handleConnectorClassificationChange(
                                        connector.id,
                                        event.target.value as ConnectorClassification,
                                      )}
                                    >
                                      {CONNECTOR_CLASSIFICATIONS.map((option) => (
                                        <option key={option} value={option}>{getClassificationLabel(option)}</option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                              </div>
                            )}
                          </AccordionPanel>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
              </Card>
            ) : null}

            <div className={styles.actionBar}>
              <Button appearance="primary" icon={isCreating ? <Spinner size="tiny" /> : <AddRegular />} disabled={isCreating} onClick={handleCreateSubmit}>
                {isCreating ? 'Creating…' : 'Create Policy'}
              </Button>
              <Button appearance="secondary" disabled={isCreating} onClick={handleBackToList}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  } else if (page.type === 'detail' && currentPolicy) {
    renderedPage = (
      <>
        <div className={styles.header}>
          <Button className={styles.backBtn} appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => setPage({ type: 'list' })}>
            Back to DLP Policies
          </Button>
          <div className={styles.titleRow}>
            <div className={styles.titleMeta}>
              <Text className={styles.pageTitle}>{currentPolicy.displayName || currentPolicy.name}</Text>
              <Badge appearance="tint" color="informative">{getEnvironmentScopeLabel(currentPolicy.environmentType)}</Badge>
              <Badge appearance="tint" color={getClassificationColor(currentPolicy.defaultConnectorsClassification)}>
                {getClassificationLabel(currentPolicy.defaultConnectorsClassification)}
              </Badge>
            </div>
            <Button
              appearance="subtle"
              icon={<DeleteRegular />}
              disabled={isDeleting}
              onClick={() => setDeleteTarget(currentPolicy)}
            >
              Delete
            </Button>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.infoGrid}>
            <div className={styles.infoCell}>
              <Text weight="semibold">Created by</Text>
              <Text>{getPrincipalName(currentPolicy.createdBy)}</Text>
            </div>
            <div className={styles.infoCell}>
              <Text weight="semibold">Created</Text>
              <Text>{formatDate(currentPolicy.createdTime)}</Text>
            </div>
            <div className={styles.infoCell}>
              <Text weight="semibold">Last modified by</Text>
              <Text>{getPrincipalName(currentPolicy.lastModifiedBy)}</Text>
            </div>
            <div className={styles.infoCell}>
              <Text weight="semibold">Last modified</Text>
              <Text>{formatDate(currentPolicy.lastModifiedTime)}</Text>
            </div>
            <div className={styles.infoCell}>
              <Text weight="semibold">Environment type</Text>
              <Text>{getEnvironmentScopeLabel(currentPolicy.environmentType)}</Text>
            </div>
            <div className={styles.infoCell}>
              <Text weight="semibold">Is legacy</Text>
              <Text>{currentPolicy.isLegacySchemaVersion ? 'Yes' : 'No'}</Text>
            </div>
          </div>

          <Card>
            <div className={styles.formSection}>
              <Text className={styles.sectionTitle}>Connector Groups</Text>
              {CONNECTOR_CLASSIFICATIONS.map((classification) => {
                const group = currentPolicy.connectorGroups?.find((entry) => entry.classification === classification);
                const connectors = group?.connectors ?? [];

                return (
                  <div key={classification} className={styles.divider}>
                    <div className={styles.titleRow}>
                      <Text weight="semibold">{getClassificationLabel(classification)}</Text>
                      <Badge appearance="tint" color={getClassificationColor(classification)}>{connectors.length} connector{connectors.length === 1 ? '' : 's'}</Badge>
                    </div>
                    {connectors.length === 0 ? (
                      <Text className={styles.helperText}>No connectors assigned</Text>
                    ) : (
                      <div className={styles.connectorList}>
                        {connectors.map((connector) => (
                          <Badge key={`${classification}-${connector.id}`} className={styles.connectorTag} appearance="outline" color="informative">
                            {connector.name || connector.id}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {currentPolicy.environmentType !== 'AllEnvironments' && (
            <Card>
              <div className={styles.formSection}>
                <Text className={styles.sectionTitle}>Environments</Text>
                {currentPolicy.environments?.length ? (
                  <div className={styles.connectorList}>
                    {currentPolicy.environments.map((environment) => (
                      <Badge key={environment.id} appearance="outline" color="brand">{getPolicyEnvironmentBadgeLabel(environment)}</Badge>
                    ))}
                  </div>
                ) : (
                  <Text className={styles.helperText}>No environments assigned.</Text>
                )}
              </div>
            </Card>
          )}
        </div>
      </>
    );
  } else {
    renderedPage = (
      <>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <div className={styles.listHeader}>
              <div className={styles.titleMeta}>
                <Text className={styles.pageTitle}>DLP Policies</Text>
                <Badge appearance="filled" color="informative">{sortedPolicies.length}</Badge>
              </div>
            </div>
            <Button appearance="primary" icon={<AddRegular />} onClick={handleOpenCreate}>
              New DLP Policy
            </Button>
          </div>
        </div>

        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.emptyState}>
              <Spinner size="extra-large" label="Loading DLP policies…" />
            </div>
          ) : sortedPolicies.length === 0 ? (
            <div className={styles.emptyState}>
              <Text>No DLP policies found.</Text>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Name ▲</th>
                    <th className={styles.th}>Scope</th>
                    <th className={styles.th}>Default Class</th>
                    <th className={styles.th}>Total Connectors</th>
                    <th className={styles.th}>Last Modified</th>
                    <th className={styles.th} style={{ width: '60px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPolicies.map((policy) => (
                    <tr key={policy.name}>
                      <td className={styles.td}>
                        <Button className={styles.nameButton} appearance="subtle" onClick={() => setPage({ type: 'detail', policy })}>
                          {policy.displayName || policy.name}
                        </Button>
                      </td>
                      <td className={styles.td}>{getEnvironmentScopeLabel(policy.environmentType)}</td>
                      <td className={styles.td}>
                        <Badge appearance="tint" color={getClassificationColor(policy.defaultConnectorsClassification)}>
                          {policy.defaultConnectorsClassification}
                        </Badge>
                      </td>
                      <td className={styles.td}>{getTotalConnectors(policy)}</td>
                      <td className={styles.td}>{formatDate(policy.lastModifiedTime)}</td>
                      <td className={styles.td}>
                        <Button
                          appearance="subtle"
                          icon={<DeleteRegular />}
                          title="Delete policy"
                          aria-label={`Delete ${policy.displayName || policy.name}`}
                          disabled={isDeleting}
                          onClick={() => setDeleteTarget(policy)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className={styles.root}>
      {renderedPage}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete DLP Policy"
        message={`Delete "${deleteTarget?.displayName ?? deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isDangerous
        isLoading={isDeleting}
        onConfirm={() => { if (deleteTarget) void execDeleteDlp(deleteTarget.name); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
