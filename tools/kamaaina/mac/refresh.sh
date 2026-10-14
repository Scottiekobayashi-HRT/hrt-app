#!/bin/bash
# Daily Kamaʻāina refresh on Scottie's Mac mini.
# HVCB answers cloud servers with "Access Denied", so this runs from home:
# real Google Chrome, home internet, one visit per page, spaced out.
# Pulls memberstack-sandbox, rebuilds hrt-app/data/kamaaina-deals.js, and
# pushes only if the deals changed. Cloudflare then redeploys the dashboard.
# If anything looks wrong (fewer than 40 HVCB offers), nothing is pushed and
# the site keeps its last good deals. Log: ~/Library/Logs/hrt-kamaaina.log
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO"
echo "=== $(date) ==="
git checkout -q memberstack-sandbox
git pull -q --rebase origin memberstack-sandbox

DEPS="$HOME/.hrt-kamaaina-deps"
if [ ! -d "$DEPS/node_modules/playwright" ]; then
  mkdir -p "$DEPS"
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --prefix "$DEPS" --no-save --no-package-lock playwright@1.48.2 >/dev/null
fi
export NODE_PATH="$DEPS/node_modules"
ln -sfn "$DEPS/node_modules" tools/kamaaina/node_modules

# The review tab's published CSV link goes in this file (one line). Optional.
SHEET_FILE="$HOME/.hrt-kamaaina-sheet-url"
[ -f "$SHEET_FILE" ] && export KAMAAINA_SHEET_CSV="$(head -1 "$SHEET_FILE")"

KAMAAINA_CHANNEL=chrome KAMAAINA_HEADED=1 node tools/kamaaina/scrape.mjs --out hrt-app/data/kamaaina-deals.js
rm -f tools/kamaaina/node_modules

f=hrt-app/data/kamaaina-deals.js
if git diff --quiet -I 'HRT_KAMAAINA_UPDATED' -- "$f"; then
  git checkout -- "$f"
  echo "Deals unchanged. Nothing to publish."
  exit 0
fi
git commit -q -m "Kamaaina deals: daily refresh from HVCB" -- "$f"
git push -q origin memberstack-sandbox
echo "Published."
