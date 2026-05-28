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
} from '@fluentui/react-components';
import { SearchRegular, GlobeRegular, LockClosedRegular, AppsListRegular, BoxRegular } from '@fluentui/react-icons';
import type { Resource } from '../types/inventory.ts';

interface EnvironmentsViewProps {
  environments: Resource[];
  resources: Resource[];
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: tokens.spacingHorizontalL,
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
  },
  cardTop: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
  },
  cardIcon: {
    fontSize: '1.5rem',
    color: tokens.colorBrandForeground1,
    flexShrink: 0,
    marginTop: '2px',
  },
  cardTitles: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
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

export default function EnvironmentsView({
  environments,
  resources,
  isLoading,
  error,
}: EnvironmentsViewProps): ReactElement {
  const styles = useStyles();
  const [search, setSearch] = useState('');

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

            return (
              <Card key={e.id ?? `env-${e.name}-${i}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <GlobeRegular className={styles.cardIcon} />
                  <div className={styles.cardTitles}>
                    <Text className={styles.cardName} title={displayName}>{displayName}</Text>
                    <Text className={styles.cardRegion}>{region}</Text>
                  </div>
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
    </div>
  );
}
