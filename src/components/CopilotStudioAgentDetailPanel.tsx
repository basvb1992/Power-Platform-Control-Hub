import { useState, useEffect } from 'react';
import type { ReactElement } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Badge,
  Button,
  Spinner,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  MessageBar,
  MessageBarBody,
  Tooltip,
  useToastController,
  Toast,
  ToastTitle,
  ToastBody,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  DeleteRegular,
  ArrowClockwiseRegular,
  InfoRegular,
  ShieldCheckmarkRegular,
  WarningRegular,
  ErrorCircleRegular,
  CheckmarkRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  BotRegular,
  LockClosedRegular,
  LockOpenRegular,
  CalendarRegular,
  BrainRegular,
  CodeRegular,
} from '@fluentui/react-icons';
import type { Resource } from '../types/inventory.ts';
import type { Bots } from '../generated/models/BotsModel.ts';
import {
  fetchBotDetails,
  getEnvironmentDataverseInfo,
  deleteCopilotAgent,
  getBotQuarantineStatus,
  quarantineBot,
  unquarantineBot,
} from '../services/copilotStudioService.ts';
import type { BotEnvironmentInfo } from '../services/copilotStudioService.ts';
import type { AnalysisResult, AnalysisSeverity } from '../services/flowAnalyzer.ts';
import { extractMessage } from '../utils/errorUtils.ts';
import ConfirmDialog from './ConfirmDialog.tsx';

