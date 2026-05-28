import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  Badge,
  Card,
  Input,
  MessageBar,
  MessageBarBody,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { InfoRegular, SearchRegular } from '@fluentui/react-icons';
import type { AdvisorRecommendation } from '../types/admin.ts';

interface RecommendationsViewProps {
  recommendations: AdvisorRecommendation[];
  isLoading: boolean;
  error: string | null;
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
    flexWrap: 'wrap',
    flexShrink: 0,
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: tokens.spacingHorizontalL,
    overflowY: 'auto',
    flex: 1,
    paddingBottom: tokens.spacingVerticalL,
    alignItems: 'start',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
  },
  scenario: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  metaLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  metaValue: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  centered: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  emptyState: {
    color: tokens.colorNeutralForeground3,
  },
});

function formatScenarioName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim();
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function RecommendationsView({
  recommendations,
  isLoading,
  error,
}: RecommendationsViewProps): ReactElement {
  const styles = useStyles();
  const [search, setSearch] = useState('');

  const filteredRecommendations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return recommendations;

    return recommendations.filter((recommendation) => (
      formatScenarioName(recommendation.scenario).toLowerCase().includes(term)
      || recommendation.scenario.toLowerCase().includes(term)
    ));
  }, [recommendations, search]);

  if (isLoading) {
    return (
      <div className={styles.centered}>
        <Spinner size="extra-large" label="Loading advisor recommendations…" />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <MessageBar intent="info">
        <MessageBarBody>
          <InfoRegular /> Note: Monitor.Alerts, Monitor.Metrics, Monitor.Recommendations,
          {' '}Security.Recommendations, CopilotGovernance permissions are registered but
          {' '}their API endpoints are not yet publicly available.
        </MessageBarBody>
      </MessageBar>

      <div className={styles.toolbar}>
        <Text className={styles.title}>Recommendations</Text>
        <Input
          placeholder="Search scenarios…"
          value={search}
          onChange={(_, data) => setSearch(data.value)}
          contentBefore={<SearchRegular />}
          size="small"
          style={{ minWidth: '220px' }}
        />
        <Text className={styles.count}>{filteredRecommendations.length} scenario(s)</Text>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.grid}>
        {filteredRecommendations.length === 0 ? (
          <Text className={styles.emptyState}>No advisor recommendations found.</Text>
        ) : (
          filteredRecommendations.map((recommendation) => (
            <Card key={recommendation.scenario} className={styles.card}>
              <Text className={styles.scenario}>{formatScenarioName(recommendation.scenario)}</Text>
              <Badge appearance="filled" color="brand" size="medium">
                {recommendation.details.resourceCount} resources
              </Badge>
              <div>
                <Text className={styles.metaLabel}>Last refreshed</Text>
                <Text className={styles.metaValue}>{formatDate(recommendation.details.lastRefreshedTimestamp)}</Text>
              </div>
              <div>
                <Text className={styles.metaLabel}>Next refresh</Text>
                <Text className={styles.metaValue}>{formatDate(recommendation.details.expectedNextRefreshTimestamp)}</Text>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
