$ErrorActionPreference = "Continue"
Write-Host "=== Stop/remove OpenShorts containers ==="
Set-Location C:\openshorts -ErrorAction SilentlyContinue
if (Test-Path C:\openshorts\docker-compose.yml) {
  docker compose -f C:\openshorts\docker-compose.yml down --remove-orphans 2>&1
}
docker rm -f openshorts-frontend openshorts-backend openshorts-renderer 2>&1
docker images --format "{{.Repository}}:{{.Tag}} {{.ID}}" | Select-String "openshorts" | ForEach-Object {
  $id = ($_ -split '\s+')[-1]
  Write-Host "rmi $id"
  docker rmi -f $id 2>&1
}

Write-Host "`n=== Delete C:\openshorts ==="
Set-Location C:\
Remove-Item -LiteralPath C:\openshorts -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path C:\openshorts) { Write-Host "WARN: C:\openshorts still exists" } else { Write-Host "C:\openshorts deleted" }

Write-Host "`n=== Remaining docker (should be SupoClip only for us) ==="
docker ps --format "table {{.Names}}\t{{.Status}}"
Write-Host "DONE"
