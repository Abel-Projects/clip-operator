# Install TikTokAutoUploader into vendor/ (fast HTTP TikTok uploads).
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$vendor = Join-Path $here "vendor\TiktokAutoUploader"
$repo = "https://github.com/makiisthenes/TiktokAutoUploader.git"

if (-not (Test-Path $vendor)) {
    git clone $repo $vendor
} else {
    Write-Host "TiktokAutoUploader already cloned; pulling latest..."
    Push-Location $vendor
    git pull --ff-only
    Pop-Location
}

Push-Location $vendor

if (-not (Test-Path ".venv")) {
    py -3.11 -m venv .venv
    if ($LASTEXITCODE -ne 0) { py -3 -m venv .venv }
}

& .\.venv\Scripts\pip.exe install -r requirements.txt

Push-Location "tiktok_uploader\tiktok-signature"
if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm install
    npx playwright install chromium
} else {
    Write-Warning "Node.js/npm not found. Install Node 18+ then re-run this script."
}
Pop-Location

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") { Copy-Item .env.example .env }
}

New-Item -ItemType Directory -Force -Path "CookiesDir", "VideosDirPath", "output" | Out-Null

Pop-Location

Write-Host ""
Write-Host "TikTokAutoUploader ready."
Write-Host "Next: log in once (opens Chrome):"
Write-Host "  cd $vendor"
Write-Host "  .\.venv\Scripts\python.exe cli.py login -n YOUR_ACCOUNT_NAME"
Write-Host "Then set TIKTOK_ACCOUNT_NAME=YOUR_ACCOUNT_NAME in .env"
