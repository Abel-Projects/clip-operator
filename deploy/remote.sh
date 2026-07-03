#!/usr/bin/env bash
# Run a command on the home server via SSH.
# Usage: ./deploy/remote.sh "docker ps"
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
env_file="$here/home-server.env"

if [[ ! -f "$env_file" ]]; then
  echo "Missing deploy/home-server.env — copy from home-server.env.example" >&2
  echo "See deploy/HOME-SERVER.md" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$env_file"

host="${HOME_SERVER_SSH_HOST:-}"
if [[ -z "$host" ]]; then
  echo "HOME_SERVER_SSH_HOST not set" >&2
  exit 1
fi

echo "→ $host: $*"
ssh "$host" "$@"
