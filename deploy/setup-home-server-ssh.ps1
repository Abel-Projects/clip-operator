# Run this ON THE HOME SERVER (RDP or at the keyboard) - NOT on your dev PC.
# Right-click PowerShell -> Run as Administrator, then:
#   powershell -ExecutionPolicy Bypass -File C:\clip-operator\deploy\setup-home-server-ssh.ps1
#
# Or paste the commands from deploy/HOME-SERVER.md if the repo isn't cloned yet.

$ErrorActionPreference = "Stop"

Write-Host "=== Home server SSH setup for Cursor ===" -ForegroundColor Cyan

# 1. OpenSSH Server
$cap = Get-WindowsCapability -Online | Where-Object { $_.Name -like "OpenSSH.Server*" }
if ($cap.State -ne "Installed") {
    Write-Host "Installing OpenSSH Server..."
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
}
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
Write-Host "OpenSSH Server: running" -ForegroundColor Green

# 2. Firewall (allow SSH on port 22)
if (Get-Command New-NetFirewallRule -ErrorAction SilentlyContinue) {
    $rule = Get-NetFirewallRule -DisplayName "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue
    if (-not $rule) {
        New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (sshd)" `
            -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
    }
}

# 3. Authorize dev PC key (clip-operator-oracle)
$publicKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKVsCTSlV6HvlHplKlgiWCiNyRxx6i6H+Bd7RNhgh+MI clip-operator-oracle"
$sshDir = Join-Path $env:USERPROFILE ".ssh"
$authKeys = Join-Path $sshDir "authorized_keys"
New-Item -ItemType Directory -Force -Path $sshDir | Out-Null

$content = if (Test-Path $authKeys) { Get-Content $authKeys -Raw } else { "" }
if ($content -notmatch "clip-operator-oracle") {
    Add-Content -Path $authKeys -Value $publicKey
    Write-Host "Added SSH public key to $authKeys" -ForegroundColor Green
} else {
    Write-Host "SSH key already present" -ForegroundColor Gray
}

# Windows OpenSSH requires strict ACLs on authorized_keys
icacls $authKeys /inheritance:r | Out-Null
icacls $authKeys /grant "${env:USERNAME}:(F)" | Out-Null
icacls $authKeys /grant "SYSTEM:(F)" | Out-Null
icacls $sshDir /inheritance:r | Out-Null
icacls $sshDir /grant "${env:USERNAME}:(OI)(CI)F" | Out-Null
icacls $sshDir /grant "SYSTEM:(OI)(CI)F" | Out-Null

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "User: $env:USERNAME"
Write-Host "Tailscale IP should be: 100.75.239.27"
Write-Host ""
Write-Host "From your dev PC, test:"
Write-Host "  ssh -i `$env:USERPROFILE\.ssh\id_ed25519 hunte@100.75.239.27 hostname"
Write-Host "(Use YOUR username here if not hunte)"
