import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Badge,
  Button,
  Divider,
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Input,
  Spinner,
  Menu,
  MenuTrigger,
  MenuList,
  MenuItem,
  MenuPopover,
  Card,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  SearchRegular,
  GlobeRegular,
  CalendarRegular,
  PersonRegular,
  KeyRegular,
  PlayRegular,
  StopRegular,
  ShieldRegular,
  ShieldDismissRegular,
  SaveRegular,
  MoreHorizontalRegular,
  BoxRegular,
} from '@fluentui/react-icons';
import type { Resource } from '../types/inventory.ts';
import { RESOURCE_TYPE_LABELS } from '../types/inventory.ts';
import ConfirmDialog from './ConfirmDialog.tsx';
import { useMutation } from '../hooks/useMutation.tsx';
import {
  enableEnvironment,
  disableEnvironment,
  enableManagedEnvironment,
  disableManagedEnvironment,
  createEnvironmentBackup,
} from '../services/environmentMutations.ts';
import BackupDialog from './BackupDialog.tsx';

interface EnvironmentDetailViewProps {
  environment: Resource;
  resources: Resource[];
  onBack: () => void;
  onRefreshEnvironments?: () => Promise<void>;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    padding: tokens.spacingHorizontalXL,
    gap: tokens.spacingVerticalL,
  },
  backRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  headerTitle: {
    fontSize: tokens.fontSizeBase600,
    fontWeight: tokens.fontWeightSemibold,
    flex: 1,
    minWidth: 0,
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: tokens.spacingHorizontalL,
    flexShrink: 0,
  },
  metaCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalM,
  },
  metaLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  metaValue: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    wordBreak: 'break-all',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: tokens.spacingHorizontalM,
    flexShrink: 0,
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: tokens.spacingVerticalM,
    gap: tokens.spacingVerticalXS,
    textAlign: 'center',
  },
  statCount: {
    fontSize: tokens.fontSizeBase600,
    fontWeight: tokens.fontWeightBold,
    color: tokens.colorBrandForeground1,
  },
  statLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  resourcesSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },
  resourcesHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexShrink: 0,
  },
  resourcesTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    flex: 1,
  },
  tableWrapper: {
    overflowY: 'auto',
    flex: 1,
  },
});

function envTypeColor(envType: string): 'brand' | 'success' | 'warning' | 'important' | 'informative' {
  switch (envType.toLowerCase()) {
    case 'production': return 'brand';
    case 'sandbox': return 'warning';
    case 'developer': return 'success';
    case 'default': return 'informative';
    default: return 'important';
  }
}

function MetaItem({ icon, label, value }: { icon: ReactElement; label: string; value: string }) {
  const styles = useStyles();
  return (
    <Card className={styles.metaCard}>
      <span className={styles.metaLabel}>{icon}{label}</span>
      <Text className={styles.metaValue}>{value}</Text>
    </Card>
  );
}

