# Home server install — SupoClip + TikTok publisher only.
# The app stays on Vercel; this machine runs 24/7 clip + post work.
#
#   powershell -ExecutionPolicy Bypass -File deploy/install-windows-home-server.ps1
#
# After install:
#   1. Clip worker + publisher poll Vercel outbound (no Tailscale Funnel required)
#   2. Confirm cron-job.org hits https://clip-operator.vercel.app/api/cron/autopilot
#   3. Optional: Tailscale Funnel only if you want the SupoClip UI embedded from Vercel

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "=== Home server (SupoClip + TikTok publisher) ===" -ForegroundColor Cyan
Write-Host "App host: https://clip-operator.vercel.app" -ForegroundColor Gray

$publisherDir = Join-Path $repoRoot "home-server\tiktok-publisher"
$localEnv = Join-Path $repoRoot ".env.local"
$publisherEnv = Join-Path $publisherDir ".env"
$envExample = Join-Path $repoRoot "deploy\.env.home-server.example"

# --- 1. Publisher .env ---
if (-not (Test-Path $publisherEnv)) {
    Copy-Item $envExample $publisherEnv
    Write-Host "Created home-server/tiktok-publisher/.env"

    if (Test-Path $localEnv) {
        $keys = @{}
        Get-Content $localEnv | ForEach-Object {
            if ($_ -match '^([A-Z_]+)=(.*)$') { $keys[$Matches[1]] = $Matches[2] }
        }
        $sync = @(
            'CRON_SECRET', 'PUBLISH_AGENT_SECRET', 'SUPOCLIP_USER_ID', 'SUPOCLIP_AUTH_SECRET'
        )
        $lines = Get-Content $publisherEnv
        $lines = $lines | ForEach-Object {
            if ($_ -match '^([A-Z_]+)=') {
                $k = $Matches[1]
                if ($sync -contains $k -and $keys[$k]) { "$k=$($keys[$k])" } else { $_ }
            } else { $_ }
        }
        Set-Content $publisherEnv $lines
    }
}

# Never use expired Cloudflare quick tunnels on the home server
(Get-Content $publisherEnv) `
    -replace '^CLIP_OPERATOR_URL=.*', 'CLIP_OPERATOR_URL=https://clip-operator.vercel.app' `
    -replace '^SUPOCLIP_BASE_URL=.*', 'SUPOCLIP_BASE_URL=http://localhost:8000' |
    Set-Content $publisherEnv

# --- 2. SupoClip ---
Write-Host "`n[1/3] Starting SupoClip..." -ForegroundColor Cyan
$env:SUPOCLIP_DIR = "C:\supoclip"
& "$repoRoot\scripts\start-supoclip.ps1"
if ($LASTEXITCODE -ne 0) { throw "SupoClip failed to start." }

# --- 3. TikTokAutoUploader ---
Write-Host "`n[2/3] Setting up TikTokAutoUploader..." -ForegroundColor Cyan
Push-Location $publisherDir
& .\setup.ps1
& .\setup-uploader.ps1

$accountName = (Get-Content $publisherEnv | Where-Object { $_ -match '^TIKTOK_ACCOUNT_NAME=' }) `
    -replace '^TIKTOK_ACCOUNT_NAME=', '' -replace '"', ''
if (-not $accountName) {
    Write-Host ""
    Write-Host "TikTok login required (one time). Chrome will open." -ForegroundColor Yellow
    $accountName = Read-Host "Account label (e.g. main)"
    Add-Content $publisherEnv "TIKTOK_ACCOUNT_NAME=$accountName"
    Push-Location "vendor\TiktokAutoUploader"
    & .\.venv\Scripts\python.exe cli.py login -n $accountName
    Pop-Location
}
Pop-Location

# --- 4. Scheduled publisher + clip worker ---
Write-Host "`n[3/3] Registering publisher + clip worker (every 5 min)..." -ForegroundColor Cyan
Push-Location $publisherDir
& .\sync-env.ps1
& .\install-scheduled-task.ps1
& .\install-clip-scheduled-task.ps1
Pop-Location

Write-Host ""
Write-Host "=== Home server ready ===" -ForegroundColor Green
Write-Host "SupoClip:    http://localhost:3107"
Write-Host "Clip worker: polls Vercel for pending/clipping campaigns"
Write-Host "Publisher:   polls Vercel for due TikTok posts"
Write-Host ""
Write-Host "Dashboard: https://clip-operator.vercel.app" -ForegroundColor Cyan
