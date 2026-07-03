# Keep publisher .env aligned with SupoClip docker and avoid UTF-8 BOM (breaks python-dotenv).
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $here ".env"
$supoEnvPath = if ($env:SUPOCLIP_DIR) { Join-Path $env:SUPOCLIP_DIR ".env" } else { "C:\supoclip\.env" }

if (-not (Test-Path $supoEnvPath)) {
    Write-Error "SupoClip .env not found at $supoEnvPath"
}

function Read-EnvValue([string]$Path, [string]$Name) {
    Get-Content $Path | ForEach-Object {
        if ($_ -match "^\s*$([regex]::Escape($Name))=(.*)$") {
            return $Matches[1].Trim().Trim('"')
        }
    }
    return $null
}

$backendSecret = Read-EnvValue $supoEnvPath "BACKEND_AUTH_SECRET"
if (-not $backendSecret) {
    Write-Error "BACKEND_AUTH_SECRET missing in $supoEnvPath"
}

$existing = @{}
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^\s*([A-Z_]+)=(.*)$') {
            $existing[$Matches[1]] = $Matches[2].Trim()
        }
    }
}

$lines = [ordered]@{
    CLIP_OPERATOR_URL = if ($existing.CLIP_OPERATOR_URL) { $existing.CLIP_OPERATOR_URL } else { "https://clip-operator.vercel.app" }
    CRON_SECRET = $existing.CRON_SECRET
    PUBLISH_AGENT_SECRET = $existing.PUBLISH_AGENT_SECRET
    SUPOCLIP_BASE_URL = "http://localhost:8000"
    SUPOCLIP_USER_ID = $existing.SUPOCLIP_USER_ID
    SUPOCLIP_AUTH_SECRET = $backendSecret
    TIKTOK_ACCOUNT_NAME = $existing.TIKTOK_ACCOUNT_NAME
    POLL_INTERVAL_SEC = if ($existing.POLL_INTERVAL_SEC) { $existing.POLL_INTERVAL_SEC } else { "300" }
    UPLOAD_TIMEOUT_SEC = if ($existing.UPLOAD_TIMEOUT_SEC) { $existing.UPLOAD_TIMEOUT_SEC } else { "120" }
}

$out = foreach ($key in $lines.Keys) {
    $val = $lines[$key]
    if ($val) { "$key=$val" }
}

[System.IO.File]::WriteAllLines($envPath, $out)
Write-Host "Synced $envPath (SUPOCLIP_AUTH_SECRET from SupoClip, no BOM)."
