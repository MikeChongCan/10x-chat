# 10x-chat — Project Specification

> A TypeScript CLI that uses Playwright to open a browser, lets the user login with a **persisted Chrome profile**, then programmatically chats with web-based AI agents (ChatGPT, Gemini, Claude, etc.).

---

## 1 · Problem

Today an AI-coding agent (Codex, Claude Code, Cursor) is locked into a single model. When it's stuck, the fastest unblock is "ask a different model." But doing that manually means:

1. Open a browser tab for each provider.
2. Copy-paste context (files, error logs).
3. Wait, then copy the answer back.

**10x-chat** automates this loop: one CLI command bundles context, opens the provider's web UI in a logged-in browser, submits the prompt, and streams the response back to the terminal (or to the calling agent).

---

## 2 · Design Principles

| # | Principle | How |
|---|-----------|-----|
| 1 | **Persisted profiles** | One Chrome user-data-dir per provider; login once, reuse forever. |
| 2 | **Playwright over CDP** | Playwright is higher-level, cross-browser, and has first-class persistence support via `browserContext.storageState()`. Oracle's CDP approach requires manual cookie sync; Playwright handles this natively. |
| 3 | **Provider as plugin** | Each AI web UI (ChatGPT, Gemini, Claude) is a self-contained provider module with its own selectors, login check, and response capture logic. |
| 4 | **CLI-first** | TypeScript CLI using Commander (like Oracle). MCP server comes later. |
| 5 | **Testable** | Every module is unit-testable. Playwright interactions are integration-tested. |

---

## 3 · Reference Architecture Learnings

### 3.1 From Oracle (`@steipete/oracle`)

| What | How Oracle does it | What we take |
|------|--------------------|--------------|
| Browser automation | `chrome-launcher` + raw CDP (`chrome-remote-interface`) | ❌ Skip — Playwright is simpler |
| Cookie persistence | `@steipete/sweet-cookie` reads Chrome's cookie DB, syncs via CDP `Network.setCookie` | ❌ Skip — Playwright's `storageState` / `launchPersistentContext` handles this |
| Profile locking | `profileState.ts` — file locks to serialize parallel runs on same profile | ✅ Adopt — file-based lock per provider profile |
| Prompt submission | DOM interaction: find composer textarea, paste markdown, click send | ✅ Adopt pattern — provider-specific page actions |
| Response capture | Poll DOM for assistant turn elements, extract text/markdown, timeout + reattach | ✅ Adopt pattern — poll for response with configurable timeout |
| Session management | `~/.oracle/sessions/<id>/` with metadata + logs | ✅ Adopt — `~/.10x-chat/sessions/` |
| CLI structure | Commander with subcommands (`oracle status`, `oracle session`) | ✅ Adopt |
| Multi-model | `--models` flag sends to multiple APIs in parallel | ✅ Adapt for browser-based multi-provider |

### 3.2 From notebooklm-py

| What | How it does it | What we take |
|------|---------------|--------------|
| Auth | Playwright opens Chromium, user logs into Google, cookies saved to `storageState.json` | ✅ Core pattern — `10x-chat login <provider>` uses Playwright persistent context |
| Layered arch | CLI → Client → Core → RPC | ✅ Adopt layered design |
| Skill install | `notebooklm skill install` copies SKILL.md to agent dir | ✅ Adopt — `10x-chat skill install` |

### 3.3 From 10xwise-chat

| What | How it does it | What we take |
|------|---------------|--------------|
| Multi-provider SDK | `AiSdkManager` singleton with pluggable providers (OpenAI, Anthropic, Google, Azure, etc.) | ✅ Inform provider plugin interface design |

---

## 4 · Supported Providers (v1)

| Provider | Web URL | Login method | Notes |
|----------|---------|--------------|-------|
| **ChatGPT** | `https://chatgpt.com` | Email/Google/Apple | Most complex DOM, model picker, thinking modes |
| **Gemini** | `https://gemini.google.com` | Google account | Simpler DOM |
| **Claude** | `https://claude.ai` | Email/Google | Artifact support |

> Future: Grok, Perplexity, DeepSeek, etc. — added as provider plugins.

---

## 5 · Architecture

