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
