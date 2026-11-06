#!/usr/bin/env bash
# doctor.sh -> checks tools, the chrome-existing mcporter config, the Chrome connection, and the bridge.
# Prints one line per check and a fix for each failure. Exit 0 all ok, 1 a check failed.
set -uo pipefail
base=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
fail=0
ok() { echo "ok    $1"; }
bad() { echo "FAIL  $1"; echo "      fix: $2"; fail=1; }

for t in bunx jq; do
  command -v "$t" >/dev/null && ok "$t" || bad "$t missing" "install $t"
done
limit=$(command -v gtimeout || command -v timeout) && ok "timeout" ||
  { bad "gtimeout/timeout missing" "brew install coreutils"; exit 1; }

# The effective definition, after mcporter merges project and home config files.
if server=$(bunx mcporter config get chrome-existing --json 2>/dev/null) && jq -e .name >/dev/null 2>&1 <<<"$server"; then
  where=$(jq -r '.source.path // "config"' <<<"$server")
  jq -e '(.args // []) | index("--autoConnect")' <<<"$server" >/dev/null &&
    ok "chrome-existing uses --autoConnect ($where)" ||
    bad "chrome-existing in $where does not use --autoConnect" 'set args to ["chrome-devtools-mcp@latest", "--autoConnect"]'
  # Either the definition field or its env entry can turn the relay off. The daemon ignores caller shell env.
  policy=$(jq -r '.chromeDevtoolsRelay // .env.MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY // "unset"' <<<"$server")
  [[ $policy == off ]] && ok "relay policy off" ||
    bad "relay policy is $policy in $where; mcporter 0.17+ then needs an OpenClaw relay and calls fail with runtime_error" \
      "add \"env\": {\"MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY\": \"off\"} to chrome-existing in $where, then bunx mcporter daemon restart"
else
  bad "mcporter has no chrome-existing server" "merge the server from README.md into ~/.mcporter/mcporter.json"
fi

if "$limit" "${DOCTOR_TIMEOUT:-20}" bunx mcporter call chrome-existing.list_pages >/dev/null 2>&1; then
  ok "chrome-existing.list_pages"
else
  bad "chrome-existing.list_pages failed or waited ${DOCTOR_TIMEOUT:-20}s" \
    "fix any relay policy failure above; if you changed the config after the daemon started, run bunx mcporter daemon restart. Then allow remote debugging at chrome://inspect/#remote-debugging, click Allow on Chrome's \"Allow remote debugging?\" dialog, and retry"
fi

if ping=$("$base/bridge.sh" ping 2>/dev/null); then
  if [[ $(jq -r '.userScripts' <<<"$ping") != true ]]; then
    bad "10xWise bridge up but User Scripts off" 'turn on "Allow User Scripts" for 10xWise in chrome://extensions'
  elif [[ $(jq -r '.allUrls' <<<"$ping") != true ]]; then
    bad "10xWise bridge up but site access is limited; helpers fall back to CDP" \
      'enable Agent bridge again in 10xWise options to grant site access (<all_urls>)'
  else
    ok "10xWise bridge"
  fi
else
  echo "skip  10xWise bridge (optional, not running)"
fi
exit $fail
