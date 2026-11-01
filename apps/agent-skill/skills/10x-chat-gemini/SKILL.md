---
name: 10x-chat-gemini
description: Use gemini for chat, images, research in the user's Chrome. Load when the request names gemini or the router selects it.
---

# gemini

URL: https://gemini.google.com/app
Capabilities: chat, images, research.
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

Observed menu: 3.5 Flash-Lite, 3.8 Flash, 3.1 Pro, 4 Argon. Prefer Argon or Deep Think, then Pro, Thinking, Flash, Flash-Lite. Use the current menu as truth. Fast is a legacy alias for Flash-Lite. Thinking was a legacy alias for Flash; ask if this is unclear.

Open `js/open-models.js`, then list `js/models.js` and select with `js/pick-model.js`.
Use the shared best-model skill for ranking and cache rules.

## Known quirks

The mode menu is in `[popover]`, not just `.cdk-overlay-container`. The picker label can be "Open mode picker, currently Argon". Match names without version numbers. Answers are in `message-content`. Stop buttons and image/research progress mean generation is active. For images, wait for loading to finish. For research, use the tools menu, choose Deep Research, submit, then confirm Start research if shown.
