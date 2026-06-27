$ErrorActionPreference = "Stop"

$DockerExe = "D:\Program Files\Docker\Docker\resources\bin\docker.exe"
if (-not (Test-Path $DockerExe)) {
  $DockerExe = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
}

$OpenShortsDir = "H:\Projects\openshorts"
$DockerDesktop = "D:\Program Files\Docker\Docker\Docker Desktop.exe"
if (-not (Test-Path $DockerDesktop)) {
  $DockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
}

if (-not (Test-Path $OpenShortsDir)) {
  git clone https://github.com/mutonby/openshorts.git $OpenShortsDir
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

Push-Location $OpenShortsDir
& $DockerExe compose up --build -d
Pop-Location

Write-Host "OpenShorts backend: http://localhost:8000"
Write-Host "OpenShorts dashboard: http://localhost:5175"
