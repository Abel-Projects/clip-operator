# Run a command on the home server via SSH.
# Usage: .\deploy\remote.ps1 "docker ps"
# Requires: deploy/home-server.env, SSH config (see HOME-SERVER.md)

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Command
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $here "home-server.env"

if (-not (Test-Path $envFile)) {
    Write-Host "Missing deploy/home-server.env - copy from home-server.env.example" -ForegroundColor Red
    Write-Host "See deploy/HOME-SERVER.md for one-time setup."
    exit 1
}

Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([A-Z_]+)=(.*)$') {
        Set-Item -Path "env:$($Matches[1])" -Value $Matches[2].Trim('"')
    }
}

$host = $env:HOME_SERVER_SSH_HOST
if (-not $host) {
    Write-Host "HOME_SERVER_SSH_HOST not set in deploy/home-server.env" -ForegroundColor Red
    exit 1
}

Write-Host "-> clip-home: $Command" -ForegroundColor Cyan
ssh $host $Command
