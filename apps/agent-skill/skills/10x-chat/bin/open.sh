#!/usr/bin/env bash
# open.sh <url> -> pageId (t<tabId> through the bridge, or a CDP number)
set -euo pipefail
[[ $# -eq 1 ]] || { echo 'Usage: open.sh <url>' >&2; exit 2; }
base=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
if [[ ${TENX_BRIDGE:-} != off ]] && ping=$(BRIDGE_TIMEOUT_MS=5000 "$base/bridge.sh" ping 2>/dev/null); then
  if jq -e '.userScripts == true and .allUrls == true' >/dev/null <<<"$ping"; then
    result=$("$base/bridge.sh" new_page "$(jq -nc --arg url "$1" '{url:$url,background:true}')")
    tab=$(jq -r '.tabId' <<<"$result")
    [[ $tab =~ ^[0-9]+$ ]] || { echo 'Bridge new_page returned no tabId' >&2; exit 1; }
    printf 't%s\n' "$tab"
    exit 0
  fi
  jq -e '.userScripts == true' >/dev/null <<<"$ping" ||
    echo 'warning: 10xWise bridge is on, but user scripts are off. Turn on "Allow User Scripts" for 10xWise in chrome://extensions. Using CDP.' >&2
  jq -e '.allUrls == true' >/dev/null <<<"$ping" ||
    echo 'warning: 10xWise bridge is on, but site access (<all_urls>) is off. Enable Agent bridge again in 10xWise options. Using CDP.' >&2
fi
limit=$(command -v gtimeout || command -v timeout)
result=$("$limit" "${MC_TIMEOUT:-60}" bunx mcporter call chrome-existing.new_page \
  --args "$(jq -nc --arg url "$1" '{url:$url,background:true}')")
page=$(sed -nE 's/^[[:space:]]*([0-9]+):.*\[selected\].*/\1/p' <<<"$result")
[[ $page =~ ^[0-9]+$ ]] || { echo 'Could not find one selected page in new_page output' >&2; exit 1; }
printf '%s\n' "$page"
