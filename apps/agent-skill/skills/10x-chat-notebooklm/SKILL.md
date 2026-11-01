---
name: 10x-chat-notebooklm
description: Use notebooklm for source management, grounded chat in the user's Chrome. Load when the request names notebooklm or the router selects it.
---

# notebooklm

URL: https://notebooklm.google.com/
Capabilities: source management, grounded chat.
Paths are relative to this skill's folder; build absolute paths from it.
Set `PROVIDER` to this folder and `ROUTER` to its sibling `10x-chat` folder.

## Steps

1. Follow [chat](../10x-chat/references/chat.md) with this provider.
2. Open the URL with `../10x-chat/bin/open.sh`. Keep the returned page ID.
3. Run `../10x-chat/bin/js.sh` with the page ID and `js/state.js`.
4. If `state.blocked` is set, load [wait-user](../10x-chat-wait-user/SKILL.md).
5. If `state.loggedIn=false`, load [login](../10x-chat-login/SKILL.md).
6. If `MODEL=best` or the name is unknown, load [best-model](../10x-chat-best-model/SKILL.md).
7. Apply the provider steps in Known quirks below. Check requested settings in a snapshot.
8. Run `js/insert.js` with `{"text":"the full prompt"}`. Check `ok=true` and `len`.
9. Run `js/send.js` once. Check `ok=true`. Keep the page open during generation.
10. Run `../10x-chat/bin/wait.sh` with the page ID and this folder.
    It runs `js/state.js` and `js/read.js`. Return the answer, links, and media URLs.
11. For a missing element or wrong result, use [debug provider](../10x-chat/references/debug-provider.md).

## Model ranking

NotebookLM chooses its model. No model picker helper is provided. For MODEL=best, report the managed model and keep it. For a named model, explain this limit before sending.

The model is managed by the site. No model helper files are needed.

## Known quirks

Google login is required. The old implementation used RPC; these DOM selectors need a live check if the UI changes. Open or create a notebook before chat. To add sources: take_snapshot with pageId; find Add sources; click its uid with pageId; choose the file, URL, or pasted text option. For files, use upload_file with pageId, the input uid, and filePaths. Wait until source processing ends. Select the sources, then check the composer. Read `.to-user-container .message-text-content`. Keep source citations in the answer.
