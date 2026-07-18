# Register Windows scheduled task: SupoClip clip worker (every 5 min)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = "SupoClipClipWorker"
$ps1 = Join-Path $here "run-clip-once.ps1"

if (-not (Test-Path $ps1)) {
    throw "Missing $ps1"
}

cmd /c "schtasks /Query /TN $taskName >nul 2>&1"
if ($LASTEXITCODE -eq 0) {
    cmd /c "schtasks /Delete /TN $taskName /F >nul"
}

$tr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$ps1`""
cmd /c "schtasks /Create /TN $taskName /TR `"$tr`" /SC MINUTE /MO 5 /F"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to create scheduled task $taskName"
}
Write-Host "Registered scheduled task: $taskName (every 5 minutes)"
Write-Host "  Script: $ps1"
