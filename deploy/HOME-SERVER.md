# Permanent home server access for Cursor

Dev machines (PC, Mac, phone) are **not** the home server. This doc sets up access once so every future Cursor session knows how to deploy.

## Architecture

```
  Dev machines (Cursor)          Home server (24/7)           Vercel
  ─────────────────────          ──────────────────           ──────
  git push ───────────────────────────────────────────────▶ app host
  SSH (Tailscale) ──▶ SupoClip, publisher, Docker
  Cloud Cursor ──▶ GitHub ──▶ self-hosted runner on home server
```

---

## Part 1 — One-time on the home server

### A. Tailscale (if not already)

Install and sign in on the home server. Enable **MagicDNS** in the Tailscale admin console so the box has a stable name like `home-server.tailXXXX.ts.net`.

Note the machine name — you'll use it for SSH.

### B. OpenSSH (Windows home server)

PowerShell **as Administrator**:

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
```

Allow SSH through firewall if prompted.

### C. Dedicated `cursor` user (recommended)

On the home server, create a user for agent/deploy access with a fixed repo path:

```powershell
# Adjust paths for your setup
$repo = "C:\clip-operator"
git clone https://github.com/Abel-Projects/clip-operator.git $repo
```

Add your **public** SSH key to the account you will SSH as (`~/.ssh/authorized_keys` or `C:\Users\YOURUSER\.ssh\authorized_keys`).

### D. GitHub self-hosted runner (for Cloud Cursor)

Cloud agents cannot join your Tailscale network. A runner on the home server runs deploy steps when you push to `main`.

On the home server:

1. GitHub → **Abel-Projects/clip-operator** → Settings → Actions → Runners → **New self-hosted runner**
2. Follow GitHub's Windows (or Linux) install commands on the home server
3. Label the runner `home-server` (matches the workflow file)

After this, any Cursor Cloud session that pushes to `main` can trigger a deploy without SSH.

---

## Part 2 — One-time on each dev machine (PC, Mac)

### A. Tailscale

Install Tailscale and sign in to the **same tailnet** as the home server.

### B. SSH key (if you don't have one)

```powershell
# Windows PowerShell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\id_ed25519_clip -N '""'
```

Copy the **public** key to the home server's `authorized_keys`:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519_clip.pub
# paste into home server authorized_keys
```

### C. SSH config

Copy the template and fill in your values:

```powershell
copy deploy\ssh-config.example $env:USERPROFILE\.ssh\config.clip-operator
# Edit HostName (Tailscale name or 100.x.x.x), User, IdentityFile
```

Merge into `~/.ssh/config` or include it:

```
Include ~/.ssh/config.clip-operator
```

Test:

```powershell
ssh clip-home "hostname"
```

### D. Project connection file

```powershell
copy deploy\home-server.env.example deploy\home-server.env
notepad deploy\home-server.env
```

Fill in `HOME_SERVER_SSH_HOST`, `HOME_SERVER_USER`, `HOME_SERVER_REPO_PATH`.

`deploy/home-server.env` is gitignored — each dev machine has its own copy.

---

## Part 3 — Daily use (Cursor agent)

**Local Cursor** — run remote commands:

```powershell
.\deploy\remote.ps1 "docker ps"
.\deploy\remote.ps1 "cd C:\clip-operator && git pull"
```

**Cloud Cursor** — push to `main`; the self-hosted runner executes `.github/workflows/deploy-home-server.yml` on the home server.

**Manual full install** on home server only:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/install-windows-home-server.ps1
```

---

## What gets remembered

| Stored where | What |
|--------------|------|
| `.cursor/rules/home-server.mdc` | Architecture + agent instructions (in git, all devices) |
| `deploy/HOME-SERVER.md` | This setup guide (in git) |
| `deploy/home-server.env` | Your SSH host/user/path (gitignored, per machine) |
| `~/.ssh/config` | SSH connection (per machine, not in git) |
| GitHub runner on home server | Cloud deploy path (persistent on server) |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ssh clip-home` times out | Tailscale not running on one side; check `tailscale status` |
| Cloud agent can't SSH | Expected — use git push + self-hosted runner |
| Vercel can't reach SupoClip | Separate issue — prefer outbound clip worker (roadmap) or Tailscale Funnel on 8000 only for Vercel |
| Permission denied (publickey) | Re-copy public key to home server `authorized_keys` |
