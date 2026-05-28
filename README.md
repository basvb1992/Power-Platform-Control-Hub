# CoE Dashboard — Power Apps Code App

A **Center of Excellence (CoE) Starter Kit dashboard replacement** built as a [Power Apps Code App](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview). It uses the [Power Platform Inventory API](https://learn.microsoft.com/en-us/power-platform/admin/inventory-api) to surface a real-time view of all Power Platform resources across your tenant — canvas apps, model-driven apps, cloud flows, Copilot Studio agents, agent flows, code apps, and environments — without needing Dataverse or the CoE Starter Kit solution.

---

## Features

| View | What it shows |
|---|---|
| **Overview** | Six metric cards (one per resource type) + the 15 most recently created resources |
| **Resources** | Full sortable, searchable, filterable table of all resources across all environments |
| **Environments** | Card grid of every environment with type badge, managed-environment indicator, region, and resource count |

Additional UX:
- Microsoft Entra ID (Azure AD) sign-in via MSAL popup
- Automatic silent token renewal
- In-app refresh button
- Responsive grid layout (works on various screen sizes)
- Built with [Fluent UI v9](https://react.fluentui.dev/) — consistent with the Microsoft 365 design language

---

## Architecture

```
CoE-Code/
├── src/
│   ├── App.tsx                    # Root: auth state, tab navigation, layout
│   ├── config/
│   │   └── auth.ts                # MSAL configuration (reads .env)
│   ├── types/
│   │   └── inventory.ts           # TypeScript interfaces for API responses
│   ├── services/
│   │   └── inventoryApi.ts        # Calls to the Power Platform Inventory API
│   ├── hooks/
│   │   ├── useAuth.ts             # MSAL authentication hook
│   │   └── useInventory.ts        # Data-fetching hook
│   └── components/
│       ├── Dashboard.tsx          # Overview / metric cards
│       ├── ResourcesView.tsx      # Sortable resources table
│       └── EnvironmentsView.tsx   # Environment cards
├── public/
│   └── favicon.svg
├── index.html
├── vite.config.ts                 # Vite + Power Apps vite plugin
├── package.json
├── tsconfig.app.json
└── README.md
```

**Data flow:**
1. App initialises MSAL and checks for an existing session.
2. On successful sign-in, `useInventory` calls `fetchResources` and `fetchEnvironments` in parallel.
3. Both functions POST to `https://api.powerplatform.com/resourcequery/resources/query?api-version=2024-10-01`.
4. The resource query uses a `leftouter` join to enrich each resource with its parent environment's display name, region, type, and managed status.
5. Results are stored in React state and rendered by the three view components.

---

## Prerequisites

| Tool | Minimum version |
|---|---|
| [Node.js](https://nodejs.org/) (LTS) | 18 |
| [Git](https://git-scm.com/) | any |
| Power Platform environment with **code apps enabled** | — |
| Power Platform admin account (for the Inventory API) | — |

---

## Azure AD Setup

The Inventory API requires a delegated token with the `https://api.powerplatform.com/user_impersonation` scope. You must register an application in Azure Active Directory.

### 1 — Register an app in Azure AD

1. Go to [Azure Portal → Azure Active Directory → App registrations](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps).
2. Click **New registration**.
3. Enter a name (e.g. `CoE Dashboard`).
4. Under **Supported account types**, select **Accounts in this organisational directory only**.
5. Under **Redirect URI**, choose **Single-page application (SPA)** and enter:
   - For local development: `http://localhost:5173`
   - For production: the URL assigned after `npx power-apps push`
6. Click **Register**.
7. Note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.

### 2 — Add API permissions

1. Go to **API permissions → Add a permission**.
2. Select **APIs my organisation uses** and search for **Power Platform API**.
3. Select **Delegated permissions → user_impersonation**.
4. Click **Add permissions**.
5. (Optional but recommended) Click **Grant admin consent for \<your tenant\>**.

> **Note:** Users who run the dashboard need a **Power Apps Premium** licence and must be a **Power Platform admin** or **environment admin** to call the Inventory API.

---

## Configuration

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```
VITE_AZURE_CLIENT_ID=<Application (client) ID from Azure AD>
VITE_AZURE_TENANT_ID=<Directory (tenant) ID from Azure AD>
```

> `.env` is in `.gitignore` — never commit it to source control.

---

## Local Development

```bash
# Install dependencies
npm install

# Initialise the Power Apps Code App (creates power.config.json)
# You will be prompted to sign in and select your environment.
npx power-apps init --display-name "CoE Dashboard"

# Start the local dev server
npm run dev
```

Open the **Local Play** URL printed by Vite (typically `http://localhost:5173`) in the same browser profile as your Power Platform tenant.

---

## Build & Deploy to Power Apps

```bash
# Type-check and build
npm run build

# Push to your Power Platform environment
npx power-apps push
```

When the push succeeds, the CLI prints a Power Apps URL where you can play, share, or manage the app.

> **Admin consent for redirect URI:** After deploying, add the production Power Apps URL as an additional SPA redirect URI in your Azure AD app registration (Azure Portal → App registrations → Authentication).

---

## Enable Code Apps on Your Environment

If code apps are not yet enabled:

1. Go to [Power Platform admin center](https://admin.powerplatform.microsoft.com).
2. **Manage → Environments → \<your environment\>**.
3. **Settings → Product → Features**.
4. Toggle **Enable code apps** → **Save**.

---

## Tech Stack

| Package | Purpose |
|---|---|
| [React 18](https://react.dev/) + TypeScript | UI framework |
| [Vite 6](https://vite.dev/) | Build tool / dev server |
| [@microsoft/power-apps](https://www.npmjs.com/package/@microsoft/power-apps) | Code Apps CLI (`init`, `run`, `push`) |
| [@microsoft/power-apps-vite](https://www.npmjs.com/package/@microsoft/power-apps-vite) | Vite plugin for Power Apps integration |
| [@fluentui/react-components v9](https://react.fluentui.dev/) | Fluent UI component library |
| [@fluentui/react-icons v2](https://github.com/microsoft/fluentui-system-icons) | Fluent UI icons |
| [@azure/msal-browser v3](https://github.com/AzureAD/microsoft-authentication-library-for-js) | Microsoft Authentication Library (MSAL) |

---

## Limitations & Known Issues

- The Inventory API returns up to **1 000 resources** per query (with `Top: 1000`). For tenants with more than 1 000 resources, implement pagination using the `skipToken` returned in the API response.
- The app requires the user to be a **Power Platform admin** or **environment admin** to see cross-environment data.
- Code apps are **not** supported in the Power Apps mobile app or Power Apps for Windows.
- Code apps **do not** support Power Platform Git integration.

---

## Related Resources

- [Power Apps Code Apps overview](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)
- [Power Platform Inventory API](https://learn.microsoft.com/en-us/power-platform/admin/inventory-api)
- [Power Platform Inventory schema reference](https://learn.microsoft.com/en-us/power-platform/admin/inventory-schema)
- [PowerAppsCodeApps GitHub repository (samples & templates)](https://github.com/microsoft/PowerAppsCodeApps)
- [MSAL browser library docs](https://github.com/AzureAD/microsoft-authentication-library-for-js/tree/dev/lib/msal-browser)
