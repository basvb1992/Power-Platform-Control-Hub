import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import type { ReactElement } from 'react';
import {
  FluentProvider,
  Toaster,
  webLightTheme,
  webDarkTheme,
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
  WeatherMoonRegular,
  WeatherSunnyRegular,
  LayerRegular,
  BotRegular,
  SettingsRegular,
} from '@fluentui/react-icons';
import { useAdminData } from './hooks/useAdminData.ts';
import { useInventory } from './hooks/useInventory.ts';
const Dashboard = lazy(() => import('./components/Dashboard.tsx'));
const ResourcesView = lazy(() => import('./components/ResourcesView.tsx'));
const EnvironmentsView = lazy(() => import('./components/EnvironmentsView.tsx'));
const RecommendationsView = lazy(() => import('./components/RecommendationsView.tsx'));
const GovernanceView = lazy(() => import('./components/GovernanceView.tsx'));
const EnvironmentGroupsView = lazy(() => import('./components/EnvironmentGroupsView.tsx'));
const ConnectorsView = lazy(() => import('./components/ConnectorsView.tsx'));
const CopilotStudioHub = lazy(() => import('./copilot-studio/CopilotStudioHub.tsx'));
const SetupView = lazy(() => import('./components/SetupView.tsx'));
import ppaLogo from './assets/ppa-logo.png?inline';

type TabValue = 'overview' | 'resources' | 'environments' | 'recommendations' | 'governance' | 'envgroups' | 'connectors' | 'copilotstudio' | 'setup';
const VALID_TABS: readonly TabValue[] = ['overview', 'resources', 'environments', 'recommendations', 'governance', 'envgroups', 'connectors', 'copilotstudio', 'setup'];

const useStyles = makeStyles({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    backgroundColor: tokens.colorNeutralBackground2,
    overflow: 'hidden',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: `0 ${tokens.spacingHorizontalL}`,
    flexShrink: 0,
    gap: tokens.spacingHorizontalS,
  },
  navTabs: {
    flex: 1,
    minWidth: 0,
    overflowX: 'auto',
    scrollbarWidth: 'thin',
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  suspense: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  footer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalL}`,
    backgroundColor: tokens.colorNeutralBackground2,
    flexShrink: 0,
  },
  footerLogo: {
    height: '16px',
    width: 'auto',
  },
  footerText: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
});

export default function App(): ReactElement {
  const styles = useStyles();
  const [activeTab, setActiveTab] = useState<TabValue>('overview');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>('all');
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');

  // Keep the Copilot Studio hub's theme.css (html[data-theme]) in sync with Fluent.
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }, [isDark]);

  function navigateToResources(typeKey: string) {
    setResourceTypeFilter(typeKey);
    setActiveTab('resources');
  }

  const {
    resources,
    environments,
    counts,
    isLoading: dataLoading,
    loadingLabel,
    error: dataError,
    refresh,
  } = useInventory();

  const {
    recommendations,
    envGroups,
    billingPolicies,
    crossTenantReports,
    ruleBasedPolicies,
    ruleAssignments,
    ruleSets,
    dlpPolicies,
    isLoading: adminLoading,
    error: adminError,
    refresh: refreshAdmin,
  } = useAdminData();

  async function refreshAll(): Promise<void> {
    await Promise.all([refresh(), refreshAdmin()]);
  }

  // One-shot: jump to Setup if connections are missing on first load.
  const setupShown = useRef(false);
  useEffect(() => {
    if (setupShown.current) return;
    const err = dataError ?? adminError;
    if (err && /connection reference not found/i.test(err)) {
      setupShown.current = true;
      setActiveTab('setup');
    }
  }, [dataError, adminError]);

  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme}>
      <div className={styles.shell}>
        <nav className={styles.nav}>
          <div className={styles.navTabs}>
            <TabList
              selectedValue={activeTab}
              onTabSelect={(_, data) => {
                const tab = data.value as string;
                if (!VALID_TABS.includes(tab as TabValue)) return;
                if (tab === 'resources') setResourceTypeFilter('all');
                setActiveTab(tab as TabValue);
              }}
            >
              <Tab value="overview" icon={<GridRegular />}>Overview</Tab>
              <Tab value="environments" icon={<GlobeRegular />}>Environments</Tab>
              <Tab value="envgroups" icon={<LayerRegular />}>Environment Groups</Tab>
              <Tab value="resources" icon={<TableRegular />}>Resources</Tab>
              <Tab value="connectors" icon={<PlugConnectedRegular />}>Connectors</Tab>
              <Tab value="copilotstudio" icon={<BotRegular />}>Copilot Studio</Tab>
              <Tab value="governance" icon={<ShieldRegular />}>Tenant Policies</Tab>
              <Tab value="recommendations" icon={<LightbulbRegular />}>Recommendations</Tab>
              <Tab value="setup" icon={<SettingsRegular />}>Setup</Tab>
            </TabList>
          </div>
          <div className={styles.navRight}>
            {(dataLoading || adminLoading) && (
              <Spinner size="tiny" title={loadingLabel ?? 'Loading…'} />
            )}
            <Button
              appearance="subtle"
              icon={isDark ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
              onClick={() => setIsDark((d) => { localStorage.setItem('theme', d ? 'light' : 'dark'); return !d; })}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            />
            <Button
              appearance="subtle"
              icon={<ArrowClockwiseRegular />}
              onClick={() => void refreshAll()}
              title="Refresh data"
            />
          </div>
        </nav>

        <main className={styles.content}>
          <Suspense fallback={<div className={styles.suspense}><Spinner size="medium" label="Loading view…" /></div>}>
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
              envGroups={envGroups}
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
              billingPolicies={billingPolicies}
              crossTenantReports={crossTenantReports}
              dlpPolicies={dlpPolicies}
              environments={environments}
              resources={resources}
              isLoading={adminLoading}
              error={adminError}
              onRefreshAdmin={refreshAdmin}
            />
          )}
          {activeTab === 'envgroups' && (
            <EnvironmentGroupsView
              environments={environments}
              envGroups={envGroups}
              ruleBasedPolicies={ruleBasedPolicies}
              ruleAssignments={ruleAssignments}
              ruleSets={ruleSets}
              isLoading={adminLoading}
              error={adminError}
              onRefreshAdmin={refreshAdmin}
            />
          )}
          {activeTab === 'connectors' && (
            <ConnectorsView environments={environments} />
          )}
          {activeTab === 'copilotstudio' && (
            <CopilotStudioHub environments={environments} />
          )}
          {activeTab === 'setup' && (
            <SetupView
              connected={!dataError && !adminError && resources.length > 0}
              error={dataError ?? adminError}
              onRefresh={refreshAll}
            />
          )}
          </Suspense>
        </main>

        <footer className={styles.footer}>
          <Text className={styles.footerText}>Made with ❤️ by the Power Platform Advocates</Text>
          <img src={ppaLogo} alt="Power Platform Advocates" className={styles.footerLogo} />
          <Text className={styles.footerText}>· Fork customized by Bas van Breda</Text>
        </footer>
      </div>
      <Toaster toasterId="coe-toaster" />
    </FluentProvider>
  );
}
