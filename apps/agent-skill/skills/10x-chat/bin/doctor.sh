#!/usr/bin/env bash
# doctor.sh -> checks tools, the chrome-existing mcporter config, the relay route, and the bridge.
# Prints one line per check and a fix for each failure. Exit 0 all ok, 1 a check failed.
set -uo pipefail
cfg=${MCPORTER_CONFIG:-$HOME/.mcporter/mcporter.json}
base=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
fail=0
ok() { echo "ok    $1"; }
bad() { echo "FAIL  $1"; echo "      fix: $2"; fail=1; }

for t in bunx jq; do
  command -v "$t" >/dev/null && ok "$t" || bad "$t missing" "install $t"
done
command -v gtimeout >/dev/null || command -v timeout >/dev/null && ok "timeout" ||
  bad "gtimeout/timeout missing" "brew install coreutils"

server=$(jq -c '.mcpServers["chrome-existing"] // empty' "$cfg" 2>/dev/null)
if [[ -z $server ]]; then
  bad "no chrome-existing server in $cfg" "merge the server from README.md into $cfg"
else
  jq -e '.args | index("--autoConnect")' <<<"$server" >/dev/null &&
    ok "chrome-existing uses --autoConnect" ||
    bad "chrome-existing does not use --autoConnect" 'set args to ["chrome-devtools-mcp@latest", "--autoConnect"]'
  policy=$(jq -r '.env.MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY // "unset"' <<<"$server")
  [[ $policy == off ]] && ok "relay policy off" ||
    bad "relay policy is $policy; mcporter 0.17+ then needs an OpenClaw relay and calls fail with runtime_error" \
      "add \"env\": {\"MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY\": \"off\"} to chrome-existing, then bunx mcporter daemon restart"
fi

status=$(bunx mcporter daemon status 2>&1 || true)
if grep -q 'chrome relay: route=unavailable' <<<"$status"; then
  bad "running daemon still routes through the relay ($(grep -o 'reason=[a-z-]*' <<<"$status" | head -1))" \
    "bunx mcporter daemon restart (the daemon reads the config at start)"
else
  ok "daemon relay route"
fi

limit=$(command -v gtimeout || command -v timeout)
if "$limit" "${DOCTOR_TIMEOUT:-20}" bunx mcporter call chrome-existing.list_pages >/dev/null 2>&1; then
  ok "chrome-existing.list_pages"
else
  bad "chrome-existing.list_pages failed or waited ${DOCTOR_TIMEOUT:-20}s" \
    "allow remote debugging at chrome://inspect/#remote-debugging and click Allow on Chrome's \"Allow remote debugging?\" dialog, then retry"
fi

if ping=$("$base/bridge.sh" ping 2>/dev/null); then
  [[ $(jq -r '.userScripts' <<<"$ping") == true ]] && ok "10xWise bridge" ||
    bad "10xWise bridge up but User Scripts off" 'turn on "Allow User Scripts" for 10xWise in chrome://extensions'
else
  echo "skip  10xWise bridge (optional, not running)"
fi
exit $fail
