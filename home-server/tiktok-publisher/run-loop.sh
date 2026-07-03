#!/usr/bin/env bash
# Poll clip-operator for publish jobs every POLL_INTERVAL_SEC (default 300).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

interval="${POLL_INTERVAL_SEC:-300}"
py="${here}/.venv/bin/python"
[[ -x "$py" ]] || py="python3"

echo "TikTok publisher loop (every ${interval}s). Ctrl+C to stop."
while true; do
  "$py" "$here/agent.py" || true
  sleep "$interval"
done
