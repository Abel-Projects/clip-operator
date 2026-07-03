# Expose SupoClip to Vercel via Tailscale Funnel (replaces Cloudflare quick tunnels).
# Run on the home server after SupoClip is up. Requires Tailscale installed and logged in.
#
#   powershell -ExecutionPolicy Bypass -File deploy/tailscale-supoclip.ps1
#
# Then set on Vercel (Project -> Settings -> Environment Variables):
#   SUPOCLIP_BASE_URL     = the funnel URL for port 8000 (backend /health)
#   SUPOCLIP_FRONTEND_URL = the funnel URL for port 3107 (editor embed)
#
# Funnel URLs are stable for your tailnet - they do not expire like trycloudflare.com.

$ErrorActionPreference = "Stop"

if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
    Write-Host "Install Tailscale: https://tailscale.com/download" -ForegroundColor Red
    exit 1
}

Write-Host "Checking SupoClip is listening..." -ForegroundColor Cyan
try {
    $null = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -TimeoutSec 5 -UseBasicParsing
} catch {
    Write-Host "SupoClip backend not reachable on :8000. Run scripts/start-supoclip.ps1 first." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Starting Tailscale Funnel for SupoClip backend (:8000)..." -ForegroundColor Cyan
Write-Host "(Leave this running, or use 'tailscale funnel --bg 8000' for background)"
Write-Host ""

tailscale funnel 8000
