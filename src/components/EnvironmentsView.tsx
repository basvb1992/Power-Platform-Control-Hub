import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Card,
  Badge,
  Input,
  Spinner,
  MessageBar,
  MessageBarBody,
  Divider,
  Button,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Field,
  Textarea,
  Menu,
  MenuTrigger,
  MenuList,
  MenuItem,
  MenuPopover,
} from '@fluentui/react-components';
import {
  SearchRegular,
  GlobeRegular,
  LockClosedRegular,
  AppsListRegular,
  BoxRegular,
  MoreHorizontalRegular,
  PlayRegular,
  StopRegular,
  ShieldRegular,
  ShieldDismissRegular,
  SaveRegular,
} from '@fluentui/react-icons';
import type { Resource } from '../types/inventory.ts';
import ConfirmDialog from './ConfirmDialog.tsx';
import { useMutation } from '../hooks/useMutation.tsx';
import {
  enableEnvironment,
  disableEnvironment,
  enableManagedEnvironment,
  disableManagedEnvironment,
  createEnvironmentBackup,
} from '../services/environmentMutations.ts';

interface EnvironmentsViewProps {
  environments: Resource[];
  resources: Resource[];
  isLoading: boolean;
  error: string | null;
  onRefreshEnvironments?: () => Promise<void>;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXL,
    height: '100%',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    marginRight: 'auto',
  },
  count: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: tokens.spacingHorizontalXL,
    overflowY: 'auto',
    flex: 1,
    paddingBottom: tokens.spacingVerticalL,
    alignItems: 'start',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    padding: tokens.spacingVerticalM,
    gap: tokens.spacingVerticalS,
    minWidth: 0,
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  cardIcon: {
    fontSize: '1.25rem',
    color: tokens.colorBrandForeground1,
    flexShrink: 0,
  },
  cardTitles: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardRegion: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  badgeRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    paddingTop: tokens.spacingVerticalXS,
  },
  divider: {
    marginTop: tokens.spacingVerticalXS,
    marginBottom: tokens.spacingVerticalXS,
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  metaIcon: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  centered: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
});

function envTypeColor(
  envType: string,
): 'brand' | 'success' | 'warning' | 'important' | 'informative' {
  switch (envType.toLowerCase()) {
    case 'production': return 'brand';
    case 'sandbox': return 'warning';
    case 'developer': return 'success';
    case 'default': return 'informative';
    default: return 'important';
  }
}

interface BackupDialogProps {
  open: boolean;
  envName: string;
  isLoading: boolean;
  onConfirm: (notes: string) => void;
  onCancel: () => void;
}

