# 10x-chat

> 透過瀏覽器自動化，從終端機與網頁 AI 助手（ChatGPT、Gemini、Claude、Grok、Perplexity、NotebookLM）對話。

10x-chat 使用 [Playwright](https://playwright.dev) 自動化瀏覽器工作階段，並保存登入設定。只需登入一次，即可從 CLI 或 AI 編碼助手發送提示——自動附帶檔案內容。

[English](./README.md) | **繁體中文**

## 搭配 OpenClaw 使用

將以下連結貼到 [OpenClaw](https://openclaw.ai) 聊天中即可安裝為技能：

```
https://raw.githubusercontent.com/MikeChongCan/10x-chat/refs/heads/main/skills/10x-chat/SKILL.md
```

## 贊助商（其實我自己哈）廣告：

如果你需要找到一起學習 AI 的伙伴，歡迎加入我們的社群「用AI發電」：https://www.pathunfold.com/mike

## 快速開始

```bash
npx playwright install chromium  # 一次性瀏覽器安裝

# 1. 登入提供者（會開啟瀏覽器視窗）
npx 10x-chat@latest login chatgpt

# 2. 發送提示
npx 10x-chat@latest chat -p "解釋這個錯誤" --provider chatgpt --file "src/**/*.ts"

# 3. 檢視工作階段歷史
npx 10x-chat@latest status
```

> [!TIP]
> 使用 `bunx`（bun.sh）取代 `npx` 可加快啟動速度。

## 指令

### `login <provider>`

開啟有界面的瀏覽器供您驗證身份。工作階段會跨次執行保留。

```bash
npx 10x-chat@latest login chatgpt       # 登入 ChatGPT
npx 10x-chat@latest login gemini         # 登入 Gemini
npx 10x-chat@latest login claude         # 登入 Claude
npx 10x-chat@latest login grok           # 登入 Grok
npx 10x-chat@latest login perplexity     # 登入 Perplexity
npx 10x-chat@latest login notebooklm     # 登入 NotebookLM
npx 10x-chat@latest login dreamina       # 登入 Dreamina（CapCut）以使用影片功能
npx 10x-chat@latest login --status       # 檢查所有提供者的登入狀態
```

> Google Flow（Veo）影片使用你的 Google 登入——在共用設定模式下，登入 Gemini 即涵蓋。

### `chat`

透過瀏覽器自動化向 AI 提供者發送提示。

```bash
npx 10x-chat@latest chat -p "檢查這段程式碼的錯誤" --provider chatgpt --file "src/**/*.ts"
npx 10x-chat@latest chat -p "除錯這個錯誤" --file "logs/error.log"
npx 10x-chat@latest chat -p "解釋一下" --dry-run              # 預覽打包內容但不發送
npx 10x-chat@latest chat -p "解釋一下" --copy                  # 將打包內容複製到剪貼簿
npx 10x-chat@latest chat -p "長時間任務" --timeout 600000 --headed  # 10 分鐘逾時，顯示瀏覽器
```

| 參數 | 說明 |
|------|------|
| `-p, --prompt <text>` | **（必填）** 要發送的提示 |
| `--provider <name>` | 提供者：`chatgpt`、`gemini`、`claude`、`grok`、`perplexity`、`notebooklm`（預設：設定檔） |
| `--model <name>` | 要在 UI 中選擇的模型/模式（例如 Gemini：`Flash-Lite`、`Flash`、`Pro`、`Argon`、`Deep Think`） |
| `-f, --file <paths...>` | 要作為上下文打包的檔案/glob 模式 |
| `--copy` | 將打包內容複製到剪貼簿而不發送 |
| `--dry-run` | 預覽打包內容但不發送 |
| `--headed` | 在聊天期間顯示瀏覽器視窗 |
| `--timeout <ms>` | 回應逾時（毫秒，預設：300000） |

### `video`

透過瀏覽器自動化生成影片——**Google Flow**（Veo）或 **Dreamina**（Seedance）。

```bash
# Google Flow / Veo（預設）——使用你的 Google 登入（與 Gemini 共用）
npx 10x-chat@latest video -p "日出時飛越雪山的空拍鏡頭" --provider flow
npx 10x-chat@latest video -p "霓虹城市街道，下雨" --provider flow --model "Omni Flash" --duration 10 --orientation portrait
npx 10x-chat@latest video -p "電影感黃金時段縮時攝影" --provider flow --model "Veo 3.1 - Quality" --duration 8

# Dreamina / Seedance（CapCut）
npx 10x-chat@latest login dreamina   # 一次性 CapCut 登入
npx 10x-chat@latest video -p "雨水溝中的紙船，微距" --provider dreamina --aspect 9:16 --dreamina-duration 4
npx 10x-chat@latest video -p "發光的球體脈動並向上飄浮" --provider dreamina --image ref.png --ref-mode omni
```

共用參數：

| 參數 | 說明 |
|------|------|
| `-p, --prompt <text>` | **（必填）** 影片生成提示 |
| `--provider <name>` | `flow`（預設）或 `dreamina` |
| `--model <name>` | 模型（依提供者而定——見下方） |
| `--headed` | 生成期間顯示瀏覽器視窗 |
| `--timeout <ms>` | 生成逾時（預設：600000 / 10 分鐘） |
| `--save-dir <dir>` | 儲存生成影片的目錄 |

**Flow（Veo）** — 模型：`Omni Flash`（預設）、`Veo 3.1 - Lite`、`Veo 3.1 - Fast`、`Veo 3.1 - Quality`。

| 參數 | 說明 |
|------|------|
| `--mode <mode>` | `ingredients`（預設）或 `frames` |
| `--orientation <dir>` | `landscape`（預設）或 `portrait` |
| `--count <n>` | 同時生成數量（1-4） |
| `--image <path>` | 圖生影片的參考圖片（ingredients 模式） |
| `--duration <secs>` | 影片長度（秒）：`4`、`6`、`8`、`10` |
| `--start-frame <path>` / `--end-frame <path>` | 關鍵影格圖片（frames 模式） |

**Dreamina（Seedance）** — 需要 `login dreamina`（CapCut 帳號）。模型：`Seedance 2.0 Fast`（預設，最便宜）、`Seedance 2.0`；`Seedance 1.5 Pro` / `1.0` / `1.0 Fast` 可能依方案/地區而鎖定。

| 參數 | 說明 |
|------|------|
| `--aspect <ratio>` | `21:9`、`16:9`、`4:3`、`1:1`、`3:4`、`9:16` |
| `--resolution <res>` | `720P`（預設）或 `1080P`（依模型而定） |
| `--dreamina-duration <secs>` | 影片長度（秒，4-15） |
| `--ref-mode <mode>` | 輸入圖片模式：`omni`（預設）、`frames`、`multiframes` |
| `--image <path>` | 圖生影片的參考/輸入圖片（可重複，最多 12 張） |

### `history`

列出各提供者側邊欄可見的聊天歷史（ChatGPT、Gemini、Claude、Grok、Perplexity、NotebookLM）。

```bash
npx 10x-chat@latest history --provider gemini
npx 10x-chat@latest history --provider all --limit 10
npx 10x-chat@latest history --provider chatgpt --json
```

| 參數 | 說明 |
|------|------|
| `--provider <name>` | 提供者：`chatgpt`、`gemini`、`claude`、`grok`、`perplexity` 或 `all`（預設：all） |
| `--limit <n>` | 每個提供者最多列出幾筆（預設：20） |
| `--headed` | 顯示瀏覽器視窗 |
| `--json` | 輸出 JSON |

### `status`

列出本機 10x-chat CLI 工作階段。

```bash
npx 10x-chat@latest status              # 最近 24 小時
npx 10x-chat@latest status --hours 72   # 最近 3 天
```

### `session <id>`

檢視特定工作階段的詳細資訊。

```bash
npx 10x-chat@latest session <id> --render   # 格式化輸出回應
```

### `config`

檢視或修改設定。

```bash
npx 10x-chat@latest config show
npx 10x-chat@latest config set provider gemini
npx 10x-chat@latest config set timeout 600000
npx 10x-chat@latest config set headless false
```

### `skill`

管理代理整合技能（適用於 Codex、Claude Code 等）。

```bash
npx 10x-chat@latest skill install   # 安裝 SKILL.md 到 ~/.codex/skills/
npx 10x-chat@latest skill show      # 顯示 SKILL.md 內容
```

### `notebooklm`（別名：`nb`）

透過 RPC API 管理 NotebookLM 筆記本和來源。

```bash
npx 10x-chat@latest notebooklm list                              # 列出所有筆記本
npx 10x-chat@latest notebooklm create "研究主題"                   # 建立筆記本
npx 10x-chat@latest notebooklm delete <notebookId>                # 刪除筆記本
npx 10x-chat@latest notebooklm sources <notebookId>               # 列出筆記本中的來源
npx 10x-chat@latest notebooklm add-url <notebookId> <url>         # 新增網址來源
npx 10x-chat@latest notebooklm add-url <notebookId> <url> --wait  # 新增網址並等待處理
npx 10x-chat@latest notebooklm add-file <notebookId> ./paper.pdf  # 上傳檔案來源
npx 10x-chat@latest notebooklm add-text <id> "標題" "內容"         # 新增文字來源
npx 10x-chat@latest notebooklm summarize <notebookId>             # AI 摘要與建議主題

# 接著與筆記本的來源對話：
npx 10x-chat@latest chat -p "摘要重點" --provider notebooklm
```

## 檔案打包

`--file` 參數接受 glob 模式。檔案會組裝成 Markdown 打包內容作為提示發送：

```bash
npx 10x-chat@latest chat -p "檢查這些檔案" --file "src/**/*.ts" "!src/**/*.test.ts"
```

安全敏感檔案（`.env*`、`*.pem`、`*.key` 等）會自動排除。

## 資料目錄結構

```
~/.10x-chat/
├── profiles/
│   ├── chatgpt/          # Playwright 持久化瀏覽器設定
│   ├── gemini/
│   ├── claude/
│   ├── grok/
│   └── notebooklm/       # NotebookLM 瀏覽器設定（共用 Google 驗證）
├── sessions/
│   └── <uuid>/
│       ├── meta.json     # 工作階段中繼資料
│       ├── bundle.md     # 發送的提示打包
│       └── response.md   # 擷取的回應
└── config.json           # 使用者設定
```

## 代理整合

10x-chat 內附 `SKILL.md` 供 AI 編碼助手使用。安裝方式：

```bash
npx 10x-chat@latest skill install
```

這讓 Codex 或 Claude Code 等助手可以使用 10x-chat 查詢其他模型，進行交叉驗證、程式碼審查或除錯協助。

## 從代理使用（MCP）

`10x-chat mcp` 在 stdio 上啟動 [Model Context Protocol](https://modelcontextprotocol.io) 伺服器，讓代理把網頁 AI 當作工具使用。它與 CLI 共用瀏覽器設定檔和 daemon，所以請先執行 `10x-chat login <provider>`。

```bash
claude mcp add 10x -- 10x-chat mcp
```

其他 MCP 用戶端：

```json
{
  "mcpServers": {
    "10x-chat": { "command": "10x-chat", "args": ["mcp"] }
  }
}
```

| 工具 | 參數 | 說明 |
|------|------|------|
| `providers_list` | — | 唯讀。名稱、顯示名稱、預設模型、模型、支援的工具 |
| `chat` | `prompt`, `provider?`, `model?`, `files?`, `attach?`, `timeout_seconds?` | 單一提供者 |
| `chat_many` | `prompt`, `providers?`（預設：所有聊天提供者）, `model?`, `files?`, `attach?`, `timeout_seconds?` | 平行執行；每個提供者各有結果或錯誤 |
| `research` | `prompt`, `provider?`（gemini、chatgpt、perplexity）, `model?`, `timeout_seconds?` | 通常回傳 job |
| `image` | `prompt`, `provider?`（chatgpt、gemini、grok）, `save_dir?`, `timeout_seconds?` | 回傳本機圖片路徑 |
| `get_job` | `job_id`, `wait_seconds?`（最多 30） | 唯讀。狀態 `running` / `done` / `failed` / `cancelled` |
| `cancel_job` | `job_id` | 將 job 標為取消並丟棄結果 |
| `session_get` | `session_id` | 唯讀。工作階段中繼資料與回應文字 |

`files` 與 `attach` 只接受本機路徑（不支援 glob），總大小上限 25 MB。

**Job 模型。** 每個寫入工具會啟動一個 job 並最多等待 20 秒。完成就直接回傳結果；否則回傳 `{job_id, status: "running"}`，請呼叫 `get_job`（可帶 `wait_seconds`）直到狀態不是 `running`。Job 存在記憶體中，伺服器停止即消失。`cancel_job` 不會中斷正在執行的瀏覽器步驟，只會丟棄結果。

**錯誤**以工具錯誤回傳，JSON 內容為 `{code, message, retry}`，`retry` 為 `yes`、`no` 或 `after_login`。代碼：`not_logged_in`（執行 `10x-chat login <provider>`）、`unknown_provider`、`unsupported`、`invalid_input`、`timeout`、`provider_error`、`job_not_found`、`session_not_found`。

## 支援的提供者

| 提供者 | 狀態 | 模型 | 網址 |
|--------|------|------|------|
| ChatGPT | ✅ 對話 + 圖片 | — | chatgpt.com |
| Gemini | ✅ 對話 + 圖片 | Flash-Lite、**Flash**（預設）、Pro、Argon、Deep Think | gemini.google.com |
| Claude | ✅ 對話 | — | claude.ai |
| Grok | ✅ 對話 + 圖片 | — | grok.com |
| Perplexity | ✅ | — | perplexity.ai |
| NotebookLM | ✅ | — | notebooklm.google.com |
| Google Flow | ✅ 影片（Veo） | **Omni Flash**（預設）、Veo 3.1 Lite/Fast/Quality | labs.google/fx/tools/flow |
| Dreamina | ✅ 影片（Seedance） | Seedance 2.0 Fast/2.0（1.x 常因方案鎖定） | dreamina.capcut.com |

## 開發

```bash
bun install
bun run dev login chatgpt      # 以開發模式執行 CLI
bun run typecheck               # 型別檢查
bun run lint                    # 程式碼檢查
bun run test                    # 執行測試
bun run build                   # 建置正式版本
```

## 發佈

發佈透過 GitHub Actions 自動化。推送 `agent-skill-v<version>` 標籤即可發佈：

```bash
npm version patch --no-git-tag-version   # 或 minor / major
git commit -am "chore(agent-skill): bump version to <version>"
git tag agent-skill-v<version>
git push origin main agent-skill-v<version>
```

發佈使用 npm trusted publishing（OIDC），不需要儲存 token。npmjs.com 上的 trusted publisher 為 `MikeChongCan/10x-chat`，workflow 為 `agent-skill-release.yml`。

## 免責聲明

本專案**僅供研究與教育用途**。它會自動化網頁介面，這些介面可能受各服務供應商的
服務條款約束。您須自行負責使用方式，包括遵守任何適用條款，並自行承擔使用風險。

## 授權

MIT © Mike Chong — 詳見 [LICENSE](./LICENSE)。
