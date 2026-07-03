#!/usr/bin/env bash
# Install TikTokAutoUploader into vendor/ (fast HTTP TikTok uploads).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

vendor="$here/vendor/TiktokAutoUploader"
repo="https://github.com/makiisthenes/TiktokAutoUploader.git"

if [[ ! -d "$vendor" ]]; then
  git clone "$repo" "$vendor"
else
  echo "TiktokAutoUploader already cloned; pulling latest..."
  git -C "$vendor" pull --ff-only
fi

cd "$vendor"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate
pip install -r requirements.txt

cd tiktok_uploader/tiktok-signature
npm install
npx playwright install chromium
cd "$vendor"

[[ -f .env ]] || cp -n .env.example .env 2>/dev/null || true
mkdir -p CookiesDir VideosDirPath output

echo ""
echo "TikTokAutoUploader ready."
echo "Next: log in once (opens Chrome):"
echo "  cd $vendor"
echo "  .venv/bin/python cli.py login -n YOUR_ACCOUNT_NAME"
echo "Then set TIKTOK_ACCOUNT_NAME=YOUR_ACCOUNT_NAME in .env"
