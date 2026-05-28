import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Card,
  Badge,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  GridRegular,
  DatabaseRegular,
  ArrowRepeatAllRegular,
  BotRegular,
  BoxRegular,
  CodeRegular,
  SettingsRegular,
} from '@fluentui/react-icons';
import type { Resource, ResourceCounts } from '../types/inventory.ts';
import { RESOURCE_TYPE_LABELS } from '../types/inventory.ts';

interface DashboardProps {
  resources: Resource[];
  counts: ResourceCounts | null;
  isLoading: boolean;
  error: string | null;
  onNavigateToResources: (typeKey: string) => void;
}

const PAGE_SIZE = 25;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXL,
    padding: tokens.spacingHorizontalXL,
    overflowY: 'auto',
    height: '100%',
  },
  sectionTitle: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: tokens.spacingHorizontalL,
  },
  metricCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalL}`,
    textAlign: 'center',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  metricIcon: {
    fontSize: '2rem',
    color: tokens.colorBrandForeground1,
    lineHeight: '1',
  },
  metricCount: {
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightBold,
    lineHeight: tokens.lineHeightHero700,
    color: tokens.colorNeutralForeground1,
  },
  metricLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  tableCard: {
    overflow: 'hidden',
    padding: '0',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
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
  },
  td: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: 'middle',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  sentinel: {
    height: '1px',
  },
  loadingMore: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalM,
  },
  centered: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
});

const METRIC_ITEMS = [
  {
    key: 'canvasApps' as const,
    typeKey: 'microsoft.powerapps/canvasapps',
    label: 'Canvas Apps',
    icon: <GridRegular />,
  },
  {
    key: 'modelDrivenApps' as const,
    typeKey: 'microsoft.powerapps/modeldrivenapps',
    label: 'Model-Driven Apps',
    icon: <DatabaseRegular />,
  },
  {
    key: 'cloudFlows' as const,
    typeKey: 'microsoft.powerautomate/cloudflows',
    label: 'Cloud Flows',
    icon: <ArrowRepeatAllRegular />,
  },
  {
    key: 'agents' as const,
    typeKey: 'microsoft.copilotstudio/agents',
    label: 'Agents',
    icon: <BotRegular />,
  },
  {
    key: 'agentFlows' as const,
    typeKey: 'microsoft.powerautomate/agentflows',
    label: 'Agent Flows',
    icon: <ArrowRepeatAllRegular />,
  },
  {
    key: 'appBuilderApps' as const,
    typeKey: 'microsoft.powerapps/apps',
    label: 'App Builder Apps',
    icon: <BoxRegular />,
  },
  {
    key: 'm365AgentFlows' as const,
    typeKey: 'microsoft.powerautomate/m365agentflows',
    label: 'M365 Agent Flows',
    icon: <SettingsRegular />,
  },
  {
    key: 'codeApps' as const,
    typeKey: 'microsoft.powerapps/codeapps',
    label: 'Code Apps',
    icon: <CodeRegular />,
  },
];

export default function Dashboard({
  resources,
  counts,
  isLoading,
  error,
  onNavigateToResources,
}: DashboardProps): ReactElement {
  const styles = useStyles();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  // Reset pagination when resources change (e.g. refresh)
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [resources]);

  // Lazy-load more rows when sentinel scrolls into view
  const loadMore = useCallback(() => {
    setVisibleCount((n) => Math.min(n + PAGE_SIZE, resources.length));
  }, [resources.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore(); },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  if (isLoading) {
    return (
      <div className={styles.centered}>
        <Spinner size="extra-large" label="Loading Power Platform inventory…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.root}>
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  const visible = resources.slice(0, visibleCount);
  const hasMore = visibleCount < resources.length;

  return (
    <div className={styles.root}>
      <Text className={styles.sectionTitle}>Overview</Text>

      <div className={styles.cardsGrid}>
        {METRIC_ITEMS.map((item) => (
          <Card
            key={item.key}
            className={styles.metricCard}
            onClick={() => onNavigateToResources(item.typeKey)}
            title={`View all ${item.label}`}
          >
            <span className={styles.metricIcon}>{item.icon}</span>
            <Text className={styles.metricCount}>
              {counts ? String(counts[item.key]) : '—'}
            </Text>
            <Text className={styles.metricLabel}>{item.label}</Text>
          </Card>
        ))}
      </div>

      <Text className={styles.sectionTitle}>Recently Created</Text>

      <Card className={styles.tableCard}>
        <table className={styles.table}>
          <colgroup>
            <col style={{ width: '30%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className={styles.th}>Name</th>
              <th className={styles.th}>Type</th>
              <th className={styles.th}>Environment</th>
              <th className={styles.th}>Region</th>
              <th className={styles.th}>Created</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className={styles.td} colSpan={5} style={{ textAlign: 'center', color: tokens.colorNeutralForeground3 }}>
                  No resources found
                </td>
              </tr>
            ) : (
              <>
                {visible.map((r, i) => {
                  const name = r.properties.displayName ?? r.name;
                  return (
                    <tr key={r.id ?? `${r.type}-${r.name}-${i}`}>
                      <td className={styles.td} title={name}>{name}</td>
                      <td className={styles.td}>
                        <Badge appearance="outline" size="small">
                          {RESOURCE_TYPE_LABELS[r.type.toLowerCase()] ?? r.type}
                        </Badge>
                      </td>
                      <td className={styles.td} title={r.environmentName ?? undefined}>
                        {r.environmentName ?? '—'}
                      </td>
                      <td className={styles.td}>{r.environmentRegion ?? r.location ?? '—'}</td>
                      <td className={styles.td}>
                        {r.properties.createdAt
                          ? new Date(r.properties.createdAt).toLocaleDateString()
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
                {hasMore && (
                  <tr ref={sentinelRef} className={styles.sentinel}>
                    <td colSpan={5}>
                      <div className={styles.loadingMore}>
                        <Spinner size="tiny" label={`Loading more… (${visibleCount} / ${resources.length})`} />
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
