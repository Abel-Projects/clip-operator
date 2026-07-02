#!/usr/bin/env bash
# Trigger one autopilot tick. Use from cron / a systemd timer, or manually.
#
#   CLIP_OPERATOR_URL=http://localhost:3000 CRON_SECRET=xxx ./trigger-autopilot.sh
#
set -euo pipefail

BASE_URL="${CLIP_OPERATOR_URL:-http://localhost:3000}"
SECRET="${CRON_SECRET:-}"

if [[ -z "${SECRET}" ]]; then
  echo "CRON_SECRET is required" >&2
  exit 1
fi

curl -fsS -X POST "${BASE_URL%/}/api/cron/autopilot" \
  -H "Authorization: Bearer ${SECRET}"
echo