interface Props {
  resource: Resource;
  onClose: () => void;
  onDeleted: (resourceName: string) => void;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
    flexWrap: 'wrap',
    '@media (max-width: 768px)': {
      padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    },
  },
  headerMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  envText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  actionBar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalXL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
    '@media (max-width: 768px)': {
      padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    },
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXL}`,
    width: '100%',
    boxSizing: 'border-box',
    '@media (max-width: 768px)': {
      padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    },
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: '180px 1fr',
    gap: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    alignItems: 'start',
    '@media (max-width: 600px)': {
      gridTemplateColumns: '1fr',
    },
  },
  detailLabel: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    paddingTop: '2px',
  },
  detailValue: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  sectionTitle: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalS,
  },
  jsonBox: {
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: tokens.fontSizeBase200,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingHorizontalM,
    overflowX: 'auto',
    whiteSpace: 'pre',
    lineHeight: '1.5',
    color: tokens.colorNeutralForeground1,
    maxHeight: '480px',
    overflowY: 'auto',
  },
  analysisSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    marginBottom: tokens.spacingVerticalM,
    flexWrap: 'wrap' as const,
  },
  analysisList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: 'hidden',
  },
  analysisRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    cursor: 'pointer',
    userSelect: 'none' as const,
    backgroundColor: tokens.colorNeutralBackground1,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':last-child': { borderBottom: 'none' },
  },
  analysisRowExpanded: {
    backgroundColor: tokens.colorNeutralBackground2,
  },
  analysisRowDetail: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: tokens.spacingVerticalS,
    ':last-child': { borderBottom: 'none' },
  },
  analysisTitle: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    flex: 1,
  },
  analysisDesc: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    lineHeight: '1.5',
  },
  analysisRec: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    lineHeight: '1.5',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    borderLeft: `3px solid ${tokens.colorBrandStroke1}`,
  },
});

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function severityIcon(severity: AnalysisSeverity): ReactElement {
  if (severity === 'critical') return <ErrorCircleRegular style={{ color: tokens.colorStatusDangerForeground1, flexShrink: 0 }} fontSize={16} />;
  if (severity === 'warning') return <WarningRegular style={{ color: tokens.colorStatusWarningForeground1, flexShrink: 0 }} fontSize={16} />;
  return <CheckmarkRegular style={{ color: tokens.colorStatusSuccessForeground1, flexShrink: 0 }} fontSize={16} />;
}

// ── Best practice analysis for Copilot Studio agents ──────────────────────────

function analyzeCopilotAgent(bot: Bots | null): AnalysisResult[] {
  const results: AnalysisResult[] = [];
  if (!bot) return results;

  // 1. Agent is inactive
  if (Number(bot.statecode) !== 0) {
    results.push({
      id: 'inactive-agent',
      title: 'Agent is inactive',
      description: 'This Copilot Studio agent is currently in an inactive state and will not respond to users.',
      recommendation: 'Activate the agent if it should be serving users, or delete it if it is no longer needed.',
      severity: 'warning',
    });
  }

  // 2. Never published
  if (!bot.publishedon) {
    results.push({
      id: 'never-published',
      title: 'Agent has never been published',
      description: 'This agent has no published version. Users cannot interact with an unpublished agent.',
      recommendation: 'Publish the agent from Copilot Studio to make it available to end users.',
      severity: 'warning',
    });
  }

  // 3. Authentication mode: Unspecified or None (may be intentional but worth noting)
  const authMode = Number(bot.authenticationmode);
  if (authMode === 0 || authMode === 1) {
    results.push({
      id: 'auth-mode-none',
      title: 'Authentication mode is None or Unspecified',
      description: `This agent's authentication mode is set to "${authMode === 0 ? 'Unspecified' : 'None'}". Anyone can interact with it without signing in.`,
      recommendation: 'Consider enabling authentication (AAD, Custom) if this agent handles sensitive data or should only be accessible to authorised users.',
      severity: 'warning',
    });
  }

  // 4. No configuration data
  if (!bot.configuration || bot.configuration === '{}') {
    results.push({
      id: 'empty-configuration',
      title: 'No configuration data found',
      description: 'The agent\'s configuration field in Dataverse is empty. The agent may not have been set up or the data may be incomplete.',
      recommendation: 'Verify the agent is correctly saved in Copilot Studio and that the Dataverse bots table is accessible.',
      severity: 'warning',
    });
  }

  // 5. Language not set
  if (!bot.language) {
    results.push({
      id: 'no-language',
      title: 'No primary language configured',
      description: 'The agent does not have a primary language set in Dataverse.',
      recommendation: 'Ensure the agent has a configured primary language for accurate language routing.',
      severity: 'warning',
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CopilotStudioAgentDetailPanel({ resource, onClose, onDeleted }: Props): ReactElement {
  const styles = useStyles();
  const { dispatchToast } = useToastController();

  const displayName = (resource.properties.displayName as string) ?? resource.name;
  const envId = (resource.properties.environmentId as string) ?? '';
  const botName = resource.name; // GUID or internal name from Inventory API

  const [bot, setBot] = useState<Bots | null>(null);
  const [botLoading, setBotLoading] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);

  const [instanceUrl, setInstanceUrl] = useState<string | null>(null);
  const [dataverseError, setDataverseError] = useState<string | null>(null);
  const [isQuarantined, setIsQuarantined] = useState<boolean | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expandedAnalysis, setExpandedAnalysis] = useState<Set<string>>(new Set());
  const [openSections, setOpenSections] = useState<string[]>(['details', 'analysis']);

  function handleSectionToggle(_: unknown, data: { openItems: string[] }) {
    setOpenSections(data.openItems);
  }

  async function loadDetails() {
    setBotLoading(true);
    setBotError(null);
    try {
      // Use the instance URL already joined from the inventory query (fastest, no extra call).
      // Fall back to a GetEnvironmentByIdForUser (V2) / GetSingleEnvironment (V1) call only if not in the resource.
      let envInstanceUrl = resource.environmentInstanceUrl ?? null;
      if (!envInstanceUrl) {
        const envInfo = await getEnvironmentDataverseInfo(envId);
        envInstanceUrl = envInfo.instanceUrl ?? null;
        if (!envInstanceUrl && envInfo.dataverseError) {
          setDataverseError(envInfo.dataverseError);
        }
      }
      setInstanceUrl(envInstanceUrl);

      const envInfo: BotEnvironmentInfo = { instanceUrl: envInstanceUrl ?? undefined };
      const result = await fetchBotDetails(botName, envInfo);
      setBot(result.bot);
      if (!result.bot && result.crossEnvError) {
        setBotError(result.crossEnvError);
      }

      // Fetch quarantine status (best-effort)
      try {
        const q = await getBotQuarantineStatus(envId, botName);
        setIsQuarantined(q);
      } catch {
        setIsQuarantined(null);
      }
    } catch (e) {
      setBotError(extractMessage(e instanceof Error ? e.message : 'Failed to load agent details'));
    } finally {
      setBotLoading(false);
    }
  }

  useEffect(() => { void loadDetails(); }, []);

  async function handleDelete() {
    setActionLoading('delete');
    try {
      await deleteCopilotAgent(envId, botName);
      dispatchToast(
        <Toast><ToastTitle>Agent deleted</ToastTitle><ToastBody>"{displayName}" has been deleted.</ToastBody></Toast>,
        { intent: 'success' },
      );
      onDeleted(resource.name);
    } catch (e) {
      dispatchToast(
        <Toast><ToastTitle>Delete failed</ToastTitle><ToastBody>{extractMessage(e instanceof Error ? e.message : 'Unknown error')}</ToastBody></Toast>,
        { intent: 'error' },
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleQuarantine() {
    const action = isQuarantined ? 'unquarantine' : 'quarantine';
    setActionLoading(action);
    try {
      if (isQuarantined) {
        await unquarantineBot(envId, botName);
        setIsQuarantined(false);
        dispatchToast(<Toast><ToastTitle>Agent unquarantined</ToastTitle></Toast>, { intent: 'success' });
      } else {
        await quarantineBot(envId, botName);
        setIsQuarantined(true);
        dispatchToast(<Toast><ToastTitle>Agent quarantined</ToastTitle></Toast>, { intent: 'success' });
      }
    } catch (e) {
      dispatchToast(
        <Toast><ToastTitle>Action failed</ToastTitle><ToastBody>{extractMessage(e instanceof Error ? e.message : 'Unknown error')}</ToastBody></Toast>,
        { intent: 'error' },
      );
    } finally {
      setActionLoading(null);
    }
  }

  function toggleAnalysis(id: string) {
    setExpandedAnalysis((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const analysis = analyzeCopilotAgent(bot);
  const issueCount = analysis.filter((r) => r.severity !== 'info').length;
  const hasIssues = issueCount > 0;

  // Parse configuration JSON for display
  let configDisplay = '—';
  if (bot?.configuration) {
    try {
      configDisplay = JSON.stringify(JSON.parse(bot.configuration) as unknown, null, 2);
    } catch {
      configDisplay = bot.configuration;
    }
  }

  const isActive = Number(bot?.statecode) === 0;

  const authModeLabels: Record<number, string> = {
    0: 'Unspecified', 1: 'None', 2: 'Integrated', 3: 'Custom',
    5: 'Azure AD v2', 6: 'Azure AD v2 (Certificate)', 10: 'Generic OAuth 2',
  };

  return (
    <>
      <div className={styles.root}>
        {/* Header */}
        <div className={styles.header}>
          <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onClose} size="small">
            Back to Resources
          </Button>
          <BotRegular fontSize={20} style={{ color: tokens.colorPaletteGreenForeground1, flexShrink: 0 }} />
          <div className={styles.headerMeta}>
            <div className={styles.titleRow}>
              <Tooltip content={displayName} relationship="label">
                <Text className={styles.title}>{displayName}</Text>
              </Tooltip>
              <Badge appearance="tint" color="success" size="small">Copilot Studio Agent</Badge>
              {bot && (
                <Badge
                  appearance="tint"
                  color={isActive ? 'success' : 'warning'}
                  size="small"
                  icon={isActive ? <CheckmarkCircleRegular /> : <DismissCircleRegular />}
                >
                  {isActive ? 'Active' : 'Inactive'}
                </Badge>
              )}
              {isQuarantined === true && (
                <Badge appearance="tint" color="danger" size="small" icon={<LockClosedRegular />}>
                  Quarantined
                </Badge>
              )}
            </div>
            {resource.environmentName && (
              <Text className={styles.envText}>🌐 {resource.environmentName}</Text>
            )}
          </div>
        </div>

        {/* Action bar */}
        <div className={styles.actionBar}>
          <Button
            appearance="subtle"
            icon={actionLoading === 'quarantine' || actionLoading === 'unquarantine'
              ? <Spinner size="tiny" />
              : isQuarantined ? <LockOpenRegular /> : <LockClosedRegular />}
            disabled={actionLoading !== null || isQuarantined === null}
            onClick={() => void handleQuarantine()}
            size="small"
          >
            {isQuarantined ? 'Unquarantine' : 'Quarantine'}
          </Button>
          <Button
            appearance="subtle"
            icon={<ArrowClockwiseRegular />}
            disabled={actionLoading !== null || botLoading}
            onClick={() => void loadDetails()}
            size="small"
            title="Refresh"
          />
          <div style={{ marginLeft: 'auto' }}>
            <Button
              appearance="subtle"
              icon={actionLoading === 'delete' ? <Spinner size="tiny" /> : <DeleteRegular />}
              disabled={actionLoading !== null}
              onClick={() => setConfirmDelete(true)}
              size="small"
              style={{ color: tokens.colorStatusDangerForeground1 }}
            >
              Delete
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {botLoading && (
            <Spinner size="small" label="Loading agent details…" style={{ marginBottom: tokens.spacingVerticalM }} />
          )}
          {botError && (
            <MessageBar intent="warning" style={{ marginBottom: tokens.spacingVerticalM }}>
              <MessageBarBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS }}>
                  <span>
                    Could not load bot record from Dataverse.{' '}
                    <a
                      href={`https://copilotstudio.microsoft.com/environments/${envId}/bots/${botName}/overview`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: tokens.colorBrandForegroundLink }}
                    >
                      View in Copilot Studio ↗
                    </a>
                  </span>
                  <Text style={{ fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 }}>
                    {botError}
                  </Text>
                </div>
              </MessageBarBody>
            </MessageBar>
          )}

          <Accordion
            multiple
            collapsible
            openItems={openSections}
            onToggle={handleSectionToggle as (e: unknown, d: { openItems: string[] }) => void}
          >
            {/* ── Agent Details ── */}
            <AccordionItem value="details">
              <AccordionHeader expandIconPosition="end" icon={<InfoRegular />}>
                Agent Details
              </AccordionHeader>
              <AccordionPanel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL, paddingBottom: tokens.spacingVerticalL }}>
                  <div className={styles.detailGrid}>
                    <span className={styles.detailLabel}>Display Name</span>
                    <span className={styles.detailValue}>{displayName}</span>

                    {bot?.schemaname && (
                      <>
                        <span className={styles.detailLabel}>Schema Name</span>
                        <span className={styles.detailValue} style={{ fontSize: tokens.fontSizeBase200, wordBreak: 'break-all', color: tokens.colorNeutralForeground3 }}>
                          {bot.schemaname}
                        </span>
                      </>
                    )}

                    {bot && (
                      <>
                        <span className={styles.detailLabel}>Status</span>
                        <span className={styles.detailValue}>
                          <Badge appearance="tint" color={isActive ? 'success' : 'warning'} size="small"
                            icon={isActive ? <CheckmarkCircleRegular /> : <DismissCircleRegular />}>
                            {isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </span>
                      </>
                    )}

                    {bot?.language !== undefined && bot.language !== null && (
                      <>
                        <span className={styles.detailLabel}>Language (LCID)</span>
                        <span className={styles.detailValue}>{bot.language}</span>
                      </>
                    )}

                    {bot?.authenticationmode !== undefined && (
                      <>
                        <span className={styles.detailLabel}>Authentication</span>
                        <span className={styles.detailValue}>
                          {authModeLabels[Number(bot.authenticationmode)] ?? String(bot.authenticationmode)}
                        </span>
                      </>
                    )}

                    {bot?.publishedon && (
                      <>
                        <span className={styles.detailLabel}>Last Published</span>
                        <span className={styles.detailValue}>
                          <CalendarRegular fontSize={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                          {formatDate(bot.publishedon)}
                        </span>
                      </>
                    )}

                    {(bot?.createdon ?? resource.properties.createdAt) && (
                      <>
                        <span className={styles.detailLabel}>Created</span>
                        <span className={styles.detailValue}>
                          <CalendarRegular fontSize={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                          {formatDate((bot?.createdon ?? resource.properties.createdAt) as string)}
                        </span>
                      </>
                    )}

                    {bot?.modifiedon && (
                      <>
                        <span className={styles.detailLabel}>Last Modified</span>
                        <span className={styles.detailValue}>
                          <CalendarRegular fontSize={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                          {formatDate(bot.modifiedon)}
                        </span>
                      </>
                    )}

                    {bot?.owneridname && (
                      <>
                        <span className={styles.detailLabel}>Owner</span>
                        <span className={styles.detailValue}>{bot.owneridname}</span>
                      </>
                    )}

                    {bot?.createdbyname && (
                      <>
                        <span className={styles.detailLabel}>Created By</span>
                        <span className={styles.detailValue}>{bot.createdbyname}</span>
                      </>
                    )}

                    <span className={styles.detailLabel}>Environment</span>
                    <span className={styles.detailValue}>
                      {resource.environmentName
                        ? <span>
                            <span style={{ fontWeight: tokens.fontWeightSemibold }}>{resource.environmentName}</span>
                            <span style={{ display: 'block', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, wordBreak: 'break-all' }}>{envId}</span>
                          </span>
                        : <span style={{ color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, wordBreak: 'break-all' }}>{envId}</span>
                      }
                    </span>

                    {instanceUrl && (
                      <>
                        <span className={styles.detailLabel}>Dataverse URL</span>
                        <span className={styles.detailValue} style={{ fontSize: tokens.fontSizeBase200, wordBreak: 'break-all', color: tokens.colorNeutralForeground3 }}>
                          {instanceUrl}
                        </span>
                      </>
                    )}

                    <span className={styles.detailLabel}>Agent ID</span>
                    <span className={styles.detailValue} style={{ fontSize: tokens.fontSizeBase200, wordBreak: 'break-all', color: tokens.colorNeutralForeground3 }}>
                      {bot?.botid ?? botName}
                    </span>

                    {isQuarantined !== null && (
                      <>
                        <span className={styles.detailLabel}>Quarantine</span>
                        <span className={styles.detailValue}>
                          <Badge
                            appearance="tint"
                            color={isQuarantined ? 'danger' : 'success'}
                            size="small"
                            icon={isQuarantined ? <LockClosedRegular /> : <LockOpenRegular />}
                          >
                            {isQuarantined ? 'Quarantined' : 'Not Quarantined'}
                          </Badge>
                        </span>
                      </>
                    )}
                  </div>

                  {!bot && !botLoading && !botError && (
                    <MessageBar intent="info">
                      <MessageBarBody>
                        {instanceUrl
                          ? <>Bot record not found in Dataverse for this environment.{' '}</>
                          : <>Unable to resolve Dataverse instance URL for this environment.{dataverseError ? <><br /><span style={{ fontSize: tokens.fontSizeBase200, opacity: 0.8 }}>{dataverseError}</span></> : ' Bot record unavailable.'}{' '}</>
                        }
                        <a
                          href={`https://copilotstudio.microsoft.com/environments/${envId}/bots/${botName}/overview`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: tokens.colorBrandForegroundLink }}
                        >
                          View in Copilot Studio ↗
                        </a>
                      </MessageBarBody>
                    </MessageBar>
                  )}
                </div>
              </AccordionPanel>
            </AccordionItem>

            {/* ── Configuration / Definition ── */}
            <AccordionItem value="configuration">
              <AccordionHeader expandIconPosition="end" icon={<CodeRegular />}>
                <span style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
                  <BrainRegular fontSize={16} />
                  Definition (Configuration)
                </span>
              </AccordionHeader>
              <AccordionPanel>
                <div style={{ paddingBottom: tokens.spacingVerticalL }}>
                  {botLoading ? (
                    <Spinner size="tiny" label="Loading configuration…" />
                  ) : bot?.configuration ? (
                    <>
                      <Text className={styles.sectionTitle} style={{ marginBottom: tokens.spacingVerticalS, display: 'block' }}>
                        Raw configuration from Dataverse <code>bots.configuration</code> column
                      </Text>
                      <div className={styles.jsonBox}>{configDisplay}</div>
                    </>
                  ) : (
                    <Text style={{ color: tokens.colorNeutralForeground3 }}>
                      {bot
                        ? 'No configuration data in this bot record.'
                        : <>Bot record not available — configuration cannot be shown.{' '}
                            <a
                              href={`https://copilotstudio.microsoft.com/environments/${envId}/bots/${botName}/overview`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: tokens.colorBrandForegroundLink }}
                            >
                              View in Copilot Studio ↗
                            </a>
                          </>
                      }
                    </Text>
                  )}
                </div>
              </AccordionPanel>
            </AccordionItem>

            {/* ── Best Practice Analysis ── */}
            <AccordionItem value="analysis">
              <AccordionHeader expandIconPosition="end" icon={<ShieldCheckmarkRegular />}>
                <span style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
                  Best Practice Analysis
                  {!botLoading && analysis.length > 0 && (
                    <Badge appearance="filled" size="small" color={hasIssues ? 'warning' : 'success'}>
                      {hasIssues ? `${issueCount} issue${issueCount !== 1 ? 's' : ''}` : 'OK'}
                    </Badge>
                  )}
                </span>
              </AccordionHeader>
              <AccordionPanel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, paddingBottom: tokens.spacingVerticalL }}>
                  {botLoading ? (
                    <Spinner size="tiny" label="Running analysis…" />
                  ) : analysis.length === 0 ? (
                    <div className={styles.analysisSummary}>
                      <CheckmarkCircleRegular fontSize={20} style={{ color: tokens.colorStatusSuccessForeground1 }} />
                      <Text>
                        {bot
                          ? 'All checks passed. No issues found.'
                          : 'Dataverse record not available — analysis requires bot data from Dataverse.'
                        }
                      </Text>
                    </div>
                  ) : (
                    <>
                      <div className={styles.analysisSummary}>
                        {hasIssues
                          ? <WarningRegular fontSize={20} style={{ color: tokens.colorStatusWarningForeground1 }} />
                          : <CheckmarkCircleRegular fontSize={20} style={{ color: tokens.colorStatusSuccessForeground1 }} />
                        }
                        <Text>
                          {hasIssues
                            ? `${issueCount} issue${issueCount !== 1 ? 's' : ''} found`
                            : 'All checks passed'}
                          {analysis.length > issueCount && ` (${analysis.length - issueCount} info)`}
                        </Text>
                      </div>
                      <div className={styles.analysisList}>
                        {analysis.map((item) => {
                          const isExpanded = expandedAnalysis.has(item.id);
                          return (
                            <div key={item.id}>
                              <div
                                className={`${styles.analysisRow}${isExpanded ? ` ${styles.analysisRowExpanded}` : ''}`}
                                onClick={() => toggleAnalysis(item.id)}
                              >
                                {severityIcon(item.severity)}
                                <Text className={styles.analysisTitle}>{item.title}</Text>
                                <Badge appearance="tint" color={
                                  item.severity === 'critical' ? 'danger' :
                                  item.severity === 'warning' ? 'warning' : 'informative'
                                } size="small">
                                  {item.severity}
                                </Badge>
                              </div>
                              {isExpanded && (
                                <div className={styles.analysisRowDetail}>
                                  <Text className={styles.analysisDesc}>{item.description}</Text>
                                  {item.recommendation && (
                                    <Text className={styles.analysisRec}>💡 {item.recommendation}</Text>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Agent?"
        message={`Are you sure you want to delete "${displayName}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isDangerous
        onConfirm={() => {
          setConfirmDelete(false);
          void handleDelete();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
