# SSH tunnel: home server SupoClip -> localhost on this dev PC.
# Run in a terminal and leave open (or use start-dev.ps1).
# Then open http://localhost:3000 (Clip Operator) and http://localhost:3107 (SupoClip).

$ErrorActionPreference = "Stop"
$hostName = "clip-home"

Write-Host "Tunneling home server SupoClip to localhost..." -ForegroundColor Cyan
Write-Host "  localhost:8000  -> home server SupoClip API"
Write-Host "  localhost:3107  -> home server SupoClip UI"
Write-Host ""
Write-Host "Clip Operator: run 'pnpm dev' -> http://localhost:3000"
Write-Host "Press Ctrl+C to stop the tunnel."
Write-Host ""

ssh -N `
  -L 8000:127.0.0.1:8000 `
  -L 3107:127.0.0.1:3107 `
  $hostName
