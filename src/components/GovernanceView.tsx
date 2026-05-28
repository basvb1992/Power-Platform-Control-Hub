import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  Badge,
  Card,
  MessageBar,
  MessageBarBody,
  Spinner,
  Tab,
  TabList,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { PeopleRegular, ShieldRegular } from '@fluentui/react-icons';
import type {
  BillingPolicy,
  CrossTenantReport,
  EnvironmentGroup,
  RoleAssignment,
} from '../types/admin.ts';

interface GovernanceViewProps {
  roleAssignments: RoleAssignment[];
  envGroups: EnvironmentGroup[];
  billingPolicies: BillingPolicy[];
  crossTenantReports: CrossTenantReport[];
  isLoading: boolean;
  error: string | null;
}

type GovernanceTab = 'environmentGroups' | 'billingPolicies' | 'crossTenantReports';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXL,
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginRight: 'auto',
  },
  title: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  metricCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
    minWidth: '220px',
  },
  metricLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
  },
  metricValue: {
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightBold,
    lineHeight: tokens.lineHeightHero700,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minHeight: 0,
    flex: 1,
  },
  tableWrapper: {
    flex: 1,
    overflowY: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
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
    whiteSpace: 'nowrap',
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

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getBillingBadgeColor(status: BillingPolicy['status']): 'success' | 'warning' {
  return status === 'Enabled' ? 'success' : 'warning';
}

function getReportBadgeColor(
  status: CrossTenantReport['status'],
): 'success' | 'informative' | 'danger' | 'subtle' {
  switch (status) {
    case 'Completed':
      return 'success';
    case 'InProgress':
      return 'informative';
    case 'Failed':
      return 'danger';
    case 'Received':
    default:
      return 'subtle';
  }
}

function renderEnvironmentGroupsTable(
  styles: ReturnType<typeof useStyles>,
  envGroups: EnvironmentGroup[],
): ReactElement {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Display Name</th>
            <th className={styles.th}>Description</th>
            <th className={styles.th}>Created By</th>
            <th className={styles.th}>Created Time</th>
            <th className={styles.th}>Child Count</th>
          </tr>
        </thead>
        <tbody>
          {envGroups.length === 0 ? (
            <tr>
              <td className={styles.td} colSpan={5} style={{ textAlign: 'center' }}>
                No environment groups found.
              </td>
            </tr>
          ) : (
            envGroups.map((group) => (
              <tr key={group.id}>
                <td className={styles.td}>{group.displayName}</td>
                <td className={styles.td}>{group.description || '—'}</td>
                <td className={styles.td}>{group.createdBy.displayName ?? group.createdBy.email ?? group.createdBy.id}</td>
                <td className={styles.td}>{formatDate(group.createdTime)}</td>
                <td className={styles.td}>{group.childrenGroupIds?.length ?? 0}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function renderBillingPoliciesTable(
  styles: ReturnType<typeof useStyles>,
  billingPolicies: BillingPolicy[],
): ReactElement {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Name</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Location</th>
            <th className={styles.th}>Subscription ID</th>
            <th className={styles.th}>Created On</th>
          </tr>
        </thead>
        <tbody>
          {billingPolicies.length === 0 ? (
            <tr>
              <td className={styles.td} colSpan={5} style={{ textAlign: 'center' }}>
                No billing policies found.
              </td>
            </tr>
          ) : (
            billingPolicies.map((policy) => (
              <tr key={policy.id}>
                <td className={styles.td}>{policy.name}</td>
                <td className={styles.td}>
                  <Badge appearance="filled" color={getBillingBadgeColor(policy.status)}>
                    {policy.status}
                  </Badge>
                </td>
                <td className={styles.td}>{policy.location}</td>
                <td className={styles.td}>{policy.billingInstrument.subscriptionId}</td>
                <td className={styles.td}>{formatDate(policy.createdOn)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function renderCrossTenantReportsTable(
  styles: ReturnType<typeof useStyles>,
  crossTenantReports: CrossTenantReport[],
): ReactElement {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Report ID</th>
            <th className={styles.th}>Request Date</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Inbound</th>
            <th className={styles.th}>Outbound</th>
          </tr>
        </thead>
        <tbody>
          {crossTenantReports.length === 0 ? (
            <tr>
              <td className={styles.td} colSpan={5} style={{ textAlign: 'center' }}>
                No cross-tenant reports found.
              </td>
            </tr>
          ) : (
            crossTenantReports.map((report) => {
              const inboundCount = report.status === 'Completed'
                ? report.connections?.filter((connection) => connection.connectionType === 'Inbound').length ?? 0
                : null;
              const outboundCount = report.status === 'Completed'
                ? report.connections?.filter((connection) => connection.connectionType === 'Outbound').length ?? 0
                : null;

              return (
                <tr key={report.reportId}>
                  <td className={styles.td}>{report.reportId}</td>
                  <td className={styles.td}>{formatDate(report.requestDate)}</td>
                  <td className={styles.td}>
                    <Badge appearance="filled" color={getReportBadgeColor(report.status)}>
                      {report.status}
                    </Badge>
                  </td>
                  <td className={styles.td}>{inboundCount ?? '—'}</td>
                  <td className={styles.td}>{outboundCount ?? '—'}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function GovernanceView({
  roleAssignments,
  envGroups,
  billingPolicies,
  crossTenantReports,
  isLoading,
  error,
}: GovernanceViewProps): ReactElement {
  const styles = useStyles();
  const [activeTab, setActiveTab] = useState<GovernanceTab>('environmentGroups');

  const content = useMemo(() => {
    if (isLoading) {
      return (
        <div className={styles.centered}>
          <Spinner size="extra-large" label="Loading governance data…" />
        </div>
      );
    }

    if (error) {
      return (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      );
    }

    switch (activeTab) {
      case 'billingPolicies':
        return renderBillingPoliciesTable(styles, billingPolicies);
      case 'crossTenantReports':
        return renderCrossTenantReportsTable(styles, crossTenantReports);
      case 'environmentGroups':
      default:
        return renderEnvironmentGroupsTable(styles, envGroups);
    }
  }, [activeTab, billingPolicies, crossTenantReports, envGroups, error, isLoading, styles]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <Text className={styles.title}>Governance</Text>
          <Text className={styles.subtitle}>Tenant-wide governance and authorization insights.</Text>
        </div>

        <Card className={styles.metricCard}>
          <Text className={styles.metricLabel}>
            <PeopleRegular /> Tenant role assignments
          </Text>
          <Text className={styles.metricValue}>{roleAssignments.length}</Text>
        </Card>
      </div>

      <div className={styles.body}>
        <TabList
          selectedValue={activeTab}
          onTabSelect={(_, data) => setActiveTab(data.value as GovernanceTab)}
        >
          <Tab value="environmentGroups" icon={<ShieldRegular />}>
            Environment Groups
          </Tab>
          <Tab value="billingPolicies">Billing Policies</Tab>
          <Tab value="crossTenantReports">Cross-Tenant Reports</Tab>
        </TabList>

        {content}
      </div>
    </div>
  );
}
