---
name: 10x-chat
description: Chat with web AI agents (ChatGPT, Gemini, Claude, Grok, Perplexity, NotebookLM) via browser automation. Use when stuck, need cross-validation, want a second-model review, need image generation, want deep research, or want to generate video (Google Flow/Veo, Dreamina/Seedance) from web AI tools.
---

# 10x-chat — AI Agent Skill

Use 10x-chat to send prompts to web-based AI agents via automated browser sessions. Supports chat, image generation, deep research, and video generation. Sessions use a shared persisted profile by default.

## Architecture (v0.9.0+)

10x-chat uses an **HTTP browser daemon** — a persistent local Node.js server wrapping Playwright:

- **One daemon, multiple sessions**: parallel CLI runs share a single Chrome instance via HTTP RPC
- **Auto-start/stop**: daemon launches on first use, shuts down after 30 min idle
- **Crash recovery**: if daemon dies, next CLI run auto-restarts it
- **No zombie Chrome**: proper tab ref-counting and graceful shutdown
- **State file**: `~/.10x-chat/browser-daemon.json` (port, PID, bearer token, chmod 600)

## Installation

No install needed. Always use `@latest`:

```bash
npx 10x-chat@latest --version
```

Use `npx` (not `bunx` — symlink conflicts in parallel).

## When to use

- **Stuck on a bug**: ask another model for a fresh perspective
- **Code review**: send PR diff to GPT / Claude / Gemini for cross-review
- **Cross-validation**: compare answers from multiple models
- **Knowledge gaps**: leverage a model with different training data
- **Image generation**: DALL-E via ChatGPT or Imagen via Gemini
- **Deep research**: long-form analysis via Perplexity, ChatGPT, or Gemini
- **Video generation**: text/image-to-video via Google Flow (Veo) or Dreamina (Seedance)

## Providers

| Provider | Chat | Image | Research | Video | Models | Notes |
|----------|------|-------|----------|-------|--------|-------|
| chatgpt | ✅ | ✅ (DALL-E) | ✅ | ❌ | — | Runs headed by default (anti-bot) |
| gemini | ✅ | ✅ (Imagen) | ✅ | ❌ | Flash-Lite, **Flash** (default), Pro, Argon, Deep Think (Ultra tool) | `--model` switches mode |
| claude | ✅ | ❌ | ❌ | ❌ | — | Runs headed by default |
| grok | ✅ | ✅ | ❌ | ❌ | — | UI changes often, use `@latest` |
| perplexity | ✅ | ❌ | ✅ | ❌ | — | Best for research with citations |
| notebooklm | ✅ | ❌ | ❌ | ❌ | — | Add sources first, then chat |
| flow | ❌ | ❌ | ❌ | ✅ (Veo) | **Omni Flash** (default), Veo 3.1 Lite/Fast/Quality | Google login (shared with Gemini) |
| dreamina | ❌ | ❌ | ❌ | ✅ (Seedance) | Seedance 2.0 Fast (default)/2.0; 1.x often plan-locked | `login dreamina` (CapCut); text + image-to-video |

## Commands

