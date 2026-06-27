Set-Location "H:\Projects\clip-operator"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
pnpm dev *> "H:\Projects\clip-operator\logs\dev-server.log"
