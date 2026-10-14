#!/bin/bash
# One-time setup on the Mac mini: run the Kamaʻāina refresh every day at 5:45am.
#   bash ~/hrt-app/tools/kamaaina/mac/install.sh            install (and run once now)
#   bash ~/hrt-app/tools/kamaaina/mac/install.sh --remove   stop it
set -euo pipefail
LABEL="com.hawaiirewardtravel.kamaaina"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT="$(cd "$(dirname "$0")" && pwd)/refresh.sh"
LOG="$HOME/Library/Logs/hrt-kamaaina.log"

if [ "${1:-}" = "--remove" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true; rm -f "$PLIST"
  echo "Removed. Kamaʻāina deals will no longer refresh automatically."; exit 0
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v node >/dev/null || { echo "Node is not installed. Install it from https://nodejs.org (LTS), then run this again."; exit 1; }
[ -d "/Applications/Google Chrome.app" ] || { echo "Google Chrome is not in Applications. Install it, then run this again."; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$SCRIPT</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>5</integer><key>Minute</key><integer>45</integer></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Installed: Kamaʻāina deals refresh every day at 5:45am."
echo "Running it once now so you can see it work (a Chrome window opens for a minute or two)..."
bash "$SCRIPT" 2>&1 | tee -a "$LOG"
