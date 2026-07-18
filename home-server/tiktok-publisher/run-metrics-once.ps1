# Optional: run metrics scrape alone (also runs when publisher is idle)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

& (Join-Path $here "sync-env.ps1")

$python = Join-Path $here ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Error "Run setup.ps1 first (.venv missing)."
}

& $python "metrics-agent.py" --force 2>&1 | Tee-Object -FilePath (Join-Path $here "metrics-agent.log") -Append
