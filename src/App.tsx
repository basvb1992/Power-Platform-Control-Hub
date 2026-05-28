import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  FluentProvider,
  Toaster,
  webLightTheme,
  makeStyles,
  tokens,
  Text,
  TabList,
  Tab,
  Button,
  Spinner,
} from '@fluentui/react-components';
import {
  TableRegular,
  GlobeRegular,
  ArrowClockwiseRegular,
  LightbulbRegular,
  ShieldRegular,
  PlugConnectedRegular,
  GridRegular,
} from '@fluentui/react-icons';
import { useAdminData } from './hooks/useAdminData.ts';
import { useInventory } from './hooks/useInventory.ts';
import Dashboard from './components/Dashboard.tsx';
import ResourcesView from './components/ResourcesView.tsx';
import EnvironmentsView from './components/EnvironmentsView.tsx';
import RecommendationsView from './components/RecommendationsView.tsx';
import GovernanceView from './components/GovernanceView.tsx';
import ConnectorsView from './components/ConnectorsView.tsx';
import ppaLogo from './assets/ppa-logo.png';

type TabValue = 'overview' | 'resources' | 'environments' | 'recommendations' | 'governance' | 'connectors';

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
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalXL}`,
    backgroundColor: tokens.colorBrandBackground,
    boxShadow: tokens.shadow4,
    flexShrink: 0,
  },
  headerLogo: {
    height: '32px',
    width: 'auto',
    borderRadius: tokens.borderRadiusSmall,
    flexShrink: 0,
  },
  headerDivider: {
    width: '1px',
    height: '24px',
    backgroundColor: 'rgba(255,255,255,0.3)',
    flexShrink: 0,
  },
  appTitle: {
    color: tokens.colorNeutralForegroundOnBrand,
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    flex: 1,
  },
  headerCredit: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: 'rgba(255,255,255,0.7)',
    fontSize: tokens.fontSizeBase100,
    whiteSpace: 'nowrap',
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
});

export default function App(): ReactElement {
  const styles = useStyles();
  const [activeTab, setActiveTab] = useState<TabValue>('overview');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>('all');

  function navigateToResources(typeKey: string) {
    setResourceTypeFilter(typeKey);
    setActiveTab('resources');
  }

  const {
    resources,
    environments,
    counts,
    isLoading: dataLoading,
    error: dataError,
    refresh,
  } = useInventory();

  const {
    recommendations,
    roleAssignments,
    envGroups,
    billingPolicies,
    crossTenantReports,
    isLoading: adminLoading,
    error: adminError,
    refresh: refreshAdmin,
  } = useAdminData();

  async function refreshAll(): Promise<void> {
    await Promise.all([refresh(), refreshAdmin()]);
  }

  return (
    <FluentProvider theme={webLightTheme}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <img src={ppaLogo} alt="Power Platform Advocates" className={styles.headerLogo} />
          <div className={styles.headerDivider} />
          <Text className={styles.appTitle}>{__APP_DISPLAY_NAME__}</Text>
          {(dataLoading || adminLoading) && (
            <Spinner size="tiny" style={{ marginRight: tokens.spacingHorizontalS }} />
          )}
          <Text className={styles.headerCredit}>by Power Platform Advocates</Text>
          <Button
            appearance="subtle"
            icon={<ArrowClockwiseRegular />}
            style={{ color: tokens.colorNeutralForegroundOnBrand }}
            onClick={() => void refreshAll()}
            title="Refresh data"
          />
        </header>

        <nav className={styles.nav}>
          <TabList
            selectedValue={activeTab}
            onTabSelect={(_, data) => {
              const tab = data.value as TabValue;
              if (tab === 'resources') setResourceTypeFilter('all');
              setActiveTab(tab);
            }}
          >
            <Tab value="overview" icon={<GridRegular />}>Overview</Tab>
            <Tab value="resources" icon={<TableRegular />}>Resources</Tab>
            <Tab value="environments" icon={<GlobeRegular />}>Environments</Tab>
            <Tab value="recommendations" icon={<LightbulbRegular />}>Recommendations</Tab>
            <Tab value="governance" icon={<ShieldRegular />}>Governance</Tab>
            <Tab value="connectors" icon={<PlugConnectedRegular />}>Connectors</Tab>
          </TabList>
        </nav>

        <main className={styles.content}>
          {activeTab === 'overview' && (
            <Dashboard
              resources={resources}
              counts={counts}
              isLoading={dataLoading}
              error={dataError}
              onNavigateToResources={navigateToResources}
            />
          )}
          {activeTab === 'resources' && (
            <ResourcesView
              resources={resources}
              isLoading={dataLoading}
              error={dataError}
              onRefresh={refresh}
              initialTypeFilter={resourceTypeFilter}
            />
          )}
          {activeTab === 'environments' && (
            <EnvironmentsView
              environments={environments}
              resources={resources}
              isLoading={dataLoading}
              error={dataError}
              onRefreshEnvironments={refresh}
            />
          )}
          {activeTab === 'recommendations' && (
            <RecommendationsView
              recommendations={recommendations}
              isLoading={adminLoading}
              error={adminError}
            />
          )}
          {activeTab === 'governance' && (
            <GovernanceView
              roleAssignments={roleAssignments}
              envGroups={envGroups}
              billingPolicies={billingPolicies}
              crossTenantReports={crossTenantReports}
              isLoading={adminLoading}
              error={adminError}
              onRefreshAdmin={refreshAdmin}
            />
          )}
          {activeTab === 'connectors' && (
            <ConnectorsView environments={environments} />
          )}
        </main>
      </div>
      <Toaster toasterId="coe-toaster" />
    </FluentProvider>
  );
}