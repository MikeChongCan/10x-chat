---
name: 10x-chat-chatgpt
description: Use chatgpt for chat, images, research in the user's Chrome. Load when the request names chatgpt or the router selects it.
---

# chatgpt

URL: https://chatgpt.com
Capabilities: chat, images, research.
Paths are relative to this skill's folder; build absolute paths from it.
Set `PROVIDER` to this folder and `ROUTER` to its sibling `10x-chat` folder.

## Steps

1. Follow [chat](../10x-chat/references/chat.md) with this provider.
2. Open the URL with `../10x-chat/bin/open.sh`. Keep the returned page ID.
3. Run `../10x-chat/bin/js.sh` with the page ID and `js/state.ts`.
4. If `state.blocked` is set, load [wait-user](../10x-chat-wait-user/SKILL.md).
5. If `state.loggedIn=false`, load [login](../10x-chat-login/SKILL.md).
6. If `MODEL=best` or the name is unknown, load [best-model](../10x-chat-best-model/SKILL.md).
7. Apply the provider steps in Known quirks below. Check requested settings in a snapshot.
8. Run `js/insert.ts` with `{"text":"the full prompt"}`. Check `ok=true` and `len`.
9. Run `js/send.ts` once. Check `ok=true`. Keep the page open during generation.
   If it returns `ok=false` with `menuOpen=true`, it pressed Escape on the open menu and clicked nothing: run it once more.
10. Run `../10x-chat/bin/wait.sh` with the page ID and this folder.
    It runs `js/state.ts` and `js/read.ts`. Return the answer, links, and media URLs.
11. For a missing element or wrong result, use [debug provider](../10x-chat/references/debug-provider.md).

## Model ranking

Prefer Pro, then Thinking, then Instant within the newest model family. Use only entries the account can select.

The model button can be "Select ChatGPT model". Its menu can hold only a "Power" slider (1 of 5 = Instant ... Extra High) and no model list. Then focus the Power menuitem (snapshot uid) and press ArrowLeft or ArrowRight with `chrome-existing.press_key`; read the level from its description. Low thinking = Instant.

Open `js/open-models.ts`, then list `js/models.ts` and select with `js/pick-model.ts`.
Use the shared best-model skill for ranking and cache rules.

## Known quirks

Close the model/Power menu (Escape) before `send.ts`; an open menu hides the send button.

A hidden fallback textarea can precede the real composer. Use the visible editor. The no-auth overlay can remain above a logged-in editor. Inspect `#modal-no-auth-login` and `#modal-onboarding`; use the visible Close or Skip control for onboarding. Route consent or account requests to wait-user. Do not remove the overlay or type through it. For images or Deep research, select the tool in the composer menu before insertion. Confirm a research plan if shown.
