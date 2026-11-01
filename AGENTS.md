# AGENTS.md — 10x-chat monorepo

Two independent apps. Each app has its own `package.json`, `bun.lock`, and `AGENTS.md`. There is no root package or workspace.

| Path | What | Read first |
|------|------|------------|
| `apps/agent-skill/` | Agent skills (markdown + JS). No npm release. Vitest, happy-dom, Biome. | `apps/agent-skill/AGENTS.md` |
| `apps/chrome-extension/` | Chrome extension (10xWise Multi-AI Chat). WXT, React, Tailwind, Jest. | `apps/chrome-extension/AGENTS.md` |

## Rules

- Run commands from the app directory, not the root.
- Change one app per PR when possible. CI runs only for the app paths that changed.
- Follow the app's own `AGENTS.md` for checks before a commit.

## Checks

```bash
# apps/agent-skill
bun run typecheck && bun run lint && bun run test

# apps/chrome-extension
bun run compile && bun run test && bun run build
```

## Release

See the Releases section in `README.md`. Only the Chrome extension has a release tag.

- Agent skills: no release. The npm CLI `10x-chat@0.12.1` is frozen.
- Chrome extension: `chrome-extension-v<version>` → GitHub Release + Chrome Web Store.