function BackupDialog({ open, envName, isLoading, onConfirm, onCancel }: BackupDialogProps): ReactElement {
  const [notes, setNotes] = useState('');
  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onCancel(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Create Backup — {envName}</DialogTitle>
          <DialogContent>
            <Field label="Backup notes (optional)" style={{ marginTop: tokens.spacingVerticalS }}>
              <Textarea
                value={notes}
                onChange={(_, data) => setNotes(data.value)}
                placeholder="e.g. Pre-release snapshot"
                rows={3}
              />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" disabled={isLoading} onClick={onCancel}>Cancel</Button>
            <Button appearance="primary" disabled={isLoading} onClick={() => onConfirm(notes)}>
              {isLoading ? 'Submitting…' : 'Create Backup'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export default function EnvironmentsView({
  environments,
  resources,
  isLoading,
  error,
  onRefreshEnvironments,
}: EnvironmentsViewProps): ReactElement {
  const styles = useStyles();
  const [search, setSearch] = useState('');
  const [confirmAction, setConfirmAction] = useState<{
    type: 'disable' | 'disableManaged';
    env: Resource;
  } | null>(null);
  const [backupEnv, setBackupEnv] = useState<Resource | null>(null);
  const [pendingEnvId, setPendingEnvId] = useState<string | null>(null);

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
    onSuccess: () => setBackupEnv(null),
  });

  async function runAction(envId: string, action: () => Promise<unknown>) {
    setPendingEnvId(envId);
    await action();
    setPendingEnvId(null);
  }

  // Pre-compute resource counts per environment name (lower-cased for matching).
  const countByEnv = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of resources) {
      const key = (r.environmentName ?? '').toLowerCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [resources]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    if (!term) return environments;
    return environments.filter((e) => {
      const name = (e.properties.displayName ?? e.name).toLowerCase();
      return name.includes(term) || (e.location ?? '').toLowerCase().includes(term);
    });
  }, [environments, search]);

  if (isLoading) {
    return (
      <div className={styles.centered}>
        <Spinner size="extra-large" label="Loading environments…" />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <Text className={styles.title}>Environments</Text>
        <Input
          placeholder="Search environments…"
          value={search}
          onChange={(_, data) => setSearch(data.value)}
          contentBefore={<SearchRegular />}
          size="small"
          style={{ minWidth: '200px' }}
        />
        <Text className={styles.count}>{filtered.length} environment(s)</Text>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.grid}>
        {filtered.length === 0 ? (
          <Text style={{ color: tokens.colorNeutralForeground3 }}>
            No environments found.
          </Text>
        ) : (
          filtered.map((e, i) => {
            const displayName = e.properties.displayName ?? e.name;
            const envType = (e.properties.environmentType ?? 'Unknown') as string;
            const isManaged = e.properties.isManaged === true;
            const region = e.location ?? '—';
            const resourceCount = countByEnv.get(displayName.toLowerCase()) ?? 0;
            const createdAt = e.properties.createdAt
              ? new Date(e.properties.createdAt as string).toLocaleDateString()
              : null;
            const isPending = pendingEnvId === e.name;

            return (
              <Card key={e.id ?? `env-${e.name}-${i}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <GlobeRegular className={styles.cardIcon} />
                  <div className={styles.cardTitles}>
                    <Text className={styles.cardName} title={displayName}>{displayName}</Text>
                    <Text className={styles.cardRegion}>{region}</Text>
                  </div>
                  <Menu>
                    <MenuTrigger>
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<MoreHorizontalRegular />}
                        disabled={isPending}
                        title="Actions"
                        style={{ marginLeft: 'auto', flexShrink: 0 }}
                      />
                    </MenuTrigger>
                    <MenuPopover>
                      <MenuList>
                        <MenuItem
                          icon={<PlayRegular />}
                          onClick={() => void runAction(e.name, () => execEnable(e.name))}
                        >
                          Enable
                        </MenuItem>
                        <MenuItem
                          icon={<StopRegular />}
                          onClick={() => setConfirmAction({ type: 'disable', env: e })}
                        >
                          Disable
                        </MenuItem>
                        {isManaged ? (
                          <MenuItem
                            icon={<ShieldDismissRegular />}
                            onClick={() => setConfirmAction({ type: 'disableManaged', env: e })}
                          >
                            Disable Managed
                          </MenuItem>
                        ) : (
                          <MenuItem
                            icon={<ShieldRegular />}
                            onClick={() => void runAction(e.name, () => execEnableManaged(e.name))}
                          >
                            Enable Managed
                          </MenuItem>
                        )}
                        <MenuItem
                          icon={<SaveRegular />}
                          onClick={() => setBackupEnv(e)}
                        >
                          Create Backup
                        </MenuItem>
                      </MenuList>
                    </MenuPopover>
                  </Menu>
                </div>

                <div className={styles.badgeRow}>
                  <Badge appearance="filled" color={envTypeColor(envType)} size="small">
                    {envType}
                  </Badge>
                  {isManaged && (
                    <Badge appearance="outline" color="success" size="small" icon={<LockClosedRegular />}>
                      Managed
                    </Badge>
                  )}
                  {isPending && <Spinner size="tiny" />}
                </div>

                <Divider className={styles.divider} />

                <div className={styles.metaRow}>
                  <span className={styles.metaIcon}>
                    <BoxRegular style={{ fontSize: '0.9rem' }} />
                    <Text>Resources</Text>
                  </span>
                  <Text style={{ fontWeight: tokens.fontWeightSemibold }}>{resourceCount}</Text>
                </div>

                {createdAt && (
                  <div className={styles.metaRow}>
                    <span className={styles.metaIcon}>
                      <AppsListRegular style={{ fontSize: '0.9rem' }} />
                      <Text>Created</Text>
                    </span>
                    <Text>{createdAt}</Text>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Disable environment confirmation */}
      <ConfirmDialog
        open={confirmAction?.type === 'disable'}
        title="Disable Environment"
        message={`Disable "${confirmAction?.env.properties.displayName ?? confirmAction?.env.name}"? Users will lose access until it is re-enabled.`}
        confirmLabel="Disable"
        isDangerous
        onConfirm={() => {
          if (confirmAction) {
            void runAction(confirmAction.env.name, () => execDisable(confirmAction.env.name));
          }
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Disable managed environment confirmation */}
      <ConfirmDialog
        open={confirmAction?.type === 'disableManaged'}
        title="Disable Managed Environment"
        message={`Remove managed status from "${confirmAction?.env.properties.displayName ?? confirmAction?.env.name}"? Managed environment policies will no longer apply.`}
        confirmLabel="Disable Managed"
        isDangerous
        onConfirm={() => {
          if (confirmAction) {
            void runAction(confirmAction.env.name, () => execDisableManaged(confirmAction.env.name));
          }
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Backup dialog */}
      {backupEnv && (
        <BackupDialog
          open
          envName={backupEnv.properties.displayName ?? backupEnv.name}
          isLoading={isBackupLoading}
          onConfirm={(notes) => void execBackup(backupEnv.name, notes)}
          onCancel={() => setBackupEnv(null)}
        />
      )}
    </div>
  );
}
