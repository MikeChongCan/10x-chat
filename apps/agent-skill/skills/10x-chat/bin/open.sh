#!/usr/bin/env bash
# open.sh <url> -> pageId
set -euo pipefail
[[ $# -eq 1 ]] || { echo 'Usage: open.sh <url>' >&2; exit 2; }
limit=$(command -v gtimeout || command -v timeout)
result=$("$limit" "${MC_TIMEOUT:-60}" bunx mcporter call chrome-existing.new_page \
  --args "$(jq -nc --arg url "$1" '{url:$url,background:true}')")
page=$(sed -nE 's/^[[:space:]]*([0-9]+):.*\[selected\].*/\1/p' <<<"$result")
[[ $page =~ ^[0-9]+$ ]] || { echo 'Could not find one selected page in new_page output' >&2; exit 1; }
printf '%s\n' "$page"
