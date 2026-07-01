# Create venv, install deps, Playwright chromium
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

if (-not (Test-Path ".venv")) {
    py -3.11 -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        py -3 -m venv .venv
    }
}

& .\.venv\Scripts\pip.exe install -r requirements.txt
& .\.venv\Scripts\playwright.exe install chromium

if (-not (Test-Path ".env")) {
    Copy-Item .env.example .env
    Write-Host "Created .env - fill in secrets before running agent.py"
}

Write-Host "Setup complete. Edit .env, add cookies.txt, then: python agent.py"
