# 10x-chat

> Chat with web AI agents (ChatGPT, Gemini, Claude, Grok, Perplexity, NotebookLM) from your terminal via browser automation.

**English** | [繁體中文](./README-zh.md)

10x-chat uses [Playwright](https://playwright.dev) to automate browser sessions with persisted login profiles. Login once, then send prompts — bundled with file context — from your CLI or AI coding agent.

## Use with OpenClaw

Paste this into your [OpenClaw](https://openclaw.ai) chat to install as a skill:

```
https://raw.githubusercontent.com/MikeChongCan/10x-chat/refs/heads/main/skills/10x-chat/SKILL.md
```

## Quick Start

```bash
npx playwright install chromium  # one-time browser setup

# 1. Login to a provider (opens a browser window)
npx 10x-chat@latest login chatgpt

# 2. Send a prompt
npx 10x-chat@latest chat -p "Explain this error" --provider chatgpt --file "src/**/*.ts"

# 3. View session history
npx 10x-chat@latest status
```

> [!TIP]
> Use `bunx` (bun.sh) instead of `npx` for faster startup.

## Commands

### `login <provider>`

Opens a headed browser for you to authenticate. The session persists across runs.

```bash
npx 10x-chat@latest login chatgpt       # Login to ChatGPT
npx 10x-chat@latest login gemini         # Login to Gemini
npx 10x-chat@latest login claude         # Login to Claude
npx 10x-chat@latest login grok           # Login to Grok
npx 10x-chat@latest login perplexity     # Login to Perplexity
npx 10x-chat@latest login notebooklm     # Login to NotebookLM
npx 10x-chat@latest login dreamina       # Login to Dreamina (CapCut) for video
npx 10x-chat@latest login --status       # Check login status for all providers
```

> Google Flow (Veo) video uses your Google login — logging into Gemini covers it in shared-profile mode.

### `chat`

Send a prompt to an AI provider via browser automation.

```bash
npx 10x-chat@latest chat -p "Review this code for bugs" --provider chatgpt --file "src/**/*.ts"
npx 10x-chat@latest chat -p "Debug this error" --file "logs/error.log"
npx 10x-chat@latest chat -p "Explain this" --dry-run              # Preview bundle without sending
npx 10x-chat@latest chat -p "Explain this" --copy                  # Copy bundle to clipboard
npx 10x-chat@latest chat -p "Long task" --timeout 600000 --headed  # 10min timeout, visible browser
```

| Flag | Description |
|------|-------------|
| `-p, --prompt <text>` | **(required)** The prompt to send |
| `--provider <name>` | Provider: `chatgpt`, `gemini`, `claude`, `grok`, `perplexity`, `notebooklm` (default: config) |
| `--model <name>` | Model/mode to select in the provider UI (e.g. Gemini: `Fast`, `Thinking`, `Deep Think`, `Pro`) |
| `-f, --file <paths...>` | Files/globs to bundle as context |
| `--copy` | Copy bundle to clipboard instead of sending |
| `--dry-run` | Preview the bundle without sending |
| `--headed` | Show browser window during chat |
| `--timeout <ms>` | Response timeout in milliseconds (default: 300000) |

### `delegate <provider>`

Start a provider-specific JSONL delegate for external AI callers that need multi-step control instead of a single one-shot prompt. The delegate opens the provider once, keeps the tab alive, then reads JSON commands from stdin and writes JSON responses to stdout.

```bash
# One long-lived provider session controlled over JSONL
npx 10x-chat@latest delegate gemini --model Pro <<'EOF'
{"id":1,"action":"status"}
{"id":2,"action":"submit","prompt":"Draft three launch angles for this product."}
{"id":3,"action":"capture","timeoutMs":600000}
{"id":4,"action":"close"}
EOF

# Convenience combined action: select model/files, submit, capture
printf '%s\n' '{"action":"chat","model":"Thinking","prompt":"Review this pasted plan."}' \
  | npx 10x-chat@latest delegate gemini
```

Supported actions: `status`, `goto`, `selectModel`, `attach`, `submit`, `capture`, `chat`, `eval`, `close`.

| Flag | Description |
|------|-------------|
| `--model <name>` | Select a model/mode immediately after opening |
| `--headed` | Show browser window |
| `--timeout <ms>` | Default capture timeout |
| `--isolated-profile` | Use per-provider browser profile |
| `--no-login-check` | Start even if login detection fails |

### `image`

Generate images via ChatGPT (DALL-E), Gemini (Imagen), or Grok with non-blocking polling.

```bash
npx 10x-chat@latest image -p "A fox astronaut in space, digital art" --provider chatgpt
npx 10x-chat@latest image -p "Watercolor landscape" --provider gemini --save-dir ./images
npx 10x-chat@latest image -p "Logo design" --provider grok --headed --timeout 120000
```

| Flag | Description |
|------|-------------|
| `-p, --prompt <text>` | **(required)** The image generation prompt |
| `--provider <name>` | Provider: `chatgpt`, `gemini`, `grok` (default: chatgpt) |
| `--headed` | Show browser window |
| `--timeout <ms>` | Generation timeout (default: 120000) |
| `--save-dir <dir>` | Directory to save generated images |

### `research`

Deep research via ChatGPT, Gemini, or Perplexity with non-blocking progress polling. Designed for long-running research tasks (5-10+ minutes).

```bash
npx 10x-chat@latest research -p "Latest breakthroughs in quantum computing" --provider gemini
npx 10x-chat@latest research -p "Hard technical research" --provider gemini --model "Deep Think"
npx 10x-chat@latest research -p "Market analysis of EVs" --provider chatgpt --timeout 600000
npx 10x-chat@latest research -p "Compare React vs Vue in 2026" --provider perplexity --save-dir ./reports
```

| Flag | Description |
|------|-------------|
| `-p, --prompt <text>` | **(required)** The research query |
| `--provider <name>` | Provider: `chatgpt`, `gemini`, `perplexity` (default: gemini) |
| `--model <name>` | Optional model/mode to select before starting research |
| `--headed` | Show browser window |
| `--timeout <ms>` | Total timeout (default: 600000 / 10 min) |
| `--poll-interval <ms>` | Progress check interval (default: 5000) |
| `--save-dir <dir>` | Directory to save the research report |

### `video`

Generate video via browser automation — **Google Flow** (Veo) or **Dreamina** (Seedance).

```bash
# Google Flow / Veo (default) — uses your Google login (shared with Gemini)
npx 10x-chat@latest video -p "A drone shot over snowy mountains at sunrise" --provider flow
npx 10x-chat@latest video -p "Neon city street, rain" --provider flow --model "Omni Flash" --duration 10 --orientation portrait
npx 10x-chat@latest video -p "She walks forward" --provider flow --image ref.png   # image-to-video

# Dreamina / Seedance (CapCut)
npx 10x-chat@latest login dreamina   # one-time CapCut login
npx 10x-chat@latest video -p "A paper boat in a rain gutter, macro" --provider dreamina --aspect 9:16 --dreamina-duration 4
npx 10x-chat@latest video -p "The glowing orb pulses and floats up" --provider dreamina --image ref.png --ref-mode omni
```

Shared flags:

| Flag | Description |
|------|-------------|
| `-p, --prompt <text>` | **(required)** The video generation prompt |
| `--provider <name>` | `flow` (default) or `dreamina` |
| `--model <name>` | Model (provider-specific — see below) |
| `--headed` | Show browser window during generation |
| `--timeout <ms>` | Generation timeout (default: 600000 / 10 min) |
| `--save-dir <dir>` | Directory to save generated videos |

**Flow (Veo)** — models: `Omni Flash` (default), `Veo 3.1 - Lite`, `Veo 3.1 - Fast`, `Veo 3.1 - Quality`.

| Flag | Description |
|------|-------------|
| `--mode <mode>` | `ingredients` (default) or `frames` |
| `--orientation <dir>` | `landscape` (default) or `portrait` |
| `--count <n>` | Simultaneous generations (1-4) |
| `--image <path>` | Reference image for image-to-video (ingredients mode) |
| `--duration <secs>` | Clip length in seconds: `4`, `6`, `8`, `10` |
| `--start-frame <path>` / `--end-frame <path>` | Keyframe images (frames mode) |

**Dreamina (Seedance)** — requires `login dreamina` (CapCut account). Models: `Seedance 2.0 Fast` (default, cheapest), `Seedance 2.0`; `Seedance 1.5 Pro` / `1.0` / `1.0 Fast` may be locked depending on your plan/region.

| Flag | Description |
|------|-------------|
| `--aspect <ratio>` | `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16` |
| `--resolution <res>` | `720P` (default) or `1080P` (model-dependent) |
| `--dreamina-duration <secs>` | Clip length in seconds (4-15) |
| `--ref-mode <mode>` | Input-image mode: `omni` (default), `frames`, `multiframes` |
| `--image <path>` | Reference/input image for image-to-video (repeatable, up to 12) |

### `history`

List chat history visible in provider sidebars (ChatGPT, Gemini, Claude, Grok, Perplexity).

```bash
npx 10x-chat@latest history --provider gemini
npx 10x-chat@latest history --provider all --limit 10
npx 10x-chat@latest history --provider chatgpt --json
```

| Flag | Description |
|------|-------------|
| `--provider <name>` | Provider: `chatgpt`, `gemini`, `claude`, `grok`, `perplexity`, or `all` (default: all) |
| `--limit <n>` | Maximum items per provider (default: 20) |
| `--headed` | Show browser window |
| `--json` | Output JSON |

### `status`

List local 10x-chat CLI sessions.

```bash
npx 10x-chat@latest status              # Last 24 hours
npx 10x-chat@latest status --hours 72   # Last 3 days
```

### `session <id>`

View details of a specific session.

```bash
npx 10x-chat@latest session <id> --render   # Pretty-print the response
```

### `config`

View or modify configuration.

```bash
npx 10x-chat@latest config show
npx 10x-chat@latest config set provider gemini
npx 10x-chat@latest config set timeout 600000
npx 10x-chat@latest config set headless false
```

### `skill`

Manage the agent integration skill (for Codex, Claude Code, etc).

```bash
npx 10x-chat@latest skill install   # Install SKILL.md to ~/.codex/skills/
npx 10x-chat@latest skill show      # Display SKILL.md content
```

### `notebooklm` (alias: `nb`)

Manage NotebookLM notebooks and sources via RPC API.

```bash
npx 10x-chat@latest notebooklm list                              # List all notebooks
npx 10x-chat@latest notebooklm create "Research Topic"            # Create a notebook
npx 10x-chat@latest notebooklm delete <notebookId>                # Delete a notebook
npx 10x-chat@latest notebooklm sources <notebookId>               # List sources in notebook
npx 10x-chat@latest notebooklm add-url <notebookId> <url>         # Add URL source
npx 10x-chat@latest notebooklm add-url <notebookId> <url> --wait  # Add URL and wait for processing
npx 10x-chat@latest notebooklm add-file <notebookId> ./paper.pdf  # Upload file source
npx 10x-chat@latest notebooklm add-text <id> "Title" "Content"    # Add pasted text source
npx 10x-chat@latest notebooklm summarize <notebookId>             # AI summary + suggested topics

# Then chat with the notebook's sources:
npx 10x-chat@latest chat -p "Summarize key points" --provider notebooklm
```

### `migrate`

Merge older per-provider isolated browser profiles into the single shared
profile used by default. Useful when upgrading from a version that stored a
separate profile per provider.

```bash
npx 10x-chat@latest migrate --dry-run            # Preview without making changes
npx 10x-chat@latest migrate                      # Auto-pick the largest profile as the base
npx 10x-chat@latest migrate --source chatgpt     # Use a specific provider's profile as the base
npx 10x-chat@latest migrate --keep               # Keep the old isolated profiles after migrating
```

## File Bundling

The `--file` flag accepts globs. Files are assembled into a markdown bundle sent as the prompt:

```bash
npx 10x-chat@latest chat -p "Review these" --file "src/**/*.ts" "!src/**/*.test.ts"
```

Security-sensitive files (`.env*`, `*.pem`, `*.key`, etc.) are automatically excluded.

## Data Layout

```
~/.10x-chat/
├── profiles/
│   ├── chatgpt/          # Playwright persistent browser profile
│   ├── gemini/
│   ├── claude/
│   ├── grok/
│   └── notebooklm/       # NotebookLM browser profile (shared Google auth)
├── sessions/
│   └── <uuid>/
│       ├── meta.json     # Session metadata
│       ├── bundle.md     # Prompt bundle sent
│       └── response.md   # Captured response
└── config.json           # User configuration
```

## Agent Integration

10x-chat includes a `SKILL.md` for AI coding agents. Install it with:

```bash
npx 10x-chat@latest skill install
```

This lets agents like Codex or Claude Code use 10x-chat to query other models for cross-validation, code review, or debugging help.

## Custom Providers

The package API supports out-of-tree providers for custom web chat sites. Register a provider before calling `runChat()`:

```typescript
import { registerProvider, runChat, type Provider } from '10x-chat';

const customProvider = {
  config: {
    name: 'custom-chat',
    displayName: 'Custom Chat',
    url: 'https://chat.example.com',
    loginUrl: 'https://chat.example.com/login',
    defaultTimeoutMs: 300_000,
  },
  actions: {
    isLoggedIn: (page) => page.locator('[data-user-menu]').isVisible(),
    submitPrompt: async (page, prompt) => {
      await page.locator('textarea').fill(prompt);
      await page.getByRole('button', { name: 'Send' }).click();
    },
    captureResponse: async (page, { timeoutMs }) => {
      const response = page.locator('[data-role="assistant"]').last();
      await response.waitFor({ timeout: timeoutMs });
      const text = (await response.innerText()).trim();
      return { text, markdown: text, truncated: false };
    },
  },
} satisfies Provider;

registerProvider(customProvider);
const result = await runChat({ provider: 'custom-chat', prompt: 'Hello' });
console.log(result.response);
```

Provider names must be 1-64 lowercase letters, numbers, or hyphens and must start and end with a letter or number. Registration is process-local and rejects duplicate names, including attempts to replace built-in providers. A separate provider package can export the provider object or a registration function; the stock CLI does not dynamically discover npm packages.

## Supported Providers

| Provider | Status | Models | URL |
|----------|--------|--------|-----|
| ChatGPT | ✅ chat + image | — | chatgpt.com |
| Gemini | ✅ chat + image | Fast, **Thinking** (default), Deep Think, Pro | gemini.google.com |
| Claude | ✅ chat | — | claude.ai |
| Grok | ✅ chat + image | — | grok.com |
| Perplexity | ✅ | — | perplexity.ai |
| NotebookLM | ✅ | — | notebooklm.google.com |
| Google Flow | ✅ video (Veo) | **Omni Flash** (default), Veo 3.1 Lite/Fast/Quality | labs.google/fx/tools/flow |
| Dreamina | ✅ video (Seedance) | Seedance 2.0 Fast/2.0 (1.x often plan-locked) | dreamina.capcut.com |

## Development

```bash
bun install
bun run dev login chatgpt      # Run CLI in dev mode
bun run typecheck               # Type check
bun run lint                    # Lint
bun run test                    # Run tests
bun run build                   # Build for production
```

## Publishing

Releases are automated via GitHub Actions. Push a version tag to publish:

```bash
npm version patch   # or minor / major
git push --follow-tags
```

Requires `NPM_TOKEN` secret in the GitHub repository settings.

## Disclaimer

This project is provided **for research and educational purposes only**. It
automates web interfaces that may be subject to the terms of service of the
respective providers. You are solely responsible for how you use it, including
compliance with any applicable terms, and you use it at your own risk.

## License

MIT © Mike Chong — see [LICENSE](./LICENSE).
