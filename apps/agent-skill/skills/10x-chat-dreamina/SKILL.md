---
name: 10x-chat-dreamina
description: Use dreamina for video in the user's Chrome. Load when the request names dreamina or the router selects it.
---

# dreamina

URL: https://dreamina.capcut.com/ai-tool/home?type=video
Capabilities: video.
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

Prefer newest unlocked Seedance, then Pro, then Fast for quality. Seedance 2.0 Fast is the cheapest default. Observed names: Seedance 2.0 Fast, 2.0, 1.5 Pro, 1.0, 1.0 Fast. Availability depends on the account.

Open `js/open-models.js`, then list `js/models.js` and select with `js/pick-model.js`.
Use the shared best-model skill for ranking and cache rules.

## Known quirks

A guest studio has a composer. Login needs a numeric balance at `#SiderMenuCredit`; feed avatars do not prove login. Use stable class fragments, not full hashed names. The prompt editor is the Describe your video editor, not the reference box. Toolbar model menus use `.lv-select[role="combobox"]`. Locked models have `lv-select-option-wrapper-disabled`; never select them. The combined aspect button can read `16:9720P`. Match `16:9` without a trailing word boundary. Open it with `js/open-aspect.js`, then snapshot and pick ratio and 720P/1080P chips. Set duration to 4–15s and reference mode to omni, frames, or multiframes as requested. Upload at most 12 reference images through upload_file with pageId, uid, filePaths; wait for thumbnails. Generate can navigate to `/ai-tool/generate`. Results must match the prompt in one `responsive-video-grid` record. Ignore existing video URLs and remove editor text when matching the record. A `capcutstatic.com` video is a loading spinner. Accept only a new `/video/` or blob URL in the matching record.
