#!/usr/bin/env bash
# cdp-id.sh <pageId|t<tabId>> -> the CDP pageId of the same tab
set -euo pipefail
[[ $# -eq 1 && $1 =~ ^(t[0-9]+|[0-9]+)$ ]] || { echo 'Usage: cdp-id.sh <page>' >&2; exit 2; }
[[ $1 == t* ]] || { printf '%s\n' "$1"; exit 0; }
base=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
limit=$(command -v gtimeout || command -v timeout)
token=tenx-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
"$base/bridge.sh" evaluate "$(jq -nc --argjson t "${1#t}" --arg c "window.__tenxToken = \"$token\"" '{tabId:$t,code:$c}')" >/dev/null
probe=$(mktemp "${TMPDIR:-/tmp}/tenx-probe.XXXXXX")
trap 'rm -f "$probe"' EXIT
echo '() => window.__tenxToken ?? null' >"$probe"
url=$("$base/bridge.sh" list_pages | jq -r --argjson t "${1#t}" '.[] | select(.tabId == $t) | .url' | head -n1)
pages=$("$limit" "${MC_TIMEOUT:-60}" bunx mcporter call chrome-existing.list_pages)
# Lines look like "1: https://a.test/ [selected]". Probe same-URL pages first; else probe all.
all=$(sed -nE 's/^[[:space:]]*([0-9]+):.*/\1/p' <<<"$pages")
same=$(awk -v u="$url" '{ id = $1; sub(/:$/, "", id) } id ~ /^[0-9]+$/ && $2 == u { print id }' <<<"$pages")
[[ -n $url && -n $same ]] && candidates=$same || candidates=$all
found=()
for id in $candidates; do
  value=$("$base/js.sh" "$id" "$probe" 2>/dev/null || true)
  [[ $(jq -r 'select(type == "string")' <<<"$value" 2>/dev/null) == "$token" ]] && found+=("$id")
done
[[ ${#found[@]} -eq 1 ]] || { echo "Expected one CDP page for $1, found ${#found[@]}" >&2; exit 1; }
printf '%s\n' "${found[0]}"
