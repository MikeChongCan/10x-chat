# 10x-chat skills

Agent skills for web AI chat, research, images, and video in your own Chrome.
Use your existing logins. The old npm CLI `10x-chat@0.12.1` is frozen.
This app has no CLI, daemon, Playwright, or npm release.

## Three layers

1. The coding agent runs `bunx mcporter call chrome-existing.<tool>`.
2. Markdown skills route requests and give provider steps and recovery rules.
3. Small browser JS functions find elements and return JSON. Shell helpers run
   them, open tabs, and wait for stable results.

## Install

From the repository root, link all skill folders. Provider skills use helpers
in the sibling router folder. Keep all folders together.

```bash
mkdir -p ~/.claude/skills
for d in apps/agent-skill/skills/*/; do ln -s "$PWD/$d" ~/.claude/skills/; done
```

Install Bun, jq, and GNU timeout. On macOS, `brew install coreutils jq` supplies
`gtimeout`. Linux can use `timeout`. The helpers accept either command.

Merge this server into `~/.mcporter/mcporter.json`. Keep other server entries:

```json
{
  "mcpServers": {
    "chrome-existing": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest", "--autoConnect"],
      "env": { "MCPORTER_CHROME_DEVTOOLS_RELAY_POLICY": "off" }
    }
  }
}
```

Open your own Chrome. Go to `chrome://inspect/#remote-debugging` and allow remote
debugging. Allow the connection when Chrome asks. Check the connection:

```bash
bunx mcporter list chrome-existing
bunx mcporter call chrome-existing.list_pages
```

If the error says `DevToolsActivePort` and `EPERM`, the mcporter daemon started in a
sandbox. Run `bunx mcporter daemon stop`, then run the call again outside the sandbox.

mcporter 0.17 and later send `--autoConnect` servers through the OpenClaw extension
relay by default. Without a paired relay, every call fails with `runtime_error`, and
`bunx mcporter daemon status` shows `chrome relay: route=unavailable ... reason=missing-credential`.
The `env` line above turns the relay off so `chrome-devtools-mcp` connects to Chrome
directly. After you change it, run `bunx mcporter daemon restart`.

Each new direct connection makes Chrome show "Allow remote debugging?". Click Allow.
The first call waits for the click. The mcporter daemon keeps the connection, so later
calls do not ask again until the daemon or Chrome restarts.

## Optional: 10xWise bridge

The 10xWise extension can open tabs, run browser functions, and focus or close
tabs without remote debugging. It uses a native messaging host and a local Unix
socket (`~/.10x-chat/bridge.sock`). There is no TCP port.

```bash
skills/10x-chat/bridge/install.sh            # --browser, --extension-id, --uninstall
```

Then open the 10xWise options, enable Agent bridge, and turn on "Allow User
Scripts" for 10xWise in `chrome://extensions`. The helpers use the bridge when
it is ready and fall back to CDP. Snapshot, click, and upload still use CDP.
The socket lets any process run by this user execute JS in any tab, same as CDP.

## Skills

| Skill | Use |
|---|---|
| 10x-chat | Router, setup, shared procedures, parallel comparison |
| 10x-chat-gemini | Chat, images, research |
| 10x-chat-chatgpt | Chat, images, research |
| 10x-chat-claude | Chat, analysis, files |
| 10x-chat-grok | Chat, images |
| 10x-chat-perplexity | Search, research |
| 10x-chat-notebooklm | Sources and grounded chat |
| 10x-chat-flow | Images and video |
| 10x-chat-dreamina | Seedance video |
| 10x-chat-login | User login recovery |
| 10x-chat-wait-user | Captcha, consent, quota, and other blocks |
| 10x-chat-best-model | Inspect, rank, select, verify, and cache models |

Ask the agent to use 10x-chat with a provider, prompt, optional files, and model.
For example: “Use 10x-chat to ask Gemini and Claude to review this design.
Compare their agreement, disagreement, and unique points.”

Login and human checks stay in Chrome. Each page call uses pageId; for chrome-existing tools such as take_snapshot,
click, and upload_file, pass `$(../10x-chat/bin/cdp-id.sh "$PAGE")`. Prompts use
insertText so newlines do not submit early. Model lists depend on the account;
the skill checks the live menu. DOM selectors can change. Fixture tests check
contracts and known cases; they do not prove that a live site still matches.

## Development

From this app folder:

```bash
bun install
bun run typecheck && bun run lint && bun run test
bash -n skills/10x-chat/bin/*.sh
```

See [AGENTS.md](AGENTS.md) to add a provider. No release tag is used for these skills.
