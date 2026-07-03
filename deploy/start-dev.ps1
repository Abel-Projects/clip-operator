# Dev PC: tunnel home-server SupoClip to localhost + start Clip Operator.
# Usage: powershell -ExecutionPolicy Bypass -File deploy/start-dev.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# Stop local SupoClip Docker if running (frees ports 8000/3107 for the tunnel)
$localSupo = "H:\Projects\supoclip"
if (Test-Path $localSupo) {
    $docker = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
    if (Test-Path $docker) {
        Push-Location $localSupo
        & $docker compose ps -q 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Stopping local SupoClip (use home server instead)..." -ForegroundColor Yellow
            & $docker compose down 2>$null
        }
        Pop-Location
    }
}

# Start tunnel in background if not already listening on 8000 via ssh
$tunnelRunning = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -ne 0 }
if (-not $tunnelRunning) {
    Write-Host "Starting SSH tunnel in background..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $PSScriptRoot "dev-tunnel.ps1")
    ) -WindowStyle Minimized
    Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "Dashboard:  http://localhost:3000" -ForegroundColor Green
Write-Host "SupoClip:   http://localhost:3107" -ForegroundColor Green
Write-Host ""

pnpm dev
