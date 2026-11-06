# 10x-chat 技能

在你自己的 Chrome 中使用 AI 聊天、研究、图片和视频服务。保留现有登录状态。
旧 npm CLI `10x-chat@0.12.1` 已冻结。此应用不再提供 CLI、守护进程、Playwright 或 npm 发布。

## 三层结构

1. 编程代理通过 `bunx mcporter call chrome-existing.<tool>` 控制浏览器。
2. Markdown 技能负责路由、服务操作步骤和异常恢复。
3. 小型浏览器 JS 函数自行查找元素并返回 JSON。Shell 脚本负责执行、打开页面和等待结果。

## 安装

在仓库根目录执行。必须链接所有技能目录。服务技能通过相邻的路由技能调用公共脚本。

```bash
mkdir -p ~/.claude/skills
for d in apps/agent-skill/skills/*/; do ln -s "$PWD/$d" ~/.claude/skills/; done
```

安装 Bun、jq 和 GNU timeout。macOS 可执行 `brew install coreutils jq`，使用 `gtimeout`。
Linux 可使用 `timeout`。脚本支持这两个命令。

将以下服务合并到 `~/.mcporter/mcporter.json`。保留其他已有服务。

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

打开你自己的 Chrome。在 `chrome://inspect/#remote-debugging` 允许远程调试。
Chrome 提示连接时，允许连接。检查服务：

```bash
bunx mcporter list chrome-existing
bunx mcporter call chrome-existing.list_pages
apps/agent-skill/skills/10x-chat/bin/doctor.sh   # 检查整套配置，并给出修复方法
```

如果错误包含 `DevToolsActivePort` 和 `EPERM`，说明 mcporter 守护进程是在沙箱里启动的。
运行 `bunx mcporter daemon stop`，然后在沙箱外再运行一次。

mcporter 0.17 及以后版本默认让 `--autoConnect` 服务走 OpenClaw 扩展中继。没有配对中继时，
每次调用都会报 `runtime_error`，`bunx mcporter daemon status` 会显示
`chrome relay: route=unavailable ... reason=missing-credential`。上面的 `env` 一行会关闭中继，
让 `chrome-devtools-mcp` 直接连 Chrome。改完后运行 `bunx mcporter daemon restart`。

每次新建直连，Chrome 都会弹出「Allow remote debugging?」，点允许。第一次调用会等你点击。
mcporter 守护进程会保持连接，之后的调用不会再问，直到守护进程或 Chrome 重启。

## 可选：10xWise 桥接

10xWise 扩展可以不用远程调试就打开标签页、运行浏览器函数、聚焦或关闭标签页。
它使用原生消息主机和本地 Unix 套接字（`~/.10x-chat/bridge.sock`），不开 TCP 端口。

```bash
skills/10x-chat/bridge/install.sh            # --browser、--extension-id、--uninstall
```

然后打开 10xWise 选项，启用 Agent bridge，并在 `chrome://extensions` 为 10xWise
打开“允许用户脚本”。桥接可用时助手会使用它，否则回退到 CDP。快照、点击和上传仍然使用 CDP。
该套接字允许本用户运行的任何进程在任何标签页执行 JS，与 CDP 相同。

## 技能列表

| 技能 | 用途 |
|---|---|
| 10x-chat | 路由、设置、公共步骤和并行对比 |
| 10x-chat-gemini | 聊天、图片和研究 |
| 10x-chat-chatgpt | 聊天、图片和研究 |
| 10x-chat-claude | 聊天、分析和文件 |
| 10x-chat-grok | 聊天和图片 |
| 10x-chat-perplexity | 搜索和研究 |
| 10x-chat-notebooklm | 来源管理和基于来源的聊天 |
| 10x-chat-flow | 图片和视频 |
| 10x-chat-dreamina | Seedance 视频 |
| 10x-chat-login | 等待用户登录 |
| 10x-chat-wait-user | 等待验证码、授权、额度限制等问题解除 |
| 10x-chat-best-model | 列出、排序、选择、验证并缓存模型 |

告诉代理使用 10x-chat，并给出服务、提示词、可选文件和模型。
例如：“用 Gemini 和 Claude 审查这个设计，比较相同点、分歧和各自独有的观点。”
登录和人工验证由用户在 Chrome 中完成。每个页面工具调用都需要 pageId；take_snapshot、click、upload_file 等 chrome-existing 工具请传 `$(../10x-chat/bin/cdp-id.sh "$PAGE")`。
提示词通过 insertText 插入，避免换行导致提前提交。模型列表以当前账号菜单为准。
网页选择器可能变化。HTML 测试验证已知行为和数据约定，不代表已验证实时网页。

## 开发检查

在此应用目录中执行：

```bash
bun install
bun run typecheck && bun run lint && bun run test
bash -n skills/10x-chat/bin/*.sh
```

新增服务请参阅 [AGENTS.md](AGENTS.md)。这些技能无需发布标签。
