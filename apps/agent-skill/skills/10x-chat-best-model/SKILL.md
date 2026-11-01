---
name: 10x-chat-best-model
description: Select the best available provider model when MODEL=best or a model name is unknown. Inspect the menu, skip locked choices, verify state, and cache the result.
---

# Choose a model

Inputs: `PAGE`, provider name `NAME`, absolute `PROVIDER` folder, and `MODEL`.
Set `ROUTER` to the sibling `10x-chat` folder.

1. Read the provider's Model ranking section. NotebookLM has a managed model;
   follow its documented exception and return without menu calls.
2. Read `~/.cache/10x-chat/models.json` if it exists. Each entry has this shape:

   ```json
   {"gemini":{"date":"2026-11-01","items":["4 Argon"],"best":"4 Argon"}}
   ```

   Reuse `best` only for MODEL=best, a valid date less than 7 days old,
   and a matching provider. Refresh unknown names and stale or invalid entries.
3. Open the menu and list its items, even when using a cached choice:

   ```bash
   "$ROUTER/bin/js.sh" "$PAGE" "$PROVIDER/js/open-models.js"
   "$ROUTER/bin/js.sh" "$PAGE" "$PROVIDER/js/models.js"
   ```

4. Use the provider rules. General rule: highest version, then
   Pro/Ultra/Argon/Deep Think, Thinking, Flash, Lite. Skip locked or upgrade items.
   Skip settings such as Thinking level. If a cached best is absent or locked,
   rank the current menu. For an unknown requested name, report the valid names;
   ask the user to resolve ambiguity before selecting a substitute.
5. Set `PICK` to the exact chosen label. Select it:

   ```bash
   "$ROUTER/bin/js.sh" "$PAGE" "$PROVIDER/js/pick-model.js" "$(jq -nc --arg name "$PICK" '{name:$name}')"
   "$ROUTER/bin/js.sh" "$PAGE" "$PROVIDER/js/state.js"
   ```

   Require `ok=true` and `state.model` to show the selected name. Ignore version
   numbers and case when checking names. If selection fails, refresh once.
   If it fails again, use [debug provider](../10x-chat/references/debug-provider.md).
6. Set `ITEMS` to the JSON array returned by models and `BEST` to the ranked best.
   After verification, merge the entry. Preserve other providers:

   ```bash
   CACHE="$HOME/.cache/10x-chat/models.json"
   mkdir -p "$(dirname "$CACHE")"
   if [[ -f "$CACHE" ]]; then OLD=$(cat "$CACHE"); else OLD='{}'; fi
   NEXT=$(jq --arg provider "$NAME" --arg date "$(date -u +%F)" --arg best "$BEST" --argjson items "$ITEMS" '.[$provider] = {date:$date,items:$items,best:$best}' <<<"$OLD")
   printf '%s\n' "$NEXT" > "$CACHE"
   ```

   If the cache is malformed, rebuild it from the verified menu. A cache write
   failure does not change the selected model; report it and continue.
