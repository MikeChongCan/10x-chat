---
name: 10x-chat-flow
description: Use flow for images, video in the user's Chrome. Load when the request names flow or the router selects it.
---

# flow

URL: https://labs.google/fx/tools/flow
Capabilities: images, video.
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

Observed models: Omni Flash and Veo 3.1 Lite, Fast, Quality. For video quality, prefer newest Veo Quality, then Fast, then Lite. For images, use the image tab and its current model list.

Open `js/open-models.js`, then list `js/models.js` and select with `js/pick-model.js`.
Use the shared best-model skill for ranking and cache rules.

## Known quirks

Flow needs Google login. For chrome-existing take_snapshot, click, and upload_file, pass pageId as `$(../10x-chat/bin/cdp-id.sh "$PAGE")`. If the home screen has no composer, snapshot and click New project. Open the model pill `.sc-46973129-1`; older builds use a button with Veo, Video, or Nano Banana text. Choose Image or Video, then Ingredients or Frames. Set exact orientation 16:9 or 9:16; avoid the combined status pill. Counts are 1x, x2, x3, x4. Durations can be 4s, 6s, 8s, 10s. Open arrow_drop_down for the model if needed. Use Add Media then Upload image, or Start/End for frame uploads. Snapshot each input and use upload_file with pageId, uid, filePaths. Verify thumbnails before send. Send can be arrow_forward, Make clip, or Generate. Read returns new video URLs; use a snapshot to save images in Image mode.
