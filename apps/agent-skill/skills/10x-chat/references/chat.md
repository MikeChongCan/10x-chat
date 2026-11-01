# Chat procedure

Method inputs: `PROVIDER`, `PROMPT`, optional `FILES`, optional `MODEL`.
Use absolute skill folders. Set `ROUTER` to the `10x-chat` folder.

1. Load the provider skill. Open its URL with `bin/open.sh` from ROUTER.
   Set `PAGE` to stdout. Read state with `bin/js.sh` and the provider state file.
2. Resolve blocks first, then login. Use the linked recovery skills.
   A missing composer after login can mean a home screen; follow provider steps.
3. If MODEL is set, select and verify it before sending. Use best-model for best
   or an unknown name. Otherwise keep the site's current model.
4. Set chat, image, research, or video mode and its options as requested.
   For controls without helpers, take_snapshot with pageId, then click with
   pageId and the current uid. Snapshot again to verify the requested settings.
5. For FILES, reveal the attachment control. Take a fresh snapshot. Call
   `bunx mcporter call chrome-existing.upload_file --args` with JSON containing
   `pageId`, the file input `uid`, and absolute `filePaths`. Wait for attachment
   thumbnails or source processing to finish. Use provider-specific source steps.
6. Save the baseline: `BASE=$("$ROUTER/bin/js.sh" "$PAGE" "$PROVIDER/js/read.js" | jq .count)`.
   Insert the full prompt:

   ```bash
   "$ROUTER/bin/js.sh" "$PAGE" "$PROVIDER/js/insert.js" "$(jq -nc --arg text "$PROMPT" '{text:$text}')"
   ```

   Require ok=true and len equal to the full prompt length. Use UTF-16 length
   when the prompt has emoji. Check a snapshot if insertion differs.
   Never use type_text for prompts: newline can submit early.
7. Run `bin/js.sh` with `js/send.js` from PROVIDER. Require ok=true.
   Wait for generation or a new assistant answer before starting the stability
   check. For Grok, confirm that the newest bubble is an assistant response.
   Do not mistake the prompt echo or the previous answer for completion.
8. Run `MIN_COUNT=$((BASE + 1)) "$ROUTER/bin/wait.sh" "$PAGE" "$PROVIDER" 600`.
   MIN_COUNT makes it skip the previous answer. For flow and dreamina, use
   `MIN_COUNT=1`: their read.js already skips videos that existed before send.
   Exit 3 loads wait-user. Exit 4 loads login. Exit 124 reports timeout.
   Other nonzero exits are tool errors; inspect them before retrying.
9. Return the answer with source links and media URLs. Preserve provider labels.
   For blob media, keep the tab open and use the site's download control.
   Remote media can need login cookies. Use the browser download control if a
   direct URL fails. Do not export cookies. For images, wait for full generation.
10. Close only tabs opened for this request, after capture or download, if the
    user does not need them. Every close_page call must include pageId.
