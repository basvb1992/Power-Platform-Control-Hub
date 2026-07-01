import type { ReactElement } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Title2,
  Subtitle2,
  Body1,
  Button,
  Badge,
  Card,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components';
import {
  CheckmarkCircleFilled,
  ErrorCircleFilled,
  OpenRegular,
  ArrowClockwiseRegular,
  PlugConnectedRegular,
} from '@fluentui/react-icons';

/** Connectors the app depends on. Display names mirror the maker-portal connection picker. */
const REQUIRED_CONNECTORS = [
  { name: 'Power Platform for Admins V2', api: 'shared_powerplatformadminv2', purpose: 'Tenant inventory, environments, resources' },
  { name: 'Power Platform for Admins', api: 'shared_powerplatformforadmins', purpose: 'Environments & DLP policies' },
  { name: 'Power Apps for Admins', api: 'shared_powerappsforadmins', purpose: 'Canvas & code app metadata' },
  { name: 'Power Automate Management', api: 'shared_flowmanagement', purpose: 'Cloud & agent flow metadata' },
  { name: 'Microsoft Dataverse', api: 'shared_commondataserviceforapps', purpose: 'Copilot Studio agents, transcripts, costs' },
] as const;

const useStyles = makeStyles({
  root: { height: '100%', overflow: 'auto', padding: tokens.spacingHorizontalXXL, boxSizing: 'border-box' },
  inner: { maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  head: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  grid: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  card: { padding: tokens.spacingHorizontalL, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacingHorizontalM },
  cardText: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  name: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  purpose: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  steps: { margin: 0, paddingLeft: tokens.spacingHorizontalXL, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, color: tokens.colorNeutralForeground2 },
});

export interface SetupViewProps {
  connected: boolean;
  error: string | null;
  onRefresh: () => Promise<void> | void;
}

const CONNECTIONS_URL = 'https://make.powerapps.com/connections';

export default function SetupView({ connected, error, onRefresh }: SetupViewProps): ReactElement {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <div className={styles.inner}>
        <div className={styles.head}>
          <Title2>Setup &amp; connections</Title2>
          <Body1 className={styles.purpose}>
            This app reads tenant-wide data through the connectors below. Create or switch their connections
            in the maker portal, then return and refresh. You only need to do this once per user.
          </Body1>
        </div>

        {connected ? (
          <MessageBar intent="success">
            <MessageBarBody>
              <MessageBarTitle>All connected.</MessageBarTitle>
              The app is loading live data. Use this page later to switch or update connections.
            </MessageBarBody>
          </MessageBar>
        ) : (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>Connections needed.</MessageBarTitle>
              One or more connectors are not connected yet{error ? ` (${error})` : ''}. Create the connections
              below, then refresh.
            </MessageBarBody>
          </MessageBar>
        )}

        <div className={styles.grid}>
          {REQUIRED_CONNECTORS.map((c) => (
            <Card key={c.api} className={styles.card}>
              <div className={styles.cardText}>
                <span className={styles.name}>
                  <PlugConnectedRegular />
                  <Text weight="semibold">{c.name}</Text>
                </span>
                <span className={styles.purpose}>{c.purpose}</span>
              </div>
              <Badge
                appearance="tint"
                color={connected ? 'success' : 'warning'}
                icon={connected ? <CheckmarkCircleFilled /> : <ErrorCircleFilled />}
              >
                {connected ? 'Connected' : 'Not connected'}
              </Badge>
            </Card>
          ))}
        </div>

        <div className={styles.actions}>
          <Button appearance="primary" icon={<OpenRegular />} as="a" href={CONNECTIONS_URL} target="_blank" rel="noreferrer">
            Manage connections
          </Button>
          <Button icon={<ArrowClockwiseRegular />} onClick={() => void onRefresh()}>
            Refresh data
          </Button>
        </div>

        <div>
          <Subtitle2>How to set up</Subtitle2>
          <ol className={styles.steps}>
            <li>Open <Text weight="semibold">Manage connections</Text> and choose <Text weight="semibold">+ New connection</Text>.</li>
            <li>Create one connection for each connector listed above and complete the sign-in pop-up.</li>
            <li>Return here and select <Text weight="semibold">Refresh data</Text>.</li>
            <li>To switch accounts later, use the play-app consent dialog&apos;s <Text weight="semibold">Switch account</Text>, or recreate the connection here.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
