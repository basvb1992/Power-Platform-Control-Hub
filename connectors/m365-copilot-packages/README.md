# M365 Copilot Package Management — custom connector

Microsoft 365 Copilot **agents built in the Agent Builder** (declarative agents) store their
setup data — instructions, capabilities, knowledge, and actions — **in Microsoft 365, not in
Dataverse**. The Copilot Studio deep analytics therefore can't read them through the Dataverse
connector. This custom connector wraps the Microsoft Graph **Copilot Package Management API
(beta)** so the hub can list those agents and read their configuration.

## What it calls

| Operation | Graph endpoint | Returns |
|---|---|---|
| `ListCopilotPackages` | `GET /beta/copilot/admin/catalog/packages` | All packages (agents/apps) in the tenant. Filter with `$filter=supportedHosts/any(h:h eq 'Copilot')`. |
| `GetCopilotPackageDetail` | `GET /beta/copilot/admin/catalog/packages/{id}` | Full metadata + `elementDetails` (the declarative-agent definition = the setup data). |

## Requirements (important)

- **Microsoft Agent 365 license** on the tenant.
- **`CopilotPackages.Read.All`** delegated permission — signed-in user must be **AI Administrator**
  or **Global Administrator**. Application (app-only) permission is **not supported**.
- The API is **`/beta` (preview)** and subject to change.

## One-time setup (maker portal — cannot be done headless)

1. **App registration**: create an Entra app registration, add the delegated Graph permission
   `CopilotPackages.Read.All`, grant admin consent. Note the client id + secret.
2. **Import the connector**: in [make.powerapps.com](https://make.powerapps.com) →
   *Custom connectors* → *Import an OpenAPI file* → select
   [`apiDefinition.swagger.json`](apiDefinition.swagger.json).
   - On the *Security* tab choose **OAuth 2.0 / Azure Active Directory**, paste the client id +
     secret, set **Resource URL** = `https://graph.microsoft.com`.
   - (`apiProperties.json` documents the same OAuth settings — replace
     `REPLACE_WITH_APP_REGISTRATION_CLIENT_ID`.)
3. **Create a connection** to the connector (sign in as an AI/Global admin).
4. **Add it to the code app** as a data source named **`m365copilotpackages`**:
   ```pwsh
   pac code add-data-source -a <connectorApiId> -c <connectionId>
   ```
   The hub's `m365Agents.ts` service targets the data-source name `m365copilotpackages`.

Until those steps are done the **M365 Agents** sub-tab loads gracefully with an explanatory
message instead of data.

## Non-secret config via environment variables

The tenant-specific but **non-secret** values (tenant id, application/client id) are stored as
Power Platform **environment variables** so they travel with the solution and are visible in the
setup checklist:

| Environment variable (schema suffix) | Holds | Secret? |
|---|---|---|
| `<prefix>_M365CopilotTenantId` | Directory (tenant) ID | No |
| `<prefix>_M365CopilotClientId` | Application (client) ID | No |

Create them (added to the code app's solution) with:

```pwsh
./setup-m365-connector.ps1 -SolutionUniqueName <yourSolution> -PublisherPrefix <prefix>
```

> **Security:** the OAuth **client secret is never** put in an environment variable or in the
> solution. It is entered only on the connection's *Security* tab in the maker portal.

## Live setup checklist

The **M365 Agents** tab no longer just shows an error — it runs a live check on load and renders an
ordered checklist that turns each step **✓ Done** as it's completed. It:

- probes the connector once and classifies the result (connector not wired / not connected /
  no permission-or-license / ready), and
- reads the two environment variables above to show what tenant config is filled in.

So an admin can open the tab, click **Check setup**, and see exactly which of the steps below still
need doing.

## ALM: shipping the connector in a solution

For clean cross-environment distribution, add the connector, the two environment variables, and a
**connection reference** to the solution, then bind the code app to the reference (PAC ≥ 1.51.1):

```pwsh
pac code add-data-source -a <connectorApiId> -cr <connectionReferenceLogicalName> -s <solutionId>
```

On import to another tenant the admin re-authorizes the connection and fills the two environment
variables — no code changes required.

