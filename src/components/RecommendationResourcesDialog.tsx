import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Spinner,
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Text,
  Badge,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { PlayRegular, PersonRegular, GlobeRegular } from '@fluentui/react-icons';
import { PowerPlatformforAdminsV2Service } from '../generated/services/PowerPlatformforAdminsV2Service.ts';
import type { AdvisorRecommendationResource } from '../generated/models/PowerPlatformforAdminsV2Model.ts';
import { useMutation } from '../hooks/useMutation.tsx';

const API_VERSION = '2024-10-01';

interface Action {
  actionType?: string;
  actionName?: string;
}

interface RecommendationResourcesDialogProps {
  open: boolean;
  scenario: string;
  scenarioDisplayName: string;
  actions: Action[];
  onClose: () => void;
}

const useStyles = makeStyles({
  tableWrapper: {
    overflowY: 'auto',
    maxHeight: '50vh',
    minHeight: '120px',
  },
  statusBadge: {
    textTransform: 'capitalize',
  },
  actionsCell: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  metaText: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flex: 1,
  },
  bulkButton: {
    marginLeft: 'auto',
  },
});

function statusColor(status?: string): 'brand' | 'success' | 'warning' | 'danger' | 'informative' {
  if (!status) return 'informative';
  const s = status.toLowerCase();
  if (s.includes('complete') || s.includes('success')) return 'success';
  if (s.includes('fail') || s.includes('error')) return 'danger';
  if (s.includes('pending') || s.includes('progress')) return 'warning';
  return 'informative';
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

async function executeForResource(scenario: string, actionName: string, resourceId: string) {
  const result = await PowerPlatformforAdminsV2Service.ExecuteRecommendationAction(
    { scenario, actionParameters: { resourceId: [resourceId] } },
    actionName,
    API_VERSION,
  );
  if (!result.success || result.error) throw new Error(result.error?.message ?? 'Action failed');
  return result.data;
}

async function executeBulk(scenario: string, actionName: string) {
  const result = await PowerPlatformforAdminsV2Service.ExecuteRecommendationAction(
    { scenario, actionParameters: {} },
    actionName,
    API_VERSION,
  );
  if (!result.success || result.error) throw new Error(result.error?.message ?? 'Action failed');
  return result.data;
}

export default function RecommendationResourcesDialog({
  open,
  scenario,
  scenarioDisplayName,
  actions,
  onClose,
}: RecommendationResourcesDialogProps): ReactElement {
  const styles = useStyles();
  const [resources, setResources] = useState<AdvisorRecommendationResource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pendingResourceId, setPendingResourceId] = useState<string | null>(null);

  const { execute: execResource } = useMutation(
    (resId: string, actionName: string) => executeForResource(scenario, actionName, resId),
    { successMessage: 'Action submitted for resource.' },
  );

  const { execute: execBulk, isLoading: isBulkLoading } = useMutation(
    (actionName: string) => executeBulk(scenario, actionName),
    { successMessage: 'Bulk action submitted for all resources.' },
  );

  useEffect(() => {
    if (!open) { setResources([]); setFetchError(null); return; }
    setIsLoading(true);
    PowerPlatformforAdminsV2Service.GetRecommendationResources(scenario, API_VERSION)
      .then((result) => {
        if (!result.success || result.error) throw new Error(result.error?.message ?? 'Failed to load resources');
        setResources(result.data?.value ?? []);
      })
      .catch((err: unknown) => setFetchError(String(err)))
      .finally(() => setIsLoading(false));
  }, [open, scenario]);

  const primaryAction = actions[0];

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface style={{ maxWidth: '900px', width: '90vw' }}>
        <DialogBody>
          <DialogTitle>{scenarioDisplayName} — Affected Resources</DialogTitle>
          <DialogContent>
            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXL }}>
                <Spinner label="Loading resources…" />
              </div>
            ) : fetchError ? (
              <Text style={{ color: tokens.colorStatusDangerForeground1 }}>{fetchError}</Text>
            ) : resources.length === 0 ? (
              <Text style={{ color: tokens.colorNeutralForeground3 }}>No resources found for this recommendation.</Text>
            ) : (
              <div className={styles.tableWrapper}>
                <Table size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Name</TableHeaderCell>
                      <TableHeaderCell>Type</TableHeaderCell>
                      <TableHeaderCell>Owner</TableHeaderCell>
                      <TableHeaderCell>Environment</TableHeaderCell>
                      <TableHeaderCell>Last Accessed</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      {actions.length > 0 && <TableHeaderCell>Actions</TableHeaderCell>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resources.map((r, i) => {
                      const key = r.resourceId ?? `r-${i}`;
                      const isPending = pendingResourceId === key;
                      return (
                        <TableRow key={key}>
                          <TableCell>
                            <Text style={{ fontWeight: tokens.fontWeightSemibold }}>
                              {r.resourceName ?? r.resourceId ?? '—'}
                            </Text>
                            {r.resourceDescription && (
                              <Text style={{ display: 'block', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 }}>
                                {r.resourceDescription}
                              </Text>
                            )}
                          </TableCell>
                          <TableCell>
                            <Text style={{ fontSize: tokens.fontSizeBase200 }}>
                              {r.resourceSubType ?? r.resourceType ?? '—'}
                            </Text>
                          </TableCell>
                          <TableCell>
                            <span className={styles.metaText}>
                              <PersonRegular style={{ fontSize: '0.85rem' }} />
                              {r.resourceOwner ?? r.resourceOwnerId ?? '—'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={styles.metaText}>
                              <GlobeRegular style={{ fontSize: '0.85rem' }} />
                              {r.environmentName ?? r.environmentId ?? '—'}
                            </span>
                          </TableCell>
                          <TableCell>{formatDate(r.lastAccessedDate ?? r.lastModifiedDate)}</TableCell>
                          <TableCell>
                            {r.resourceActionStatus ? (
                              <Badge
                                appearance="tint"
                                color={statusColor(r.resourceActionStatus)}
                                size="small"
                                className={styles.statusBadge}
                              >
                                {r.resourceActionStatus}
                              </Badge>
                            ) : '—'}
                          </TableCell>
                          {actions.length > 0 && (
                            <TableCell>
                              <div className={styles.actionsCell}>
                                {actions.map((a) => (
                                  <Button
                                    key={a.actionType ?? a.actionName}
                                    appearance="outline"
                                    size="small"
                                    icon={isPending ? <Spinner size="tiny" /> : <PlayRegular />}
                                    disabled={isPending || isBulkLoading}
                                    onClick={async () => {
                                      setPendingResourceId(key);
                                      await execResource(r.resourceId ?? '', a.actionType ?? a.actionName ?? '');
                                      setPendingResourceId(null);
                                    }}
                                  >
                                    {a.actionName ?? a.actionType}
                                  </Button>
                                ))}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <div className={styles.footer}>
              {!isLoading && resources.length > 0 && (
                <Text style={{ fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 }}>
                  {resources.length} resource(s)
                </Text>
              )}
              <Button appearance="secondary" onClick={onClose}>Close</Button>
              {primaryAction && resources.length > 0 && (
                <Button
                  appearance="primary"
                  icon={isBulkLoading ? <Spinner size="tiny" /> : <PlayRegular />}
                  disabled={isBulkLoading || isLoading}
                  className={styles.bulkButton}
                  onClick={() => void execBulk(primaryAction.actionType ?? primaryAction.actionName ?? '')}
                >
                  {isBulkLoading ? 'Executing…' : `Execute All — ${primaryAction.actionName ?? primaryAction.actionType}`}
                </Button>
              )}
            </div>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
