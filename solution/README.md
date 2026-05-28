# Power Platform Control Hub — Solution

This folder contains the Power Platform solution source files for distributing
**Power Platform Control Hub** as a managed/unmanaged solution.

## Publisher

| Field | Value |
|-------|-------|
| Display name | Power Platform Advocates |
| Unique name | PowerPlatformAdvocates |
| Prefix | `ppa` |
| Option value prefix | 72700 |

## What's included

| Component | Schema name | Purpose |
|-----------|-------------|---------|
| Custom table | `ppa_resourcetombstone` | Stores deleted resource IDs so they stay hidden for all users across sessions, even before the Inventory API refreshes |

### `ppa_resourcetombstone` columns

| Column | Type | Description |
|--------|------|-------------|
| `ppa_resourceid` | Text (200) | Resource GUID/name — primary name column |
| `ppa_resourcetype` | Text (200) | e.g. `microsoft.copilotstudio/agents` |
| `ppa_environmentid` | Text (100) | Environment the resource belonged to |
| `ppa_displayname` | Text (500) | Human-readable name at time of deletion |
| `ppa_deletedon` | DateTime | UTC timestamp of the delete action |
| `ppa_deletedby` | Text (200) | UPN/display name of the user who deleted it |

## Packing the solution

Requires [PAC CLI](https://aka.ms/PowerAppsCLI).

```powershell
# Pack only
.\solution\pack.ps1

# Pack and deploy to an environment
.\solution\pack.ps1 -Deploy -EnvironmentUrl https://yourorg.crm.dynamics.com
```

The packed zip (`PowerPlatformControlHub.zip`) can then be imported manually via
make.powerapps.com or via `pac solution import`.

## Adding the Code App to the solution

After importing the solution into an environment, add the Code App:

```powershell
pac solution add-reference --path . --environment https://yourorg.crm.dynamics.com
```

Or manually from make.powerapps.com: **Solutions → Power Platform Control Hub → Add existing → App → Canvas app**.
