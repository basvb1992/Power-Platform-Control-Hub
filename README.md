# CoE Dashboard — Power Apps Code App

A **Center of Excellence (CoE) Starter Kit dashboard replacement** built as a [Power Apps Code App](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview). It uses the [Power Platform Admin V2 connector](https://learn.microsoft.com/en-us/connectors/powerplatformadminv2/) to surface a real-time view of all Power Platform resources across your tenant — canvas apps, model-driven apps, cloud flows, Copilot Studio agents, agent flows, code apps, and environments — without needing Dataverse or the CoE Starter Kit solution.

Authentication is handled entirely by the Power Apps host. No app registration or MSAL configuration is required.

---

## Features

| View | What it shows |
|---|---|
| **Overview** | Six metric cards (one per resource type) + lazily-loaded recently created resources |
| **Resources** | Full sortable, searchable, filterable table of all resources across all environments |
| **Environments** | Card grid of every environment with type badge, managed-environment indicator, region, and resource count |
| **Recommendations** | Advisor recommendations from the admin API |
| **Governance** | Environment groups, billing policies, cross-tenant connection reports, and role assignments |
| **Connectors** | Per-environment connections, connectors, and Power Pages websites |

Additional UX:
- Clickable metric tiles navigate to a filtered Resources view
- Infinite scroll on recently created resources table
- In-app refresh button
- Responsive grid layout
- Built with [Fluent UI v9](https://react.fluentui.dev/) — consistent with the Microsoft 365 design language

---

## Architecture

```
CoE-Code/
├── src/
│   ├── App.tsx                    # Root: tab navigation, layout
│   ├── types/
│   │   ├── inventory.ts           # TypeScript interfaces for inventory responses
│   │   └── admin.ts               # TypeScript interfaces for admin API responses
│   ├── services/
│   │   ├── inventoryApi.ts        # Resource/environment queries via connector
│   │   └── adminApi.ts            # Admin data (recommendations, governance, connectors)
│   ├── hooks/
│   │   ├── useInventory.ts        # Data-fetching hook for inventory
│   │   └── useAdminData.ts        # Data-fetching hook for admin data
│   ├── generated/                 # Auto-generated connector service files (gitignored)
│   │   ├── models/
│   │   │   └── PowerPlatformforAdminsV2Model.ts
│   │   ├── services/
│   │   │   └── PowerPlatformforAdminsV2Service.ts
│   │   └── index.ts
│   └── components/
│       ├── Dashboard.tsx          # Overview / metric cards
│       ├── ResourcesView.tsx      # Sortable resources table
│       ├── EnvironmentsView.tsx   # Environment cards
│       ├── RecommendationsView.tsx
│       ├── GovernanceView.tsx
│       └── ConnectorsView.tsx
├── public/
│   └── favicon.svg
├── index.html
├── vite.config.ts                 # Vite + Power Apps vite plugin
├── package.json
├── tsconfig.app.json
└── README.md
```

**Data flow:**
1. The Power Apps host handles authentication — the app renders immediately with no login screen.
2. On mount, `useInventory` and `useAdminData` call the generated `PowerPlatformforAdminsV2Service` methods directly.
3. The connector passes calls through the Power Apps host to the Power Platform Admin V2 API.
4. Results are stored in React state and rendered by the view components.

---

## Prerequisites

| Tool | Minimum version |
|---|---|
| [Node.js](https://nodejs.org/) (LTS) | 18 |
| [Git](https://git-scm.com/) | any |
| Power Platform environment with **code apps enabled** | — |
| Power Platform admin account | — |

---

## Connector Setup

This app uses the **Power Platform Admin V2** connector (`shared_powerplatformadminv2`). The generated service files are gitignored and must be recreated after cloning.

### 1 — Create a connection

1. Go to [make.powerapps.com](https://make.powerapps.com) and select your environment.
2. Navigate to **Connections → New connection**.
3. Search for **Power Platform for Admins V2** and create the connection.
4. Note the **Connection ID** from the URL (the GUID after `/connections/`).

### 2 — Initialise the Code App and add the connector

```bash
# Install dependencies
npm install

# Initialise the Power Apps Code App (creates power.config.json)
npx power-apps init --display-name "CoE Dashboard"

# Add the Admin V2 connector using your connection ID
npx power-apps add-data-source -a "shared_powerplatformadminv2" -c <your-connection-id>
# When asked "Are you using a connection reference instead of a connection ID?" → select No
```

This generates `src/generated/` with the typed service client. The folder is gitignored — re-run the command after every fresh clone.

---

## Local Development

```bash
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
| [@microsoft/power-apps](https://www.npmjs.com/package/@microsoft/power-apps) | Code Apps CLI (`init`, `run`, `push`, `add-data-source`) |
| [@microsoft/power-apps-vite](https://www.npmjs.com/package/@microsoft/power-apps-vite) | Vite plugin for Power Apps integration |
| [@fluentui/react-components v9](https://react.fluentui.dev/) | Fluent UI component library |
| [@fluentui/react-icons v2](https://github.com/microsoft/fluentui-system-icons) | Fluent UI icons |

---

## Limitations & Known Issues

- The Admin V2 connector returns up to **1 000 resources** per query. For larger tenants, pagination via `skipToken` may be needed.
- The app requires the signed-in user to be a **Power Platform admin** or **environment admin** to read cross-environment data.
- Code apps are **not** supported in the Power Apps mobile app or Power Apps for Windows.
- Code apps **do not** support Power Platform Git integration.
- The `src/generated/` folder is gitignored — every collaborator must run `npx power-apps add-data-source` after cloning.

---

## Related Resources

- [Power Apps Code Apps overview](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)
- [Power Platform Admin V2 connector reference](https://learn.microsoft.com/en-us/connectors/powerplatformadminv2/)
- [Power Platform Inventory API](https://learn.microsoft.com/en-us/power-platform/admin/inventory-api)
- [PowerAppsCodeApps GitHub repository (samples & templates)](https://github.com/microsoft/PowerAppsCodeApps)