```bash
# Login (one-time per provider — opens browser for auth)
npx 10x-chat@latest login chatgpt
npx 10x-chat@latest login gemini
npx 10x-chat@latest login claude
npx 10x-chat@latest login grok
npx 10x-chat@latest login perplexity
npx 10x-chat@latest login notebooklm

# Chat
npx 10x-chat@latest chat -p "Review this code for bugs" --provider chatgpt --file "src/**/*.ts"
npx 10x-chat@latest chat --provider gemini --file "path/to/prompt.md" -p "Complete this task"
npx 10x-chat@latest chat --provider gemini --model Pro -p "Solve this math problem"
npx 10x-chat@latest chat --provider gemini --model "Deep Think" -p "Solve this hard problem"

# Multi-step provider delegate for external AI callers (JSONL over stdin/stdout)
npx 10x-chat@latest delegate gemini --model Pro
# then send JSON lines: {"action":"status"}, {"action":"submit","prompt":"..."}, {"action":"capture"}, {"action":"close"}

# Image generation
npx 10x-chat@latest image -p "A fox astronaut in space" --provider chatgpt
npx 10x-chat@latest image -p "Watercolor landscape" --provider gemini --save-dir ./images

# Deep research (long-form, 5-10 min)
npx 10x-chat@latest research -p "Latest breakthroughs in quantum computing" --provider perplexity
npx 10x-chat@latest research -p "Hard technical research" --provider gemini --model "Deep Think"
npx 10x-chat@latest research -p "Market analysis of EVs" --provider chatgpt --timeout 600000

# Video generation (Flow / Veo default, or Dreamina / Seedance)
npx 10x-chat@latest video -p "Drone shot over snowy peaks at sunrise" --provider flow
npx 10x-chat@latest video -p "She walks, TikTok style" --provider flow --orientation portrait --duration 8 --image ref.png  # 9:16 i2v
npx 10x-chat@latest video -p "Neon street, rain" --provider flow --model "Veo 3.1 - Quality" --duration 10
npx 10x-chat@latest login dreamina   # one-time CapCut login for Dreamina
npx 10x-chat@latest video -p "A paper boat in a rain gutter, macro" --provider dreamina --aspect 9:16 --dreamina-duration 4
npx 10x-chat@latest video -p "The glowing orb floats up" --provider dreamina --image ref.png --ref-mode omni

# Dry run / clipboard
npx 10x-chat@latest chat --dry-run -p "Debug this error" --file src/
npx 10x-chat@latest chat --copy -p "Explain this" --file "src/**"

# Provider chat history + local session management
npx 10x-chat@latest history --provider gemini
npx 10x-chat@latest history --provider all --limit 10
npx 10x-chat@latest status
npx 10x-chat@latest session <id> --render

# NotebookLM
npx 10x-chat@latest notebooklm list
npx 10x-chat@latest notebooklm create "My Research"
npx 10x-chat@latest notebooklm add-url <id> https://...
npx 10x-chat@latest notebooklm add-file <id> ./paper.pdf
npx 10x-chat@latest notebooklm sources <id>
npx 10x-chat@latest notebooklm summarize <id>

# Install bundled skill to coding agent
npx 10x-chat@latest skill install
```

## Provider delegate (v0.10.18+)

Use `delegate <provider>` when an external AI caller needs flexible multi-step control instead of a single one-shot `chat`, `image`, or `research` command. It opens one provider tab, keeps it alive, reads JSONL commands from stdin, and emits JSONL responses on stdout.

```bash
npx 10x-chat@latest delegate gemini --model Pro <<'EOF'
{"id":1,"action":"status"}
{"id":2,"action":"submit","prompt":"Draft three launch angles for this product."}
{"id":3,"action":"capture","timeoutMs":600000}
{"id":4,"action":"close"}
EOF

printf '%s\n' '{"action":"chat","model":"Thinking","prompt":"Review this pasted plan."}' \
  | npx 10x-chat@latest delegate gemini
```

Actions:
- `status`: return url/title/login state
- `goto`: navigate with `{ "url": "https://..." }`
- `selectModel`: provider UI model/mode switch with `{ "model": "Pro" }`
- `attach`: attach files with `{ "files": ["path/to/file.png"] }`
- `submit`: submit prompt without waiting
- `capture`: wait for and extract the current response
- `chat`: select optional model/files, submit, then capture
- `eval`: run a page evaluation script for inspection/debugging
- `close`: close the browser tab and end the delegate

Flags: `--model`, `--headed`, `--timeout <ms>`, `--isolated-profile`, `--no-login-check`.

## Parallel sessions (v0.9.0+)

HTTP daemon makes parallel runs stable. All providers share one Chrome:

```bash
# Login all once
npx 10x-chat@latest login gemini
npx 10x-chat@latest login claude
npx 10x-chat@latest login chatgpt

# Run concurrently — each opens a tab in the shared daemon
npx 10x-chat@latest chat --provider gemini -p "Your prompt" --file context.md &
npx 10x-chat@latest chat --provider claude -p "Your prompt" --file context.md &
npx 10x-chat@latest chat --provider chatgpt -p "Your prompt" --file context.md &
wait
```

## Browser mode

- **Headless (default for gemini, grok, perplexity)**: no visible window
- **Headed (default for chatgpt, claude)**: visible Chrome window (anti-bot protection)
- **Force headed**: `--headed` flag on any provider

The daemon stores the headless/headed mode in its state file. If you switch modes, the daemon restarts automatically.

## Profile modes

**Shared (default):** One browser profile, all providers share cookies. Login once per Google account covers Gemini + NotebookLM.

**Isolated:** Separate profile per provider (backward compat): `--isolated-profile`

```bash
# Migrate from isolated to shared
npx 10x-chat@latest migrate
```

