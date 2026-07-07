# Power Platform Control Hub — Dataverse Solution

This folder packages the **Power Platform Control Hub** as a Dataverse solution so
others can import the **code app** into their own environment and test-run it.

> ⚠️ **Preview feature.** Power Apps **code apps** are in preview, and distributing a
> code app inside a managed solution is a preview capability. Import/run behaviour can
> change without notice. Test in a non-production environment first.

---

## Contents

| Path | Description |
|------|-------------|
| `VbdPowerPlatformControlHub_1_3_0_0_managed.zip` | **Managed** solution — use this to import & test-run the app in another environment. |
| `VbdPowerPlatformControlHub_1_3_0_0.zip` | **Unmanaged** solution — use this if you want to customise the components. |
| `src/` | Unpacked solution source (managed by `pac solution unpack/pack`). |

**Solution name:** `VbdPowerPlatformControlHub` · **Version:** 1.3.0.0 · **Publisher:** VBD (prefix `vbd`)

---

## What's in the solution

| Component | Purpose |
|-----------|---------|
| **Power Platform Control Hub** (`vbd_powerplatformcontrolhub`, code app) | The app itself — the Copilot Studio deep-analytics + CoE control hub. |
| **Resource Tombstone** (`vbd_resourcetombstone`, table) | Cross-user soft-delete store for the governance views. |

The solution contains the **code app** and its **tombstone table**. The app reads
tenant-wide data through **5 connectors** (see below). Connections are **not** included
in the solution — every importer authorises their own on first run.

> The app's governance views use a soft-delete/tombstone store. This solution ships the
> `vbd_resourcetombstone` table, so soft-deletes persist **cross-user** in Dataverse. If
> the table can't be reached at runtime the app falls back to browser `localStorage`.

---

## Prerequisites (for the importing environment)

| Requirement | Notes |
|-------------|-------|
| **Code apps enabled** | Power Platform admin center → Environments → *your env* → Settings → Product → Features → **Enable code apps** → Save. Import/run fails without this. |
| **Power Platform / tenant admin account** | The app calls admin connectors and reads **tenant-wide** data. A non-admin sees empty/error results. |
| **Dataverse enabled** in the target environment | Required to import the solution and for the tombstone table. |
| The **5 connections** created after import | See *Post-import setup* below. |

---

## Import instructions

### Option A — Maker portal (recommended)

1. Go to [make.powerapps.com](https://make.powerapps.com/) → select the target environment (top-right).
2. **Solutions** → **Import solution**.
3. Browse to `VbdPowerPlatformControlHub_1_3_0_0_managed.zip` → **Next** → **Import**.
4. Wait for the import to complete (the code app is provisioned during import).

### Option B — PAC CLI

```powershell
# Authenticate to the target environment first: pac auth create --environment <url>
pac solution import --path .\VbdPowerPlatformControlHub_1_3_0_0_managed.zip --environment <environment-id>
```

---

## Post-import setup (connections)

The app depends on the five connectors below. After import:

1. Open the **Power Platform Control Hub** app (Apps list → Play).
2. On first run with missing connections, the app **auto-opens its built-in “Setup” tab**.
3. From the Setup page, choose **Manage connections** and create one connection per connector,
   completing each sign-in pop-up.
4. Return to the app and choose **Refresh data**.

| Connector | API name | Used for |
|-----------|----------|----------|
| Power Platform for Admins V2 | `shared_powerplatformadminv2` | Tenant inventory, environments, resources |
| Power Platform for Admins | `shared_powerplatformforadmins` | Environments & DLP policies |
| Power Apps for Admins | `shared_powerappsforadmins` | Canvas & code app metadata |
| Power Automate Management | `shared_flowmanagement` | Cloud & agent flow metadata |
| Microsoft Dataverse | `shared_commondataserviceforapps` | Copilot Studio agents, transcripts, costs |

> The **M365 Agents** tab additionally uses a custom Graph connector and requires a
> Microsoft Agent 365 license + `CopilotPackages.Read.All`. See
> [`connectors/m365-copilot-packages/`](../connectors/m365-copilot-packages/README.md).

---

## Risks & limitations to review before distributing

- **Preview feature** — code-app-in-managed-solution import/run is not GA and may change or fail.
- **Elevated privilege** — the app runs on admin connectors and reads tenant-wide data. Anyone
  running it needs Power Platform/tenant admin rights. Review the source before importing into
  your tenant.
- **Connections not included** — each importer authorises their own 5 connections (guided by the
  in-app Setup page). Not a one-click experience.
- **Managed = locked** — components can't be edited once imported managed. To customise, import the
  **unmanaged** zip or fork the source.
- **No supported upgrade path** — updates ship as new solution versions; there is no automated
  in-place upgrade guarantee for the code app in preview.
- **Provided as-is** — no warranty or support. Test in a non-production environment first.

---

## License & attribution

This is a fork of **[Power Platform Control Hub](https://github.com/Laskewitz/Power-Platform-Control-Hub)**
by **Daniel Laskewitz**, extended with a Copilot Studio deep-analytics layer. The upstream
repository does **not** publish an explicit open-source license — if you plan to redistribute,
confirm redistribution terms with the original author first. The Copilot Studio extensions in this
fork are authored separately; add your own `LICENSE` at the repo root before publishing.

---

## Working with the solution source

### Re-pack after changes

```powershell
pac solution pack --zipfile .\VbdPowerPlatformControlHub_1_3_0_0.zip --folder .\src --packagetype Unmanaged
```

### Unpack a new zip

```powershell
pac solution unpack --zipfile .\VbdPowerPlatformControlHub_1_3_0_0.zip --folder .\src --packagetype Unmanaged
```

### Export a fresh managed build

```powershell
pac solution export --name VbdPowerPlatformControlHub --managed --path .\VbdPowerPlatformControlHub_1_3_0_0_managed.zip --overwrite
```
