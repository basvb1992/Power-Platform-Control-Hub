import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Card,
  CardHeader,
  Badge,
  Input,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { SearchRegular, GlobeRegular, LockClosedRegular } from '@fluentui/react-icons';
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: tokens.spacingHorizontalL,
    overflowY: 'auto',
    flex: 1,
    paddingBottom: tokens.spacingVerticalL,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  cardMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    paddingBottom: tokens.spacingVerticalM,
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  badgeRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    paddingBottom: tokens.spacingVerticalM,
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
            const resourceCount =
              countByEnv.get(displayName.toLowerCase()) ?? 0;

            return (
              <Card key={e.id ?? `env-${e.name}-${i}`} className={styles.card}>
                <CardHeader
                  image={
                    <GlobeRegular
                      style={{
                        fontSize: '1.5rem',
                        color: tokens.colorBrandForeground1,
                      }}
                    />
                  }
                  header={
                    <Text style={{ fontWeight: tokens.fontWeightSemibold }}>
                      {displayName}
                    </Text>
                  }
                  description={
                    <Text
                      style={{
                        fontSize: tokens.fontSizeBase200,
                        color: tokens.colorNeutralForeground3,
                      }}
                    >
                      {region}
                    </Text>
                  }
                />

                <div className={styles.badgeRow}>
                  <Badge
                    appearance="filled"
                    color={envTypeColor(envType)}
                    size="small"
                  >
                    {envType}
                  </Badge>
                  {isManaged && (
                    <Badge
                      appearance="outline"
                      color="success"
                      size="small"
                      icon={<LockClosedRegular />}
                    >
                      Managed
                    </Badge>
                  )}
                </div>

                <div className={styles.cardMeta}>
                  <div className={styles.metaRow}>
                    <Text>Resources</Text>
                    <Text style={{ fontWeight: tokens.fontWeightSemibold }}>
                      {resourceCount}
                    </Text>
                  </div>
                  {e.properties.createdAt && (
                    <div className={styles.metaRow}>
                      <Text>Created</Text>
                      <Text>
                        {new Date(e.properties.createdAt as string).toLocaleDateString()}
                      </Text>
                    </div>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
