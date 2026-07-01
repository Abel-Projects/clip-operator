# Poll clip-operator every 5 minutes (foreground debug loop)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

while ($true) {
    Write-Host "[$(Get-Date -Format o)] tick"
    try {
        & (Join-Path $here "run-once.ps1")
    } catch {
        Write-Warning $_
    }
    Start-Sleep -Seconds 300
}
