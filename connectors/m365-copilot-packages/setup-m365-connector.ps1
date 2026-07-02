# Script: setup-m365-connector.ps1
# Vertical: Shared (copilot-studio-control-hub)
# Purpose: Create the NON-SECRET environment variable definitions the M365 Copilot
#          connector needs (tenant id + client id), added to the code app's solution.
#          Prints the remaining maker-portal steps. Never touches the client secret.
# Run from: demos/_shared/copilot-studio-control-hub/connectors/m365-copilot-packages/
# Prerequisites: az login (AI/Global admin on the target tenant)

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$SolutionUniqueName = 'VbdPowerPlatformControlHub',
    [string]$PublisherPrefix = 'vbd'
)

$ErrorActionPreference = 'Stop'
$baseUrl = 'https://vbddemo.crm.dynamics.com/api/data/v9.2'
$token = (az account get-access-token --resource https://vbddemo.crm.dynamics.com -o tsv --query accessToken)
$headers = @{
    'Authorization'          = "Bearer $token"
    'Content-Type'           = 'application/json; charset=utf-8'
    'OData-MaxVersion'       = '4.0'
    'OData-Version'          = '4.0'
    'Prefer'                 = 'return=representation'
    'MSCRM.SolutionUniqueName' = $SolutionUniqueName
}

# Non-secret configuration only. The client SECRET is entered on the connection's
# Security tab in the maker portal and is never stored as an environment variable.
$vars = @(
    @{
        schema  = "${PublisherPrefix}_M365CopilotTenantId"
        display = 'M365 Copilot – Tenant ID'
        desc    = 'Directory (tenant) ID of the Entra app registration used by the m365copilotpackages connector. Non-secret.'
    },
    @{
        schema  = "${PublisherPrefix}_M365CopilotClientId"
        display = 'M365 Copilot – Client ID'
        desc    = 'Application (client) ID of the Entra app registration used by the m365copilotpackages connector. Non-secret.'
    }
)

$STRING_TYPE = 100000000

foreach ($v in $vars) {
    $existing = Invoke-RestMethod -Method Get -Headers $headers `
        -Uri "$baseUrl/environmentvariabledefinitions?`$select=schemaname&`$filter=schemaname eq '$($v.schema)'" `
        -ErrorAction SilentlyContinue
    if ($existing.value.Count -gt 0) {
        Write-Host "ℹ️  Environment variable '$($v.schema)' already exists — skipping"
        continue
    }
    if ($PSCmdlet.ShouldProcess($v.schema, 'Create environment variable definition')) {
        $body = @{
            schemaname  = $v.schema
            displayname = $v.display
            description = $v.desc
            type        = $STRING_TYPE
        }
        try {
            $result = Invoke-RestMethod -Method Post -Headers $headers `
                -Uri "$baseUrl/environmentvariabledefinitions" `
                -Body ($body | ConvertTo-Json -Depth 5)
            Write-Host "✅ Created environment variable: $($result.schemaname)"
        }
        catch {
            $errBody = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
            Write-Warning "❌ Failed to create $($v.schema): $($errBody.error.message ?? $_.Exception.Message)"
        }
    }
}

Write-Host "`n══ REMAINING MANUAL STEPS (maker portal / admin) ══"
Write-Host "1. Entra: register an app, add delegated Graph permission CopilotPackages.Read.All, grant admin consent."
Write-Host "2. Set the two environment variables above to the tenant id + client id (Solutions > $SolutionUniqueName > Environment variables)."
Write-Host "3. Import connectors/m365-copilot-packages/apiDefinition.swagger.json as a custom connector"
Write-Host "   (OAuth 2.0 / Azure AD, resource https://graph.microsoft.com, client id + SECRET on the Security tab)."
Write-Host "4. Create a connection to the connector, signing in as an AI/Global admin."
Write-Host "5. Add it to the code app:  pac code add-data-source -a <connectorApiId> -c <connectionId>"
Write-Host "   (or -cr <connectionReferenceLogicalName> -s <solutionId> for connection-reference ALM)."
Write-Host "`nThe M365 Agents tab shows a live checklist that turns these steps green as they complete."
