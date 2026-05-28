# Pack and deploy the Power Platform Control Hub solution
# Requires PAC CLI: https://aka.ms/PowerAppsCLI

param(
    [string]$EnvironmentUrl = "https://org15ddc379.crm.dynamics.com",
    [switch]$Deploy
)

$SolutionFolder = "$PSScriptRoot\src"
$OutputZip      = "$PSScriptRoot\PowerPlatformControlHub.zip"

# Pack the solution from source XML files
pac solution pack `
    --zipfile $OutputZip `
    --folder  $SolutionFolder `
    --packagetype Unmanaged

Write-Host "Solution packed: $OutputZip"

if ($Deploy) {
    if (-not $EnvironmentUrl) {
        Write-Error "Provide -EnvironmentUrl when using -Deploy"
        exit 1
    }
    pac auth create --url $EnvironmentUrl
    pac solution import --path $OutputZip --activate-plugins
    Write-Host "Solution imported to $EnvironmentUrl"
}
