@echo off
echo Requesting admin to finish WSL + Docker setup...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"H:\Projects\clip-operator\scripts\enable-wsl-and-reboot.ps1\"'"
pause