```
┌─────────────────────────────────────┐
│               CLI Layer             │  Commander-based
│  login · chat · status · session ·  │  subcommands
│  config · skill                     │
├─────────────────────────────────────┤
│            Core / Orchestrator      │  Bundles context,
│                                     │  dispatches to providers
├──────────┬──────────┬───────────────┤
│ ChatGPT  │  Gemini  │   Claude      │  Provider plugins
│ Provider │ Provider │  Provider     │  (page actions,
│          │          │               │   selectors, response
│          │          │               │   capture)
├──────────┴──────────┴───────────────┤
│          Browser Manager            │  Playwright lifecycle,
│  (launch / persist / lock / close)  │  profile management
├─────────────────────────────────────┤
│          Session Store              │  ~/.10x-chat/sessions/
│  (logs, metadata, responses)        │
└─────────────────────────────────────┘
```

---

## 6 · Module Breakdown

### 6.1 `src/browser/`

| File | Responsibility |
|------|---------------|
| `manager.ts` | Launch/reuse Playwright persistent context per provider. Profile directory: `~/.10x-chat/profiles/<provider>/`. |
| `lock.ts` | File-based lock to prevent parallel use of same profile (from Oracle's `profileState.ts`). |

### 6.2 `src/providers/`

Each provider implements a common interface:

```typescript
interface Provider {
  readonly name: string;
  readonly url: string;

  /** Check if the user is logged in (inspect DOM/cookies). */
  isLoggedIn(page: Page): Promise<boolean>;

  /** Navigate to the chat UI and prepare for prompt submission. */
  navigateToChat(page: Page, options?: { model?: string }): Promise<void>;

  /** Type/paste the prompt and click send. */
  submitPrompt(page: Page, prompt: string, attachments?: string[]): Promise<void>;

  /** Wait for and capture the assistant response. */
  waitForResponse(page: Page, options?: { timeoutMs?: number }): Promise<string>;
}
```

| File | Provider |
|------|----------|
| `chatgpt.ts` | ChatGPT — model selection, prompt composer, response polling |
| `gemini.ts` | Gemini — Google auth check, prompt, response |
| `claude.ts` | Claude — prompt, response, artifact handling |
| `registry.ts` | Maps provider names to implementations |

### 6.3 `src/cli/`

| File | Command | Description |
|------|---------|-------------|
| `login.ts` | `10x-chat login <provider>` | Opens browser for user to login. Saves persistent profile. |
| `chat.ts` | `10x-chat chat -p "prompt" --provider chatgpt` | Submits prompt, captures response. |
| `status.ts` | `10x-chat status` | Lists active/recent sessions. |
| `session.ts` | `10x-chat session <id>` | Replays/reattaches to a session. |
| `config.ts` | `10x-chat config` | Shows/sets defaults (default provider, model, timeout). |
| `skill.ts` | `10x-chat skill install` | Installs SKILL.md into agent skills directory. |

### 6.4 `src/core/`

| File | Responsibility |
|------|---------------|
| `orchestrator.ts` | Takes user prompt + files, resolves provider, manages session lifecycle. |
| `bundle.ts` | Assembles markdown bundle from prompt + file paths (like Oracle). |
| `config.ts` | Loads/saves `~/.10x-chat/config.json` (JSON5). |

### 6.5 `src/session/`

| File | Responsibility |
|------|---------------|
| `store.ts` | CRUD for sessions in `~/.10x-chat/sessions/<id>/`. |
| `types.ts` | `Session`, `SessionStatus`, `SessionResult` types. |

---

## 7 · CLI Commands

### `login`

```bash
# Opens browser for ChatGPT login. Profile persisted for future runs.
10x-chat login chatgpt

# Login to all providers
10x-chat login --all

# Check login status
10x-chat login --status
```

**Flow:**
1. Launch Playwright with `launchPersistentContext(profileDir)`.
2. Navigate to provider URL.
3. Show message: "Please login in the browser window. Press Enter when done."
4. On Enter: verify login via `provider.isLoggedIn(page)`.
5. Close browser (profile is auto-persisted by Playwright).

### `chat`

```bash
# Basic prompt
10x-chat chat -p "Review this code for bugs"

# With files
10x-chat chat -p "Explain the architecture" --file "src/**/*.ts"

# Specific provider and model
10x-chat chat -p "Fix this error" --provider chatgpt --model "GPT-4o" --file src/index.ts

# Multi-provider (fan-out to all, show all responses)
10x-chat chat -p "Review this PR" --providers chatgpt,gemini,claude --file "src/**"

# Copy bundle to clipboard instead (manual paste fallback)
10x-chat chat -p "Debug this" --copy --file src/

# Dry run (preview bundle, no browser)
10x-chat chat --dry-run -p "test" --file src/
```

**Flow:**
1. Resolve provider(s) from flags or config default.
2. Bundle prompt + files into markdown.
3. For each provider (parallel if multi):
   a. Acquire profile lock.
   b. Launch persistent browser context.
   c. Verify login (prompt to re-login if expired).
   d. Navigate to chat.
   e. Submit prompt.
   f. Wait for response (with timeout + streaming indicator).
   g. Save session with request/response.
   h. Release lock, close browser.
4. Print response(s) to terminal.

### `status` / `session`

```bash
10x-chat status                    # Last 24h sessions
10x-chat status --hours 72         # Last 72h
10x-chat session <id>              # View session details
10x-chat session <id> --render     # Pretty-print response
```

### `config`

```bash
10x-chat config                          # Show current config
10x-chat config set provider chatgpt     # Default provider
10x-chat config set model "GPT-4o"       # Default model
10x-chat config set timeout 5m           # Default response timeout
```

### `skill`

```bash
10x-chat skill install         # Install SKILL.md to ~/.codex/skills/10x-chat/
10x-chat skill show            # Print SKILL.md contents
```

---

## 8 · Data Layout

```
~/.10x-chat/
├── config.json                    # User preferences (JSON5)
├── profiles/
│   ├── chatgpt/                   # Playwright persistent context
│   │   ├── Default/
│   │   └── ...
│   ├── gemini/
│   └── claude/
└── sessions/
    └── <uuid>/
        ├── meta.json              # { provider, model, prompt_preview, created_at, status }
        ├── bundle.md              # The full prompt bundle sent
        ├── response.md            # Captured assistant response
        └── log.jsonl              # Structured event log
```

---

## 9 · Tech Stack

| Area | Choice | Rationale |
|------|--------|-----------|
| Language | TypeScript (ESM) | Matches Oracle; best Playwright ecosystem |
| Runtime | Node 22+ | Matches Oracle |
| Browser automation | **Playwright** | Native persistent context, cross-browser, first-class TS types |
| CLI framework | Commander | Matches Oracle; mature, well-typed |
| File globbing | `fast-glob` | Matches Oracle |
| Config format | JSON5 | Matches Oracle |
| Terminal colors | `chalk` | Matches Oracle |
| Clipboard | `clipboardy` | Matches Oracle |
| Build | `tsc` (TypeScript compiler) | Simple, no bundler needed |
| Test | Vitest | Matches Oracle; fast |
| Lint | Biome | Matches Oracle; fast |
| Package manager | pnpm | Matches Oracle |

---

## 10 · Key Design Decisions

### 10.1 Playwright vs CDP (Chrome DevTools Protocol)

Oracle uses raw CDP via `chrome-remote-interface` + `chrome-launcher`. This gives low-level control but requires:
- Manual cookie sync from Chrome's cookie DB
- Custom profile state management
- Frame/target management
- No built-in waiting/retry primitives

**Playwright** provides all of this out of the box:
- `launchPersistentContext()` — persists cookies, localStorage, sessions automatically
- `page.waitForSelector()` — built-in smart waiting
- `page.fill()` / `page.click()` — reliable DOM interaction
- Cross-browser support (Chromium, Firefox, WebKit)

**Decision: Use Playwright.** The tradeoff is a heavier dependency (~100 MB for Chromium), but it dramatically simplifies the browser automation layer.

### 10.2 Persistent Context vs Cookie Sync

notebooklm-py uses `storageState()` export/import. Oracle copies cookies from the real Chrome profile.

**Decision: Use `launchPersistentContext()`** — Playwright manages a real Chromium user-data-dir. The login state persists across runs without any manual cookie handling. This is the simplest and most reliable approach.

### 10.3 Headless vs Headed

- **Login**: Always headed (user needs to interact).
- **Chat**: Headless by default, `--headed` flag for debugging.
- **Long-running**: If response takes > 30s, optionally show browser for transparency.

---

## 11 · Provider Plugin Contract (Detail)

```typescript
// src/providers/types.ts

export interface ProviderConfig {
  name: string;                    // e.g. "chatgpt"
  displayName: string;             // e.g. "ChatGPT"
  url: string;                     // e.g. "https://chatgpt.com"
  loginUrl: string;                // e.g. "https://chatgpt.com/auth/login"
  models?: string[];               // Known model names for the picker
  defaultModel?: string;           // e.g. "GPT-4o"
  defaultTimeout: number;          // ms to wait for response
}

export interface ProviderActions {
  /** Check if the user is currently authenticated. */
  isLoggedIn(page: Page): Promise<boolean>;

  /** Select a specific model if the provider has a model picker. */
  selectModel?(page: Page, model: string): Promise<void>;

  /** Submit a prompt (type into composer, click send). */
  submitPrompt(page: Page, prompt: string): Promise<void>;

  /** Wait for the assistant response and extract it as text/markdown. */
  captureResponse(page: Page, opts: {
    timeoutMs: number;
    onChunk?: (chunk: string) => void;  // streaming callback
  }): Promise<CapturedResponse>;
}

export interface CapturedResponse {
  text: string;                     // Plain text
  markdown: string;                 // Markdown-formatted
  model?: string;                   // Detected model name
  thinkingTime?: number;            // Seconds the model "thought"
  truncated: boolean;               // Whether response was cut off
}
```

---

## 12 · SKILL.md (for AI Agents)

The installed SKILL.md will instruct agent tools (Codex, Claude Code) how to use 10x-chat:

```markdown
---
name: 10x-chat
description: Chat with web AI agents (ChatGPT, Gemini, Claude) via browser automation.
             Use when stuck, need cross-validation, or want a second-model review.
---

# 10x-chat — AI Agent Skill

## When to use
- Stuck on a bug: ask another model for a fresh perspective.
- Code review: send PR diff to GPT-5 Pro / Claude / Gemini for review.
- Cross-validation: compare answers from multiple models.

## Commands
- `npx 10x-chat chat -p "<prompt>" --file "src/**" --provider chatgpt`
- `npx 10x-chat chat -p "<prompt>" --providers chatgpt,gemini --file "src/**"`
- `npx 10x-chat status` — check recent sessions.

## Tips
- Login first: `npx 10x-chat login chatgpt` (one-time, persistent).
- Use `--dry-run` to preview the bundle before sending.
- Keep file sets small; fewer files + better prompt = better answers.
- Don't send secrets.
```

---

## 13 · Milestones

### v0.1 — MVP (Single Provider)
- [ ] Project scaffold (TypeScript, pnpm, Vitest, Biome)
- [ ] Browser manager with Playwright persistent context
- [ ] Profile lock mechanism
- [ ] ChatGPT provider (login check, prompt submit, response capture)
- [ ] `login` command
- [ ] `chat` command (single provider)
- [ ] Session storage (save request/response)
- [ ] `status` command

### v0.2 — Multi-Provider
- [ ] Gemini provider
- [ ] Claude provider
- [ ] Provider registry
- [ ] `--providers` multi-provider fan-out
- [ ] `config` command

### v0.3 — Agent Integration
- [ ] SKILL.md + `skill install` command
- [ ] `--copy` clipboard fallback
- [ ] `--dry-run` preview
- [ ] File bundling (`--file` with globs)
- [ ] `session` command (replay/reattach)

### v0.4 — Polish
- [ ] MCP server mode (`10x-chat mcp`)
- [ ] Model selection per provider
- [ ] Streaming response display
- [ ] Auto-reattach for long-running responses
- [ ] Timeout + retry policies
- [ ] npm publish

---

## 14 · Open Questions

1. **Package name**: `10x-chat`, `tenchat`, `@10xwise/chat`? Namespace?
2. **Playwright Chromium vs system Chrome**: Playwright downloads its own Chromium. Should we support the user's existing Chrome? (Playwright can attach via CDP, but persistent context is Playwright-only.)
3. **File attachments**: Some providers (ChatGPT, Gemini) support file upload via the web UI. Do we support drag-and-drop file upload in v1, or only inline markdown bundles?
4. **Rate limiting**: Web UIs have implicit rate limits. How aggressive should retry be?
5. **Cloudflare/bot detection**: ChatGPT uses Cloudflare. Will Playwright be blocked? Oracle solves this with real Chrome cookies + `--browser-manual-login`. We may need similar escape hatches.
