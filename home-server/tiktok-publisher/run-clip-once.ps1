# Runs the SupoClip clip worker once (for Task Scheduler)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

& (Join-Path $here "sync-env.ps1")

$python = Join-Path $here ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Error "Run setup.ps1 first (.venv missing)."
}

& $python clip-agent.py 2>&1 | Tee-Object -FilePath (Join-Path $here "clip-agent.log") -Append
