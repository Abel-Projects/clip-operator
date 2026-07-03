# Register Windows scheduled task: SupoClip TikTok Publisher (every 5 min)
# Uses schtasks (works without admin for the current user). Re-run anytime to fix the path.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = "SupoClipTikTokPublisher"
$ps1 = Join-Path $here "run-once.ps1"

$existing = schtasks /Query /TN $taskName 2>$null
if ($LASTEXITCODE -eq 0) {
    schtasks /Delete /TN $taskName /F | Out-Null
}

$tr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$ps1`""
schtasks /Create /TN $taskName /TR $tr /SC MINUTE /MO 5 /F | Out-Null
Write-Host "Registered scheduled task: $taskName (every 5 minutes)"
Write-Host "  Script: $ps1"
