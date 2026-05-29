import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { extractMessage } from '../utils/errorUtils.ts';
import {
  GridRegular,
  DatabaseRegular,
  ArrowRepeatAllRegular,
  BotRegular,
  BoxRegular,
  CodeRegular,
  SettingsRegular,
  ArrowSortUpRegular,
  ArrowSortDownRegular,
  ArrowSortRegular,
} from '@fluentui/react-icons';
import type { Resource, ResourceCounts } from '../types/inventory.ts';
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPE_SHORT_LABELS, getTypeBadgeColor } from '../types/inventory.ts';

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
    height: '100%',
    overflow: 'hidden',
  },
  scrollable: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  topSection: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXL,
    padding: `${tokens.spacingHorizontalXL} ${tokens.spacingHorizontalXL} 0`,
    '@media (max-width: 768px)': {
      padding: `${tokens.spacingHorizontalM} ${tokens.spacingHorizontalM} 0`,
    },
  },
  tableSection: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL} ${tokens.spacingHorizontalXL}`,
    '@media (max-width: 768px)': {
      padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingHorizontalM}`,
    },
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
    '@media (max-width: 480px)': {
      gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
      gap: tokens.spacingHorizontalS,
    },
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
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    overflowX: 'auto',
    overflowY: 'auto',
    padding: '0',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
    minWidth: '580px',
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
  thSortable: {
    cursor: 'pointer',
    userSelect: 'none',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground3Hover,
      color: tokens.colorNeutralForeground2,
    },
  },
  thInner: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
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
  tdLast: {
    borderBottom: 'none',
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

  type SortCol = 'name' | 'type' | 'environment' | 'region' | 'created';
  const [sortCol, setSortCol] = useState<SortCol>('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (col: SortCol) => {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'created' ? 'desc' : 'asc');
    }
  };

  const sortedResources = useMemo(() => {
    const arr = [...resources];
    arr.sort((a, b) => {
      let av = '';
      let bv = '';
      switch (sortCol) {
        case 'name':
          av = a.properties.displayName ?? a.name;
          bv = b.properties.displayName ?? b.name;
          break;
        case 'type':
          av = RESOURCE_TYPE_LABELS[a.type.toLowerCase()] ?? a.type;
          bv = RESOURCE_TYPE_LABELS[b.type.toLowerCase()] ?? b.type;
          break;
        case 'environment':
          av = a.environmentName ?? '';
          bv = b.environmentName ?? '';
          break;
        case 'region':
          av = a.environmentRegion ?? a.location ?? '';
          bv = b.environmentRegion ?? b.location ?? '';
          break;
        case 'created':
          av = a.properties.createdAt ?? '';
          bv = b.properties.createdAt ?? '';
          break;
      }
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [resources, sortCol, sortDir]);

  // Reset pagination when resources change (e.g. refresh)
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [resources]);

  // Lazy-load more rows when sentinel scrolls into view
  const loadMore = useCallback(() => {
    setVisibleCount((n) => Math.min(n + PAGE_SIZE, sortedResources.length));
  }, [sortedResources.length]);

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
          <MessageBarBody>{extractMessage(error)}</MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  const visible = sortedResources.slice(0, visibleCount);
  const hasMore = visibleCount < sortedResources.length;

  return (
    <div className={styles.root}>
      <div className={styles.scrollable}>
        <div className={styles.topSection}>
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
        </div>

        <div className={styles.tableSection}>
          <Text className={styles.sectionTitle}>Recently Created</Text>

          <Card className={styles.tableCard}>
        <table className={styles.table}>
          <colgroup>
            <col style={{ width: '28%' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
          </colgroup>
          <thead>
            <tr>
              {([ 
                { col: 'name' as const, label: 'Name' },
                { col: 'type' as const, label: 'Type' },
                { col: 'environment' as const, label: 'Environment' },
                { col: 'region' as const, label: 'Region' },
                { col: 'created' as const, label: 'Created' },
              ]).map(({ col, label }) => (
                <th
                  key={col}
                  className={`${styles.th} ${styles.thSortable}`}
                  onClick={() => handleSort(col)}
                >
                  <span className={styles.thInner}>
                    {label}
                    {sortCol === col
                      ? sortDir === 'asc' ? <ArrowSortUpRegular fontSize={12} /> : <ArrowSortDownRegular fontSize={12} />
                      : <ArrowSortRegular fontSize={12} style={{ opacity: 0.3 }} />}
                  </span>
                </th>
              ))}
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
                  const isLast = i === visible.length - 1 && !hasMore;
                  const tdClass = isLast ? `${styles.td} ${styles.tdLast}` : styles.td;
                  return (
                    <tr key={r.id ?? `${r.type}-${r.name}-${i}`}>
                      <td className={tdClass} title={name}>{name}</td>
                      <td className={tdClass}>
                        <Badge
                          appearance="tint"
                          color={getTypeBadgeColor(r.type.toLowerCase())}
                          size="small"
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          {RESOURCE_TYPE_SHORT_LABELS[r.type.toLowerCase()] ?? RESOURCE_TYPE_LABELS[r.type.toLowerCase()] ?? r.type}
                        </Badge>
                      </td>
                      <td className={tdClass} title={!r.environmentName ? 'Environment not available in API for this resource type' : r.environmentName}>
                        {r.environmentName ?? <span style={{ color: tokens.colorNeutralForeground4 }}>Not available</span>}
                      </td>
                      <td className={tdClass}>{r.environmentRegion ?? r.location ?? '—'}</td>
                      <td className={tdClass}>
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
      </div>
    </div>
  );
}
