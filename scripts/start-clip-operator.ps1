$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectDir

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "Created .env.local from .env.example. Add your API keys if needed."
}

pnpm install
pnpm dev
