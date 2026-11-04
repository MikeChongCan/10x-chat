#!/usr/bin/env bash
# bridge.sh <method> [params-json] -> result JSON through the 10xWise extension bridge.
# Exit 69 bridge unavailable, 124 timeout, 66 tab_gone, 78 user_scripts_off, 1 other errors.
set -euo pipefail
[[ $# -ge 1 && $# -le 2 ]] || { echo 'Usage: bridge.sh <method> [params-json]' >&2; exit 2; }
sock=${TENX_BRIDGE_SOCK:-$HOME/.10x-chat/bridge.sock}
params=${2:-'{}'}
jq empty <<<"$params"
ms=${BRIDGE_TIMEOUT_MS:-$((${MC_TIMEOUT:-60} * 1000))}
[[ -S $sock ]] || { echo 'bridge unavailable' >&2; exit 69; }
body=$(jq -nc --arg m "$1" --argjson p "$params" '{method:$m,params:$p}')
rc=0
reply=$(curl --unix-socket "$sock" -s --max-time $((ms / 1000 + 5)) -X POST \
  -H 'Content-Type: application/json' -H "X-Timeout-Ms: $ms" --data "$body" http://bridge/call) || rc=$?
((rc == 28)) && { echo 'bridge timeout' >&2; exit 124; }
((rc == 0)) && jq -e 'type == "object" and has("ok")' >/dev/null 2>&1 <<<"$reply" || {
  echo 'bridge unavailable' >&2
  exit 69
}
if jq -e '.ok == true' >/dev/null <<<"$reply"; then
  jq '.result' <<<"$reply"
  exit 0
fi
code=$(jq -r '.error.code // "error"' <<<"$reply")
jq -r '"bridge error: \(.error.code // "error"): \(.error.message // "")"' <<<"$reply" >&2
case $code in
  timeout) exit 124 ;;
  tab_gone) exit 66 ;;
  user_scripts_off) exit 78 ;;
  *) exit 1 ;;
esac
