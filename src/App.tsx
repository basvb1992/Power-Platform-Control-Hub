import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  FluentProvider,
  webLightTheme,
  makeStyles,
  tokens,
  Text,
  TabList,
  Tab,
  Button,
  Avatar,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  GridRegular,
  TableRegular,
  GlobeRegular,
  SignOutRegular,
  ArrowClockwiseRegular,
} from '@fluentui/react-icons';
import { useAuth } from './hooks/useAuth.ts';
import { useInventory } from './hooks/useInventory.ts';
import Dashboard from './components/Dashboard.tsx';
import ResourcesView from './components/ResourcesView.tsx';
import EnvironmentsView from './components/EnvironmentsView.tsx';

type TabValue = 'overview' | 'resources' | 'environments';

const useStyles = makeStyles({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    backgroundColor: tokens.colorNeutralBackground2,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL}`,
    backgroundColor: tokens.colorBrandBackground,
    boxShadow: tokens.shadow4,
    flexShrink: 0,
  },
  appTitle: {
    color: tokens.colorNeutralForegroundOnBrand,
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    marginRight: 'auto',
  },
  userName: {
    color: tokens.colorNeutralForegroundOnBrand,
    fontSize: tokens.fontSizeBase300,
  },
  nav: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: `0 ${tokens.spacingHorizontalXL}`,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  loginPage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: tokens.spacingVerticalXL,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  loginCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXXL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow16,
    maxWidth: '420px',
    width: '90%',
    textAlign: 'center',
  },
  loginTitle: {
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  loginSubtitle: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    lineHeight: tokens.lineHeightBase300,
  },
  setupCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalXL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow16,
    maxWidth: '520px',
    width: '90%',
  },
});

/** Shown when VITE_AZURE_CLIENT_ID is not configured. */
function ConfigRequiredScreen(): ReactElement {
  const styles = useStyles();
  return (
    <div className={styles.loginPage}>
      <div className={styles.setupCard}>
        <Text style={{ fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold }}>
          ⚙️ Configuration Required
        </Text>
        <Text style={{ fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground2 }}>
          Create a <code>.env</code> file in the project root with your Azure AD app registration details:
        </Text>
        <pre
          style={{
            background: tokens.colorNeutralBackground3,
            padding: '12px',
            borderRadius: tokens.borderRadiusMedium,
            fontSize: tokens.fontSizeBase200,
            overflowX: 'auto',
          }}
        >
          {`VITE_AZURE_CLIENT_ID=<your-client-id>\nVITE_AZURE_TENANT_ID=<your-tenant-id>`}
        </pre>
        <Text style={{ fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 }}>
          See <strong>README.md → Azure AD Setup</strong> for step-by-step instructions.
        </Text>
      </div>
    </div>
  );
}

export default function App(): ReactElement {
  const styles = useStyles();
  const [activeTab, setActiveTab] = useState<TabValue>('overview');

  const isConfigured = Boolean(import.meta.env.VITE_AZURE_CLIENT_ID);

  const {
    isAuthenticated,
    account,
    isLoading: authLoading,
    error: authError,
    login,
    logout,
    getToken,
  } = useAuth();

  const {
    resources,
    environments,
    counts,
    isLoading: dataLoading,
    error: dataError,
    refresh,
  } = useInventory({ isAuthenticated, getToken });

  // ── Not configured ───────────────────────────────────────────────────────────
  if (!isConfigured) {
    return (
      <FluentProvider theme={webLightTheme}>
        <ConfigRequiredScreen />
      </FluentProvider>
    );
  }

  // ── Auth initialising ────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <FluentProvider theme={webLightTheme}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
          }}
        >
          <Spinner size="extra-large" label="Initialising…" />
        </div>
      </FluentProvider>
    );
  }

  // ── Not signed in ────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <FluentProvider theme={webLightTheme}>
        <div className={styles.loginPage}>
          <div className={styles.loginCard}>
            <GridRegular
              style={{ fontSize: '3rem', color: tokens.colorBrandForeground1 }}
            />
            <Text className={styles.loginTitle}>CoE Dashboard</Text>
            <Text className={styles.loginSubtitle}>
              Sign in with your Power Platform admin account to view your
              organisation's full resource inventory.
            </Text>
            {authError && (
              <MessageBar intent="error" style={{ width: '100%', textAlign: 'left' }}>
                <MessageBarBody>{authError}</MessageBarBody>
              </MessageBar>
            )}
            <Button
              appearance="primary"
              size="large"
              style={{ width: '100%' }}
              onClick={() => void login()}
            >
              Sign in with Microsoft
            </Button>
          </div>
        </div>
      </FluentProvider>
    );
  }

  // ── Signed in ────────────────────────────────────────────────────────────────
  const displayName = account?.name ?? account?.username ?? 'User';

  return (
    <FluentProvider theme={webLightTheme}>
      <div className={styles.shell}>
        {/* Header */}
        <header className={styles.header}>
          <GridRegular
            style={{ fontSize: '1.5rem', color: tokens.colorNeutralForegroundOnBrand }}
          />
          <Text className={styles.appTitle}>CoE Dashboard</Text>

          {dataLoading && (
            <Spinner size="tiny" style={{ marginRight: tokens.spacingHorizontalS }} />
          )}
          <Button
            appearance="subtle"
            icon={<ArrowClockwiseRegular />}
            style={{ color: tokens.colorNeutralForegroundOnBrand }}
            onClick={() => void refresh()}
            title="Refresh data"
          />

          <Avatar name={displayName} size={28} color="brand" />
          <Text className={styles.userName}>{displayName}</Text>
          <Button
            appearance="subtle"
            icon={<SignOutRegular />}
            style={{ color: tokens.colorNeutralForegroundOnBrand }}
            onClick={() => void logout()}
            title="Sign out"
          />
        </header>

        {/* Navigation tabs */}
        <nav className={styles.nav}>
          <TabList
            selectedValue={activeTab}
            onTabSelect={(_, data) => setActiveTab(data.value as TabValue)}
          >
            <Tab value="overview" icon={<GridRegular />}>
              Overview
            </Tab>
            <Tab value="resources" icon={<TableRegular />}>
              Resources
            </Tab>
            <Tab value="environments" icon={<GlobeRegular />}>
              Environments
            </Tab>
          </TabList>
        </nav>

        {/* Content */}
        <main className={styles.content}>
          {activeTab === 'overview' && (
            <Dashboard
              resources={resources}
              counts={counts}
              isLoading={dataLoading}
              error={dataError}
            />
          )}
          {activeTab === 'resources' && (
            <ResourcesView
              resources={resources}
              isLoading={dataLoading}
              error={dataError}
              onRefresh={refresh}
            />
          )}
          {activeTab === 'environments' && (
            <EnvironmentsView
              environments={environments}
              resources={resources}
              isLoading={dataLoading}
              error={dataError}
            />
          )}
        </main>
      </div>
    </FluentProvider>
  );
}
