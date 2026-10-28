# AGENTS.md — 10x-chat

> Chat with web AI agents from the terminal via Playwright browser automation.

## Quick Orientation

| Path | What |
|------|------|
| `src/providers/` | One file per AI provider (chatgpt, gemini, claude, grok, perplexity, notebooklm, flow, dreamina) |
| `src/providers/registry.ts` | Provider name → config + actions mapping |
| `src/providers/submit.ts` | Shared prompt submission helper (composer → type → send) |
| `src/core/orchestrator.ts` | Single + parallel chat execution (`runChat`, `runChatAll`) |
| `src/core/polling.ts` | `pollUntilStable` — waits for streamed response to stop changing |
| `src/core/bundle.ts` | Assembles prompt + file context into a markdown bundle |
| `src/browser/manager.ts` | Browser launch: shared (daemon), shared-persistent (login), isolated modes |
| `src/browser/daemon.ts` | Long-running Chromium server for cross-invocation reuse |
| `src/browser/state.ts` | `saveStorageState` / `loadStorageState` for cookie persistence |
| `src/cli/` | Commander subcommands: chat, login, status, config, video, skill, migrate, mcp |
| `src/types.ts` | Core types: `ProviderName`, `ProviderConfig`, `ProviderActions`, `ChatOptions` |
| `src/notebooklm/` | NotebookLM RPC API client (notebooks, sources, artifacts) |
| `src/session/` | Session storage (metadata, bundles, responses) |
| `src/mcp/` | MCP stdio server (`10x-chat mcp`): tools, in-memory job store, error mapping, stdout guard |
| `tests/` | Vitest unit tests |

## Architecture

```
CLI (Commander)
  └── orchestrator.ts
        ├── bundle.ts          ← assemble prompt + files
        ├── browser/manager.ts ← launch browser (shared daemon or persistent)
        ├── provider.isLoggedIn()
        ├── provider.submitPrompt()
        └── provider.captureResponse() ← pollUntilStable()
```

## Adding a New Provider

1. Create `src/providers/<name>.ts` with `ProviderConfig` + `ProviderActions`
2. Add the name to `ProviderName` union in `src/types.ts`
3. Register in `src/providers/registry.ts`
4. Export from `src/providers/index.ts`
5. If Cloudflare-protected: set `headlessBlocked: true` in config

Provider actions implement:
- `isLoggedIn(page)` — detect auth state
- `selectModel?(page, model)` — optional; switch model/mode via the provider's UI picker before sending
- `submitPrompt(page, prompt)` — type and send
- `captureResponse(page, opts)` — poll until stable, return text + markdown

## Key Patterns

- **headlessBlocked**: Providers using Cloudflare (ChatGPT, Perplexity) auto-force headed mode
- **Shared profile mode** (default): All providers share `~/.10x-chat/profiles/default/storage-state.json`
- **Browser daemon**: `chromium.launchServer` persisted to disk for cross-CLI reuse
- **Tab ref-counting**: Multiple CLI invocations share one Chromium; last tab stops the daemon
- **MCP stdout guard**: In `mcp` mode stdout carries only JSON-RPC. `src/mcp/early-guard.ts` is the first import in `src/bin/cli.ts` and sends `console.log/info/warn/debug` and `process.stdout.write` to stderr; only the MCP transport writes to the real stdout. Do not reorder that import.
- **Force-click**: Some providers need `click({ force: true })` to bypass overlay interception
- **Model selection**: Orchestrator calls `selectModel()` before `submitPrompt()` if the provider implements it. Model resolved from `--model` flag → `provider.config.defaultModel`. Gemini supports modes: Flash-Lite, Flash (default), Pro, Argon (matched by name; version numbers like "4 Argon" are ignored). Legacy aliases: Fast → Flash-Lite, Thinking → Flash. The mode menu renders in a `[popover]`, not `.cdk-overlay-container`

## Video Generation

`10x-chat video --provider <flow|dreamina>` (default `flow`).

- **Flow (Veo)**: `--model`, `--mode ingredients|frames`, `--orientation`, `--count`, `--start-frame`, `--end-frame`. Orchestrator: `core/video-orchestrator.ts` + `providers/flow.ts`.
- **Dreamina (Seedance)**: `--model` (Seedance 2.0 Fast = cheapest/default · 2.0 · 1.5 Pro · 1.0 · 1.0 Fast), `--aspect` (21:9…9:16), `--resolution` (720P/1080P; model-dependent), `--duration` (4-15s), `--ref-mode omni|frames|multiframes`, `--image <path>` (repeatable, ≤12, image-to-video). Orchestrator: `core/dreamina-video-orchestrator.ts` + `providers/dreamina-video.ts`.
  - **Model availability is account/plan-dependent.** Seedance 2.0 Fast + 2.0 are generally available; 1.5 Pro / 1.0 / 1.0 Fast are often locked (rendered `lv-select-option-wrapper-disabled`). `selectVideoModel` throws a clear error for a locked model rather than silently using the wrong one.
  - **Aspect-button gotcha**: models that expose a resolution render the combined control as `"16:9720P"` (ratio+res run together); discovery must match the ratio with NO trailing `\b` (see `buttonTextHasAspectRatio`).
  - Runs on a **shared persistent** context (not the daemon) — the helpers need full-page `evaluateHandle`/`keyboard.insertText`.
  - Generate navigates to `/ai-tool/generate`; the result is matched by **prompt text scoped to its `responsive-video-grid` record** (avoids trending-feed / other-generation videos), then downloaded via `core/video-download.ts`.
  - **Placeholder gotcha**: while generating, the result card embeds a 780×780 loading-spinner `<video>` from `capcutstatic.com/.../capcut-web-login-static`. The finished clip is a real CDN video whose path contains `/video/`. `isDreaminaResultSrc()` rejects the placeholder so the poll waits for the actual clip instead of downloading the spinner. The poll also strips composer/editable text from a record (so the composer's echo of our prompt can't false-match) and excludes any `<video>` src present before generate (baseline).

## Pre-Commit Checklist

Run all three steps before every commit. CI will fail if any step fails.

```bash
npm run build                              # 1. TypeScript compile (tsc)
npx biome check --no-errors-on-unmatched src/  # 2. Lint + format (biome)
npm test                                   # 3. Unit tests (vitest)
```

If biome reports fixable issues:
```bash
npx biome check --write src/               # auto-fix lint + format
```

## Release Flow

```bash
# Run from apps/agent-skill.
# 1. Bump version in package.json
# 2. Commit with descriptive message
git add -A && git commit -m "feat: ..."
# 3. Tag and push — CI publishes to npm on tag
git tag agent-skill-v<version>
git push origin main agent-skill-v<version>
```

CI pipeline (GitHub Actions): checkout → install → typecheck → lint → **test** → build → publish to npm → GitHub Release.

## Config

`~/.10x-chat/config.json` — user preferences (default provider, headless, profile mode, timeout).

## Data

`~/.10x-chat/sessions/<uuid>/` — per-session metadata, prompt bundle, captured response.
`~/.10x-chat/profiles/` — browser profiles (shared default + per-provider isolated).
