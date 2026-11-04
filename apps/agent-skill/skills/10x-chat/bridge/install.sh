#!/usr/bin/env bash
# install.sh [--browser chrome|chrome-for-testing|chromium] [--extension-id ID]... [--uninstall]
# Installs the 10xWise native messaging host (com.tenxwise.bridge) for this user.
set -euo pipefail
name=com.tenxwise.bridge
browser=chrome
ids=(jamoinmdfbdocjnggffobhmpogbolncp)
uninstall=0
while (($#)); do
  case $1 in
    --browser) browser=${2:?--browser needs a value}; shift 2 ;;
    --extension-id) [[ ${2:-} =~ ^[a-p]{32}$ ]] || { echo "Bad extension id: ${2:-}" >&2; exit 2; }; ids+=("$2"); shift 2 ;;
    --uninstall) uninstall=1; shift ;;
    -h|--help) sed -n 2,3p "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
case "$(uname -s)/$browser" in
  Darwin/chrome) dir="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" ;;
  Darwin/chrome-for-testing) dir="$HOME/Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts" ;;
  Darwin/chromium) dir="$HOME/Library/Application Support/Chromium/NativeMessagingHosts" ;;
  Linux/chrome) dir="$HOME/.config/google-chrome/NativeMessagingHosts" ;;
  Linux/chrome-for-testing) dir="$HOME/.config/google-chrome-for-testing/NativeMessagingHosts" ;;
  Linux/chromium) dir="$HOME/.config/chromium/NativeMessagingHosts" ;;
  *) echo "Unsupported OS or browser: $(uname -s)/$browser" >&2; exit 2 ;;
esac
hostdir="$HOME/.10x-chat/host"
manifest="$dir/$name.json"
if ((uninstall)); then
  rm -f "$manifest"
  echo "Removed $manifest"
  for other in \
    "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" \
    "$HOME/Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts" \
    "$HOME/Library/Application Support/Chromium/NativeMessagingHosts" \
    "$HOME/.config/google-chrome/NativeMessagingHosts" \
    "$HOME/.config/google-chrome-for-testing/NativeMessagingHosts" \
    "$HOME/.config/chromium/NativeMessagingHosts"; do
    [[ -e $other/$name.json ]] && { echo "Kept $hostdir (still used by $other/$name.json)"; exit 0; }
  done
  rm -rf "$hostdir"
  echo "Removed $hostdir"
  exit 0
fi
bun=$(command -v bun || true)
[[ -n $bun ]] || { echo 'bun not found on PATH. Install Bun from https://bun.sh, then run this again.' >&2; exit 1; }
bun=$(cd "$(dirname "$bun")" && pwd)/$(basename "$bun")
src=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
mkdir -p "$hostdir" "$dir"
chmod 700 "$HOME/.10x-chat"
cp "$src/host.ts" "$src/framing.ts" "$hostdir/"
printf '#!/bin/bash\nexec "%s" "%s"\n' "$bun" "$hostdir/host.ts" >"$hostdir/run"
chmod 755 "$hostdir/run"
origins=$(printf 'chrome-extension://%s/\n' "${ids[@]}" | jq -R . | jq -s .)
jq -n --arg name "$name" --arg path "$hostdir/run" --argjson origins "$origins" \
  '{name:$name,description:"10xWise agent bridge",path:$path,type:"stdio",allowed_origins:$origins}' >"$manifest"
echo "Copied host.ts and framing.ts to $hostdir"
echo "Wrote $hostdir/run (bun: $bun)"
echo "Wrote $manifest"
echo "Allowed origins: ${ids[*]}"
echo 'Next: open 10xWise options, enable Agent bridge, and turn on "Allow User Scripts" for 10xWise in chrome://extensions.'
