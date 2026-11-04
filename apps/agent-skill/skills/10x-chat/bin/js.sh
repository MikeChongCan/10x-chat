#!/usr/bin/env bash
# js.sh <pageId|t<tabId>> <file.js> [json-arg]
set -euo pipefail
[[ $# -ge 2 && $# -le 3 && $1 =~ ^(t[0-9]+|[0-9]+)$ ]] || { echo 'Usage: js.sh <pageId> <file.js> [json-arg]' >&2; exit 2; }
page=$1
file=$2
arg=${3:-null}
jq empty <<<"$arg"
limit=$(command -v gtimeout || command -v timeout)
# Encode the argument as a string, then parse it in the page. Never splice code from it.
encoded=$(jq -nc --argjson value "$arg" '$value | tojson')
source=$(cat "$file")
source=${source%;}
if [[ $page == t* ]]; then
  base=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  code="($source)(JSON.parse($encoded))"
  exec "$base/bridge.sh" evaluate "$(jq -nc --argjson t "${page#t}" --arg c "$code" '{tabId:$t,code:$c}')"
fi
fn="() => ($source)(JSON.parse($encoded))"
result=$("$limit" "${MC_TIMEOUT:-60}" bunx mcporter call chrome-existing.evaluate_script \
  --args "$(jq -nc --arg f "$fn" --argjson p "$page" '{pageId:$p,function:$f}')" --output json)
# mcporter can return the value, an MCP content envelope, or the tool's fenced text.
jq -e '
  def decode:
    if type == "string" then
      (try fromjson catch (capture("```(?:json)?\\s*\\n(?<value>[\\s\\S]*?)\\n```").value | fromjson))
    elif type == "object" and has("content") then
      if .isError == true then error("evaluate_script failed")
      else [.content[] | select(.type == "text") | .text | decode] | last end
    else . end;
  decode
' <<<"$result"
