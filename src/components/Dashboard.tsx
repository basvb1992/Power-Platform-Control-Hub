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
  CodeRegular,
  GlobeRegular,
} from '@fluentui/react-icons';
import type { Resource, ResourceCounts } from '../types/inventory.ts';
import { RESOURCE_TYPE_LABELS } from '../types/inventory.ts';

interface DashboardProps {
  resources: Resource[];
  counts: ResourceCounts | null;
  isLoading: boolean;
  error: string | null;
}

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
    cursor: 'default',
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
  table: {
    width: '100%',
    borderCollapse: 'collapse',
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
    label: 'Canvas Apps',
    icon: <GridRegular />,
  },
  {
    key: 'modelDrivenApps' as const,
    label: 'Model-Driven Apps',
    icon: <DatabaseRegular />,
  },
  {
    key: 'cloudFlows' as const,
    label: 'Cloud Flows',
    icon: <ArrowRepeatAllRegular />,
  },
  {
    key: 'agents' as const,
    label: 'Agents',
    icon: <BotRegular />,
  },
  {
    key: 'agentFlows' as const,
    label: 'Agent Flows',
    icon: <ArrowRepeatAllRegular />,
  },
  {
    key: 'codeApps' as const,
    label: 'Code Apps',
    icon: <CodeRegular />,
  },
];

export default function Dashboard({
  resources,
  counts,
  isLoading,
  error,
}: DashboardProps): ReactElement {
  const styles = useStyles();

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

  const recent = resources.slice(0, 15);

  return (
    <div className={styles.root}>
      <Text className={styles.sectionTitle}>Overview</Text>

      <div className={styles.cardsGrid}>
        {METRIC_ITEMS.map((item) => (
          <Card key={item.key} className={styles.metricCard}>
            <span className={styles.metricIcon}>{item.icon}</span>
            <Text className={styles.metricCount}>
              {counts ? String(counts[item.key]) : '—'}
            </Text>
            <Text className={styles.metricLabel}>{item.label}</Text>
          </Card>
        ))}
      </div>

      <Text className={styles.sectionTitle}>Recently Created</Text>

      <Card>
        <table className={styles.table}>
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
            {recent.length === 0 ? (
              <tr>
                <td className={styles.td} colSpan={5} style={{ textAlign: 'center', color: tokens.colorNeutralForeground3 }}>
                  No resources found
                </td>
              </tr>
            ) : (
              recent.map((r, i) => (
                <tr key={r.id ?? `${r.type}-${r.name}-${i}`}>
                  <td className={styles.td}>
                    {r.properties.displayName ?? r.name}
                  </td>
                  <td className={styles.td}>
                    <Badge appearance="outline" size="small">
                      {RESOURCE_TYPE_LABELS[r.type.toLowerCase()] ?? r.type}
                    </Badge>
                  </td>
                  <td className={styles.td}>{r.environmentName ?? '—'}</td>
                  <td className={styles.td}>
                    {r.environmentRegion ?? r.location ?? '—'}
                  </td>
                  <td className={styles.td}>
                    {r.properties.createdAt
                      ? new Date(r.properties.createdAt).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
