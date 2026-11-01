#!/usr/bin/env bash
# wait.sh <pageId> <provider-dir> [timeoutSec=600]
# MIN_COUNT=n: wait until read.js .count >= n (set it to the count before send + 1).
set -euo pipefail
[[ ${MIN_COUNT:-0} =~ ^[0-9]+$ ]] || { echo 'MIN_COUNT must be a number' >&2; exit 2; }
[[ $# -ge 2 && $# -le 3 && $1 =~ ^[0-9]+$ && ${3:-600} =~ ^[1-9][0-9]*$ ]] || { echo 'Usage: wait.sh <pageId> <provider-dir> [timeoutSec=600]' >&2; exit 2; }
page=$1
provider=$2
seconds=${3:-600}
base=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
limit=$(command -v gtimeout || command -v timeout)
deadline=$((SECONDS + seconds))
last=''
stable=0
poll() {
  local remaining=$((deadline - SECONDS))
  ((remaining > 0)) || return 124
  "$limit" "$remaining" "$base/js.sh" "$page" "$provider/js/$1.js"
}
while ((SECONDS < deadline)); do
  state=$(poll state) || exit $?
  if jq -e '.blocked != null' >/dev/null <<<"$state"; then printf '%s\n' "$state"; exit 3; fi
  if jq -e '.loggedIn == false' >/dev/null <<<"$state"; then printf '%s\n' "$state"; exit 4; fi
  answer=$(poll read) || exit $?
  text=$(jq -r '.text' <<<"$answer")
  if jq -e --argjson min "${MIN_COUNT:-0}" '(.count // 0) < $min' >/dev/null <<<"$answer"; then
    text=''
  fi
  if jq -e '.generating == false' >/dev/null <<<"$state" && [[ -n $text && $text == "$last" ]]; then
    stable=$((stable + 1))
    if ((stable >= 2)); then printf '%s\n' "$answer"; exit 0; fi
  else
    stable=0
  fi
  last=$text
  remaining=$((deadline - SECONDS))
  ((remaining > 0)) || break
  if ((remaining < 3)); then sleep "$remaining"; else sleep 3; fi
done
exit 124
