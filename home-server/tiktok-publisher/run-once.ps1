# Runs the TikTok publisher once (for Task Scheduler)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$python = Join-Path $here ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Error "Run setup.ps1 first (.venv missing)."
}

& $python agent.py 2>&1 | Tee-Object -FilePath (Join-Path $here "agent.log") -Append
