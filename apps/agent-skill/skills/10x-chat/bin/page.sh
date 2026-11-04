#!/usr/bin/env bash
# page.sh select|close <pageId|t<tabId>>
set -euo pipefail
[[ $# -eq 2 && $1 =~ ^(select|close)$ && $2 =~ ^(t[0-9]+|[0-9]+)$ ]] || { echo 'Usage: page.sh select|close <page>' >&2; exit 2; }
base=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
if [[ $2 == t* ]]; then
  exec "$base/bridge.sh" "$1_page" "$(jq -nc --argjson t "${2#t}" '{tabId:$t}')"
fi
limit=$(command -v gtimeout || command -v timeout)
if [[ $1 == select ]]; then
  args=$(jq -nc --argjson p "$2" '{pageId:$p,bringToFront:true}')
else
  args=$(jq -nc --argjson p "$2" '{pageId:$p}')
fi
"$limit" "${MC_TIMEOUT:-60}" bunx mcporter call "chrome-existing.$1_page" --args "$args"
