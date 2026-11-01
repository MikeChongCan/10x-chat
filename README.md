# 10x-chat

Chat with web AI assistants (ChatGPT, Gemini, Claude, Grok, Perplexity, and more) through your own logged-in browser sessions. No API keys.

This repository holds two apps:

| App | Path | What | Distribution |
|-----|------|------|--------------|
| Agent skill | [`apps/agent-skill`](apps/agent-skill) | Agent skills (markdown + JS) for web AI chat and video in your Chrome. | No npm release |
| Chrome extension | [`apps/chrome-extension`](apps/chrome-extension) | 10xWise Multi-AI Chat. Sends one prompt to many AI assistants in your browser. | [Chrome Web Store](https://chromewebstore.google.com/detail/10xwise-multi-ai-chat/jamoinmdfbdocjnggffobhmpogbolncp) |

The Chrome extension was in [`MikeChongCan/10x-chat-browser`](https://github.com/MikeChongCan/10x-chat-browser). Its full git history is in this repository.

## Quick start

```bash
# Agent skills: follow apps/agent-skill/README.md for setup

# Develop the agent skill
cd apps/agent-skill && bun install && bun run test

# Develop the Chrome extension
cd apps/chrome-extension && bun install && bun run dev
```

## Releases

Only the Chrome extension has a release tag. Agent skills have no release.
The old npm CLI `10x-chat@0.12.1` is frozen.

| App | Tag | Workflow |
|-----|-----|----------|
| Agent skills | None | No release |
| Chrome extension | `chrome-extension-v<version>` | `.github/workflows/chrome-extension-release.yml` (Chrome Web Store) |

The tag version must match `version` in that app's `package.json`. Old tags `v0.x.y` belong to the agent skill.

## License

MIT. See each app's `LICENSE`.
