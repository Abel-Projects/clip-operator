$ErrorActionPreference = "Stop"

function Get-EnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path $Path)) { return $null }
  foreach ($line in Get-Content $Path) {
    if ($line -match "^\s*$Name=(.*)$") {
      return $Matches[1].Trim().Trim('"')
    }
  }
  return $null
}

function Set-EnvValue([string]$Path, [string]$Name, [string]$Value) {
  $lines = if (Test-Path $Path) { Get-Content $Path } else { @() }
  $pattern = "^\s*$([regex]::Escape($Name))="
  $updated = $false
  $result = foreach ($line in $lines) {
    if ($line -match $pattern) {
      $updated = $true
      "$Name=$Value"
    } else {
      $line
    }
  }
  if (-not $updated) {
    $result += "$Name=$Value"
  }
  Set-Content -Path $Path -Value $result
}

$ClipEnv = "H:\Projects\clip-operator\.env.local"
$SupoEnv = "H:\Projects\supoclip\.env"
$GeminiKey = Get-EnvValue $ClipEnv "GEMINI_API_KEY"
$AuthSecret = "supoclip_dev_backend_secret_change_me"

if ($GeminiKey) {
  Set-EnvValue $SupoEnv "GOOGLE_API_KEY" $GeminiKey
  Set-EnvValue $SupoEnv "LLM" "google-gla:gemini-3-flash-preview"
}

Set-EnvValue $SupoEnv "BETTER_AUTH_SECRET" "supoclip_dev_secret_change_in_production"
Set-EnvValue $SupoEnv "BACKEND_AUTH_SECRET" $AuthSecret
Set-EnvValue $SupoEnv "SELF_HOST" "true"

Set-EnvValue $ClipEnv "SUPOCLIP_BASE_URL" "http://localhost:8000"
Set-EnvValue $ClipEnv "SUPOCLIP_FRONTEND_URL" "http://localhost:3107"
Set-EnvValue $ClipEnv "SUPOCLIP_AUTH_SECRET" $AuthSecret

$ExistingUserId = Get-EnvValue $ClipEnv "SUPOCLIP_USER_ID"
if (-not $ExistingUserId) {
  $email = "clip-operator@abel.local"
  $password = "ClipOperator123!"
  $signupBody = @{ email = $email; password = $password; name = "Clip Operator" } | ConvertTo-Json
  for ($i = 1; $i -le 12; $i++) {
    try {
      $signup = Invoke-RestMethod -Uri "http://localhost:3107/api/auth/sign-up/email" -Method POST -ContentType "application/json" -Body $signupBody -ErrorAction Stop
      if ($signup.user.id) {
        Set-EnvValue $ClipEnv "SUPOCLIP_USER_ID" $signup.user.id
        Write-Host "Created SupoClip user $email"
        break
      }
    } catch {
      $detail = $_.ErrorDetails.Message
      if ($detail -match "already") {
        $DockerExe = "D:\Program Files\Docker\Docker\resources\bin\docker.exe"
        if (-not (Test-Path $DockerExe)) { $DockerExe = "C:\Program Files\Docker\Docker\resources\bin\docker.exe" }
        $userId = & $DockerExe exec supoclip-postgres psql -U supoclip -d supoclip -tAc "select id from \"user\" where email='$email' limit 1;"
        $userId = $userId.Trim()
        if ($userId) {
          Set-EnvValue $ClipEnv "SUPOCLIP_USER_ID" $userId
          Write-Host "Reused existing SupoClip user $email"
        }
        break
      }
      Start-Sleep -Seconds 5
    }
  }
}

Write-Host "Updated SupoClip and clip-operator env files."
