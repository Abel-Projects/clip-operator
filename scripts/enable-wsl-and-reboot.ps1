# Enables WSL + Virtual Machine Platform, then reboots so Docker can run.
# Must run as Administrator.

$ErrorActionPreference = "Stop"

Write-Host "Enabling WSL and Virtual Machine Platform..."
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

Write-Host "Installing WSL..."
wsl --install --no-distribution

Write-Host "Registering bootstrap task for next login..."
$taskName = "ClipOperatorBootstrap"
$script = "H:\Projects\clip-operator\scripts\bootstrap-all.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host "Rebooting in 60 seconds to finish setup. Cancel with: shutdown /a"
shutdown /r /t 60 /c "Finishing Clip Operator setup (WSL + Docker). Bootstrap runs automatically after login."
