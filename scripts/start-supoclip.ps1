$ErrorActionPreference = "Stop"

$DockerExe = "D:\Program Files\Docker\Docker\resources\bin\docker.exe"
if (-not (Test-Path $DockerExe)) {
  $DockerExe = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
}

$SupoClipDir = "H:\Projects\supoclip"
$DockerDesktop = "D:\Program Files\Docker\Docker\Docker Desktop.exe"
if (-not (Test-Path $DockerDesktop)) {
  $DockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
}

if (-not (Test-Path $SupoClipDir)) {
  git clone https://github.com/FujiwaraChoki/supoclip.git $SupoClipDir
}

if (-not (Test-Path $DockerExe)) {
  Write-Host "Docker is not installed. Install Docker Desktop first."
  exit 1
}

if (-not (Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)) {
  if (Test-Path $DockerDesktop) {
    Start-Process $DockerDesktop | Out-Null
    Write-Host "Starting Docker Desktop..."
  }
}

for ($i = 1; $i -le 60; $i++) {
  & $DockerExe info *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Docker daemon is ready."
    break
  }
  Start-Sleep -Seconds 5
  if ($i -eq 60) {
    Write-Host "Docker daemon did not become ready. Finish Docker Desktop setup, then rerun this script."
    exit 1
  }
}

$EnvExample = Join-Path $SupoClipDir ".env.example"
$EnvFile = Join-Path $SupoClipDir ".env"
if (-not (Test-Path $EnvFile) -and (Test-Path $EnvExample)) {
  Copy-Item $EnvExample $EnvFile
  Write-Host "Created $EnvFile from .env.example - add ASSEMBLY_AI_API_KEY, GOOGLE_API_KEY, and BETTER_AUTH_SECRET."
}

Push-Location $SupoClipDir
& $DockerExe compose up --build -d
Pop-Location

Write-Host ""
Write-Host "SupoClip frontend: http://localhost:3107"
Write-Host "SupoClip backend:  http://localhost:8000"
Write-Host ""
Write-Host "1. Open the frontend, create an account, and copy your user ID from the SupoClip database or browser session."
Write-Host "2. Set SUPOCLIP_USER_ID and SUPOCLIP_AUTH_SECRET in clip-operator/.env.local"
Write-Host "   Default docker auth secret: supoclip_dev_backend_secret_change_me"
