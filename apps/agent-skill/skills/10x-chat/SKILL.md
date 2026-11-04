---
name: 10x-chat
description: Use web AI chat, research, images, or video through the user's Chrome. Route single-provider requests, parallel answers, login, blocked pages, model choice, and broken selectors to the matching skill.
---

# 10x-chat

Use the user's Chrome sessions. The agent is the harness. Skills hold the steps.
Small browser functions find their own elements and return JSON.

## Setup check

1. Check `bunx`, `jq`, and `gtimeout` or `timeout` with `command -v`.
2. Run `bunx mcporter list chrome-existing`. The server must use
   `npx chrome-devtools-mcp@latest --autoConnect`.
3. If Chrome is not connected, ask the user to allow remote debugging at
   `chrome://inspect/#remote-debugging`. See [setup](../../README.md).
4. Run `bunx mcporter call chrome-existing.list_pages`. On `DevToolsActivePort`
   `EPERM`, run `bunx mcporter daemon stop` and retry outside the sandbox.
5. Optional, preferred: the 10xWise bridge. Run `bridge/install.sh`, click
   Enable in the 10xWise options Agent bridge section, and turn on "Allow User
   Scripts" for 10xWise in `chrome://extensions`. Check with `bin/bridge.sh ping`.
   Open, JS, and select/close use the bridge. CDP is still needed for snapshot,
   click, and upload. Security: the bridge socket lets any process run by this
   user execute JS in any tab, same as CDP.

## Route by situation

| Situation | Load |
|---|---|
| Gemini chat, images, research | [10x-chat-gemini](../10x-chat-gemini/SKILL.md) |
| ChatGPT chat, images, research | [10x-chat-chatgpt](../10x-chat-chatgpt/SKILL.md) |
| Claude chat or analysis | [10x-chat-claude](../10x-chat-claude/SKILL.md) |
| Grok chat or images | [10x-chat-grok](../10x-chat-grok/SKILL.md) |
| Perplexity search or research | [10x-chat-perplexity](../10x-chat-perplexity/SKILL.md) |
| NotebookLM sources or grounded chat | [10x-chat-notebooklm](../10x-chat-notebooklm/SKILL.md) |
| Flow images or video | [10x-chat-flow](../10x-chat-flow/SKILL.md) |
| Dreamina video | [10x-chat-dreamina](../10x-chat-dreamina/SKILL.md) |
| `state.loggedIn=false` | [10x-chat-login](../10x-chat-login/SKILL.md) |
| `state.blocked != null` | [10x-chat-wait-user](../10x-chat-wait-user/SKILL.md) |
| `MODEL=best` or unknown model | [10x-chat-best-model](../10x-chat-best-model/SKILL.md) |
| One prompt to many providers | [parallel](references/parallel.md) |
| Broken browser function | [debug provider](references/debug-provider.md) |
| A confirmed lesson | [improve](references/improve.md) |

## Shared state contract

Every provider returns exactly these keys from its state helper:

```json
{"provider":"gemini","url":"https://gemini.google.com/app","loggedIn":true,"composer":true,"generating":false,"model":null,"blocked":null,"blockedText":null}
```

`model` is a string or null. `blockedText` is a string or null.
`blocked` is null, `captcha`, `verify`, `2fa`, `consent`, `quota`, `upgrade`, or `other`.
Check blocks before login. A blocked page can hide the composer.

## Helper contract

Build absolute paths from the loaded skill folder. Helpers accept a page ID.

```bash
"$ROUTER/bin/open.sh" 'https://gemini.google.com/app'
"$ROUTER/bin/js.sh" "$PAGE" "$PROVIDER/js/state.js"
"$ROUTER/bin/wait.sh" "$PAGE" "$PROVIDER" 600
```

`ROUTER` is this skill folder. `PROVIDER` is the chosen provider skill folder.
Set `PAGE` to the ID from open: `t<tabId>` on the bridge, a number on CDP.
Exit 69 from `bin/bridge.sh` means bridge unavailable; `TENX_BRIDGE=off` skips it.
Use `bin/page.sh select|close "$PAGE"` to focus or close a tab. For any
chrome-existing tool, pass `pageId` as `$("$ROUTER/bin/cdp-id.sh" "$PAGE")`.
`js.sh` reads a function from disk and sends its text as `function`.
It prints JSON. It does not use `sourcePath`.
`wait.sh` polls every 3 seconds. It requires nonempty text, no generation,
and two unchanged polls. Exit 3 means blocked; 4 means login; 124 means timeout.
Each call has a time limit. Tool errors remain errors.

Use [chat](references/chat.md) for `PROVIDER, PROMPT, FILES?, MODEL?`.
