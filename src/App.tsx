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
import TabInfo from './components/TabInfo.tsx';
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

/** Short "what is this tab for" copy, shown in a collapsed explainer at the top of each
 *  main tab. The Copilot Studio tab is omitted here — its sub-tabs carry their own. */
const TAB_INFO: Partial<Record<TabValue, { title: string; body: ReactElement }>> = {
  overview: {
    title: 'What is the Overview?',
    body: <p>A tenant-wide summary of your Power Platform estate — environment, resource and connector counts at a glance. Select a card to drill into the matching resources.</p>,
  },
  environments: {
    title: 'What is the Environments tab?',
    body: <p>Every environment the signed-in admin can see, with type, region, Dataverse status and the group each belongs to. Use it to review and locate environments across the tenant.</p>,
  },
  envgroups: {
    title: 'What are Environment Groups?',
    body: <p>Environment groups and the rule-based policies assigned to them. Groups let you apply consistent governance (managed settings, rules) to sets of environments at once.</p>,
  },
  resources: {
    title: 'What is the Resources tab?',
    body: <p>A searchable inventory of Power Platform resources across the tenant — apps, flows, agents, connections and more. Filter by type to focus on a specific resource category.</p>,
  },
  connectors: {
    title: 'What is the Connectors tab?',
    body: <p>Connector usage across environments, so you can see which connectors (including premium ones) are in use and where. Useful for licensing and DLP review.</p>,
  },
  governance: {
    title: 'What are Tenant Policies?',
    body: <p>Tenant-level governance: DLP policies, billing policies and cross-tenant isolation reports. Review the guardrails that apply across your environments.</p>,
  },
  recommendations: {
    title: 'What are Recommendations?',
    body: <p>Advisor recommendations surfaced by the Power Platform admin APIs — actionable suggestions to improve security, performance and cost posture.</p>,
  },
  setup: {
    title: 'What is Setup?',
    body: <p>Verify and configure the connections this hub uses to read admin and inventory data. Start here if a tab reports a missing connection reference.</p>,
  },
};

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
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
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
          {activeTab !== 'copilotstudio' && TAB_INFO[activeTab] && (
            <TabInfo title={TAB_INFO[activeTab]!.title}>{TAB_INFO[activeTab]!.body}</TabInfo>
          )}
          <div className={styles.viewport}>
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
          </div>
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