export default function EnvironmentDetailView({
  environment: env,
  resources,
  onBack,
  onRefreshEnvironments,
}: EnvironmentDetailViewProps): ReactElement {
  const styles = useStyles();
  const [search, setSearch] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ type: 'disable' | 'disableManaged' } | null>(null);
  const [showBackup, setShowBackup] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const displayName = env.properties.displayName ?? env.name;
  const envType = (env.properties.environmentType ?? 'Unknown') as string;
  const isManaged = env.properties.isManaged === true;
  const region = env.location ?? '—';
  const createdAt = env.properties.createdAt
    ? new Date(env.properties.createdAt as string).toLocaleDateString()
    : '—';

  const { execute: execEnable } = useMutation(enableEnvironment, {
    successMessage: 'Enable environment request submitted.',
    onSuccess: () => void onRefreshEnvironments?.(),
  });
  const { execute: execDisable } = useMutation(disableEnvironment, {
    successMessage: 'Disable environment request submitted.',
    onSuccess: () => void onRefreshEnvironments?.(),
  });
  const { execute: execEnableManaged } = useMutation(enableManagedEnvironment, {
    successMessage: 'Enable managed environment request submitted.',
    onSuccess: () => void onRefreshEnvironments?.(),
  });
  const { execute: execDisableManaged } = useMutation(disableManagedEnvironment, {
    successMessage: 'Disable managed environment request submitted.',
    onSuccess: () => void onRefreshEnvironments?.(),
  });
  const { execute: execBackup, isLoading: isBackupLoading } = useMutation(createEnvironmentBackup, {
    successMessage: 'Backup request submitted. It may take a few minutes to complete.',
    onSuccess: () => setShowBackup(false),
  });

  async function runAction(action: () => Promise<unknown>) {
    setIsPending(true);
    await action();
    setIsPending(false);
  }

  // Resources in this environment
  const envResources = useMemo(() => {
    const envNameLower = displayName.toLowerCase();
    return resources.filter(
      (r) =>
        (r.environmentName ?? '').toLowerCase() === envNameLower &&
        !r.type.includes('environments'),
    );
  }, [resources, displayName]);

  // Breakdown by type
  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of envResources) {
      map.set(r.type, (map.get(r.type) ?? 0) + 1);
    }
    return map;
  }, [envResources]);

  // Filtered resource table
  const filteredResources = useMemo(() => {
    const term = search.toLowerCase();
    if (!term) return envResources;
    return envResources.filter((r) =>
      (r.properties.displayName ?? r.name).toLowerCase().includes(term) ||
      RESOURCE_TYPE_LABELS[r.type]?.toLowerCase().includes(term),
    );
  }, [envResources, search]);

  return (
    <div className={styles.root}>
      {/* Back */}
      <div className={styles.backRow}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack}>
          Environments
        </Button>
      </div>

      {/* Header */}
      <div className={styles.headerRow}>
        <GlobeRegular style={{ fontSize: '1.5rem', color: tokens.colorBrandForeground1, flexShrink: 0 }} />
        <Text className={styles.headerTitle}>{displayName}</Text>
        <Badge appearance="filled" color={envTypeColor(envType)}>{envType}</Badge>
        {isManaged && (
          <Badge appearance="outline" color="success">Managed</Badge>
        )}
        <Menu>
          <MenuTrigger>
            <Button
              appearance="outline"
              size="small"
              icon={<MoreHorizontalRegular />}
              disabled={isPending}
            >
              Actions
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<PlayRegular />} onClick={() => void runAction(() => execEnable(env.name))}>
                Enable
              </MenuItem>
              <MenuItem icon={<StopRegular />} onClick={() => setConfirmAction({ type: 'disable' })}>
                Disable
              </MenuItem>
              {isManaged ? (
                <MenuItem icon={<ShieldDismissRegular />} onClick={() => setConfirmAction({ type: 'disableManaged' })}>
                  Disable Managed
                </MenuItem>
              ) : (
                <MenuItem icon={<ShieldRegular />} onClick={() => void runAction(() => execEnableManaged(env.name))}>
                  Enable Managed
                </MenuItem>
              )}
              <MenuItem icon={<SaveRegular />} onClick={() => setShowBackup(true)}>
                Create Backup
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>

      <Divider />

      {/* Metadata */}
      <div className={styles.metaGrid}>
        <MetaItem icon={<GlobeRegular />} label="Region" value={region} />
        <MetaItem icon={<CalendarRegular />} label="Created" value={createdAt} />
        <MetaItem icon={<KeyRegular />} label="Environment ID" value={env.name} />
        {env.properties.createdBy && (
          <MetaItem icon={<PersonRegular />} label="Created By" value={String(env.properties.createdBy)} />
        )}
        {env.properties.ownerId && (
          <MetaItem icon={<PersonRegular />} label="Owner ID" value={String(env.properties.ownerId)} />
        )}
        <MetaItem icon={<BoxRegular />} label="Total Resources" value={String(envResources.length)} />
      </div>

      {/* Resource type breakdown */}
      {typeCounts.size > 0 && (
        <div className={styles.statsGrid}>
          {Array.from(typeCounts.entries()).map(([type, count]) => (
            <Card key={type} className={styles.statCard}>
              <Text className={styles.statCount}>{count}</Text>
              <Text className={styles.statLabel}>{RESOURCE_TYPE_LABELS[type] ?? type}</Text>
            </Card>
          ))}
        </div>
      )}

      <Divider />

      {/* Resources table */}
      <div className={styles.resourcesSection}>
        <div className={styles.resourcesHeader}>
          <Text className={styles.resourcesTitle}>Resources</Text>
          <Input
            placeholder="Search resources…"
            value={search}
            onChange={(_, data) => setSearch(data.value)}
            contentBefore={<SearchRegular />}
            size="small"
            style={{ minWidth: '220px' }}
          />
          <Text style={{ fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 }}>
            {filteredResources.length} resource(s)
          </Text>
        </div>
        <div className={styles.tableWrapper}>
          <Table size="small" sortable>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Created</TableHeaderCell>
                <TableHeaderCell>Modified</TableHeaderCell>
                <TableHeaderCell>Owner</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredResources.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Text style={{ color: tokens.colorNeutralForeground3 }}>No resources found.</Text>
                  </TableCell>
                </TableRow>
              ) : (
                filteredResources.map((r, i) => {
                  const name = r.properties.displayName ?? r.name;
                  const typeLabel = RESOURCE_TYPE_LABELS[r.type] ?? r.type;
                  const created = r.properties.createdAt
                    ? new Date(r.properties.createdAt as string).toLocaleDateString()
                    : '—';
                  const modified = r.properties.modifiedAt
                    ? new Date(r.properties.modifiedAt as string).toLocaleDateString()
                    : '—';
                  const owner = (r.properties.createdBy ?? r.properties.ownerId ?? '—') as string;

                  return (
                    <TableRow key={r.id ?? `${r.name}-${i}`}>
                      <TableCell>
                        <Text style={{ fontWeight: tokens.fontWeightSemibold }}>{name}</Text>
                      </TableCell>
                      <TableCell>{typeLabel}</TableCell>
                      <TableCell>{created}</TableCell>
                      <TableCell>{modified}</TableCell>
                      <TableCell>{owner}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Confirm disable */}
      <ConfirmDialog
        open={confirmAction?.type === 'disable'}
        title="Disable Environment"
        message={`Are you sure you want to disable "${displayName}"? Users will lose access.`}
        confirmLabel="Disable"
        isDangerous
        onConfirm={() => {
          setConfirmAction(null);
          void runAction(() => execDisable(env.name));
        }}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction?.type === 'disableManaged'}
        title="Disable Managed Environment"
        message={`Remove managed environment features from "${displayName}"?`}
        confirmLabel="Disable Managed"
        isDangerous
        onConfirm={() => {
          setConfirmAction(null);
          void runAction(() => execDisableManaged(env.name));
        }}
        onCancel={() => setConfirmAction(null)}
      />
      <BackupDialog
        open={showBackup}
        environmentName={displayName}
        isLoading={isBackupLoading}
        onConfirm={(notes) => void execBackup(env.name, notes)}
        onCancel={() => setShowBackup(false)}
      />
    </div>
  );
}
