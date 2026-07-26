# Render one narrated Shark Tank lesson (if any are pending).
# Same env as run-once.ps1 (CLIP_OPERATOR_URL, secrets). Requires ffmpeg + edge-tts.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command python -ErrorAction SilentlyContinue) -and -not (Get-Command py -ErrorAction SilentlyContinue)) {
  Write-Host "Python not found." -ForegroundColor Red
  exit 1
}

$python = if (Get-Command python -ErrorAction SilentlyContinue) { "python" } else { "py -3" }
# Ensure edge-tts is available (idempotent)
& $python -m pip install --quiet edge-tts 2>$null

& $python lesson-agent.py
exit $LASTEXITCODE
