# Starts OpenShorts via Docker. Clip Operator (port 3000) is not started by default.

$ErrorActionPreference = "Continue"
$LogDir = "H:\Projects\clip-operator\logs"
$LogFile = Join-Path $LogDir "bootstrap.log"
$OpenShortsDir = "H:\Projects\openshorts"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $LogFile -Value $line
  Write-Host $line
}

Log "=== OpenShorts bootstrap started ==="

if (-not (Test-Path $OpenShortsDir)) {
  Log "Cloning OpenShorts..."
  git clone https://github.com/mutonby/openshorts.git $OpenShortsDir 2>&1 | Out-Null
}

$DockerExe = @(
  "D:\Program Files\Docker\Docker\resources\bin\docker.exe",
  "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$DockerDesktop = @(
  "D:\Program Files\Docker\Docker\Docker Desktop.exe",
  "C:\Program Files\Docker\Docker\Docker Desktop.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $DockerExe) {
  Log "Docker not found. Install Docker Desktop."
  exit 1
}

if (-not (Get-Process "Docker Desktop" -ErrorAction SilentlyContinue) -and $DockerDesktop) {
  Log "Launching Docker Desktop..."
  Start-Process $DockerDesktop | Out-Null
}

Log "Checking Docker daemon (90s max)..."
$dockerReady = $false
for ($i = 1; $i -le 18; $i++) {
  $proc = Start-Process -FilePath $DockerExe -ArgumentList "info" -NoNewWindow -PassThru `
    -RedirectStandardOutput "$LogDir\docker-out.txt" -RedirectStandardError "$LogDir\docker-err.txt"
  $exited = $proc.WaitForExit(4000)
  if (-not $exited) {
    try { $proc.Kill() } catch {}
  } elseif ($proc.ExitCode -eq 0) {
    $dockerReady = $true
    Log "Docker daemon ready."
    break
  }
  Start-Sleep -Seconds 5
}

if (-not $dockerReady) {
  Log "Docker not ready. Open Docker Desktop, then run: pnpm openshorts"
  exit 1
}

Log "Starting OpenShorts containers..."
Push-Location $OpenShortsDir
& $DockerExe compose up -d 2>&1 | ForEach-Object { Log $_ }
Pop-Location

Log "=== Bootstrap complete ==="
Log "OpenShorts dashboard: http://localhost:5175/#app"
Log "OpenShorts API: http://localhost:8000"
