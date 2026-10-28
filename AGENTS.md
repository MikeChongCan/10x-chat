# AGENTS.md — 10x-chat monorepo

Two independent apps. Each app has its own `package.json`, `bun.lock`, and `AGENTS.md`. There is no root package or workspace.

| Path | What | Read first |
|------|------|------------|
| `apps/agent-skill/` | CLI + agent skill (`10x-chat` on npm). TypeScript, Playwright, Vitest, Biome. | `apps/agent-skill/AGENTS.md` |
| `apps/chrome-extension/` | Chrome extension (10xWise Multi-AI Chat). WXT, React, Tailwind, Jest. | `apps/chrome-extension/AGENTS.md` |

## Rules

- Run commands from the app directory, not the root.
- Change one app per PR when possible. CI runs only for the app paths that changed.
- Follow the app's own `AGENTS.md` for checks before a commit.

## Checks

```bash
# apps/agent-skill
npm run build && npx biome check --no-errors-on-unmatched src/ && npm test

# apps/chrome-extension
bun run compile && bun run test && bun run build
```

## Release

Each app has its own tag prefix. See the Releases section in `README.md`.

- Agent skill: `agent-skill-v<version>` → npm.
- Chrome extension: `chrome-extension-v<version>` → GitHub Release + Chrome Web Store.
