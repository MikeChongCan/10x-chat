# 10x-chat

Chat with web AI assistants (ChatGPT, Gemini, Claude, Grok, Perplexity, and more) through your own logged-in browser sessions. No API keys.

This repository holds two apps:

| App | Path | What | Distribution |
|-----|------|------|--------------|
| Agent skill | [`apps/agent-skill`](apps/agent-skill) | CLI and agent skill. Drives web AI chats and video tools with Playwright. | npm: [`10x-chat`](https://www.npmjs.com/package/10x-chat) |
| Chrome extension | [`apps/chrome-extension`](apps/chrome-extension) | 10xWise Multi-AI Chat. Sends one prompt to many AI assistants in your browser. | [Chrome Web Store](https://chromewebstore.google.com/detail/10xwise-multi-ai-chat/jamoinmdfbdocjnggffobhmpogbolncp) |

The Chrome extension was in [`MikeChongCan/10x-chat-browser`](https://github.com/MikeChongCan/10x-chat-browser). Its full git history is in this repository.

## Quick start

```bash
# Agent skill (CLI)
npx 10x-chat --help

# Develop the agent skill
cd apps/agent-skill && bun install && bun run test

# Develop the Chrome extension
cd apps/chrome-extension && bun install && bun run dev
```

## Releases

Each app has its own tag prefix. A tag releases only that app.

| App | Tag | Workflow |
|-----|-----|----------|
| Agent skill | `agent-skill-v<version>` | `.github/workflows/agent-skill-release.yml` (npm) |
| Chrome extension | `chrome-extension-v<version>` | `.github/workflows/chrome-extension-release.yml` (Chrome Web Store) |

The tag version must match `version` in that app's `package.json`. Old tags `v0.x.y` belong to the agent skill.

## License

MIT. See each app's `LICENSE`.