## Daemon management

```bash
# Check daemon state
cat ~/.10x-chat/browser-daemon.json

# Force stop daemon
# (CLI calls stopDaemon() on Ctrl+C automatically)
kill $(cat ~/.10x-chat/browser-daemon.json | python3 -c "import sys,json; print(json.load(sys.stdin)['pid'])")
```

## Tips

- **Always use `@latest`**: ensures newest fixes
- **Login first**: `login <provider>` once per provider. Sessions persist in `~/.10x-chat/profiles/`
- **Use `--headed`** if a provider is flaky (Grok especially)
- **Keep file sets small**: fewer files + focused prompt = better answers
- **Research needs longer timeouts**: `--timeout 600000` for 10-min research jobs
- **Image gen can take 1-2 min**: use `--timeout 120000` when needed
- **Video gen can take 1-5 min**: Dreamina queues generations; keep the default 10-min timeout. For image-to-video, pass `--image` (Dreamina) or `--start-frame`/`--end-frame` with `--mode frames` (Flow)
- **Flow duration**: `--duration 4|6|8|10` sets clip length in seconds (default is whatever Flow's UI defaults to, currently 8s)
- **Dreamina duration**: use `--dreamina-duration` (not `--duration`) to avoid conflict with Flow's flag
- **Dreamina models are plan-gated**: `Seedance 2.0 Fast` (cheapest) and `2.0` are generally available; the CLI errors clearly if a requested model is locked
- **Use `--dry-run`** to preview what will be sent

## Known issues

- **Grok**: UI changes frequently. Always use `@latest`. Use `--headed` for best reliability
- **ChatGPT/Grok sessions expire quickly**: login again if you get "Not logged in" errors
- **Some provider UIs are flaky under automation**: retry with `--headed` before assuming a hard failure
- **Google session expires (Gemini, Flow, NotebookLM)**: all three share one Google login. If one says "Not logged in", run `login gemini` once. Check all with `login --status`

## Debugging a provider UI

When a selector stops working (for example, a model picker change), read the live page in your own
Chrome with Chrome DevTools MCP through mcporter (`chrome-existing` = `chrome-devtools-mcp --autoConnect`):

```bash
# 0. Check that mcporter knows the server (one-time)
bunx mcporter list chrome-existing

# 1. Find the page id of the provider tab: filter by URL
bunx mcporter call chrome-existing.list_pages | grep gemini.google.com

# 2. Read the page. Pass pageId on EVERY call.
bunx mcporter call chrome-existing.take_snapshot --args '{"pageId":263}' | grep -i "mode picker"
bunx mcporter call chrome-existing.evaluate_script \
  --args '{"pageId":263,"function":"() => ({ title: document.title, picker: document.querySelector(\"[aria-label*=picker]\")?.getAttribute(\"aria-label\") })"}'
# → {"title":"... - Google Gemini","picker":"Open mode picker, currently Argon"}
```

- One Chrome connection, no extra prompts: mcporter's daemon keeps `chrome-existing` running, so
  every `mcporter call` reuses the same chrome-devtools-mcp process and Chrome asks to allow it
  only once. Check with `bunx mcporter daemon status`. If Chrome asks on every call, put
  `MCPORTER_KEEPALIVE=chrome-existing` before the command.
- Page tools need `pageId` on every call. A call without it fails with
  `pageId: Invalid input: expected number`.
- `list_pages` and `take_snapshot` print a lot. Filter them with `grep`.
- If more than one tab matches, pick the chat tab, not a login or OAuth tab with the same host.
- Use `--args` JSON. The `key:value` form breaks on `=>` in a script. Inside the JSON, escape
  quotes as `\"`, and keep selectors simple (no spaces).
- `evaluate_script` can return an object; it comes back as JSON.
- Page ids change when tabs open or close. Run `list_pages` again before you use an id.
- This reads your real Chrome, not the 10x-chat profile. Login state can be different.
- Read only. Do not click or type in your own tabs, and only run scripts that read the page.
- If `chrome-existing` is missing, add it to `~/.mcporter/mcporter.json` as
  `npx chrome-devtools-mcp@latest --autoConnect`, and allow remote debugging in Chrome
  (`chrome://inspect/#remote-debugging`) when Chrome asks.

## Safety

- Never include credentials, API keys, or tokens in the bundled files
- The tool opens a real browser with real login state. Treat it like your own browser session
