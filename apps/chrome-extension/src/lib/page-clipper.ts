import TurndownService from "turndown"
import Defuddle from "defuddle"

export interface ConversationTurn {
  role: "user" | "assistant" | "system"
  author: string
  content: string
}

export interface ClippedResult {
  title: string
  fileName: string
  platform: string
  url: string
  markdown: string
  turnCount?: number
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  const safeName = cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned
  return safeName ? `${safeName}.md` : "clipped-page.md"
}

/**
 * Safely format a string scalar for YAML frontmatter.
 * JSON string encoding is fully compatible with YAML 1.2 double-quoted string scalars,
 * ensuring all backslashes, quotes, and control characters are safely escaped.
 */
export function toYamlString(val: string): string {
  return JSON.stringify(val)
}

export function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*"
  })

  // Keep preformatted code blocks intact
  turndown.addRule("fencedCodeBlock", {
    filter: (node) => {
      return (
        node.nodeName === "PRE" ||
        (node.nodeName === "CODE" && node.parentNode?.nodeName !== "PRE" && node.textContent?.includes("\n")) === true
      )
    },
    replacement: (_content, node) => {
      const codeElement = node.nodeName === "PRE" ? node.querySelector("code") : node
      const languageMatch =
        codeElement?.className?.match(/(?:lang|language)-(\w+)/) ||
        codeElement?.getAttribute("data-language")?.match(/(\w+)/)
      const language = languageMatch ? languageMatch[1] : ""
      const codeText = codeElement ? codeElement.textContent || "" : node.textContent || ""
      const normalizedCode = codeText.replace(/\r\n/g, "\n").trim()
      const backtickMatches = normalizedCode.match(/`{3,}/g)
      const maxBackticks = backtickMatches
        ? Math.max(...backtickMatches.map((m) => m.length))
        : 2
      const fence = "`".repeat(Math.max(3, maxBackticks + 1))
      return `\n\n${fence}${language}\n${normalizedCode}\n${fence}\n\n`
    }
  })

  // Handle tables gracefully into GitHub Flavored Markdown
  turndown.addRule("tables", {
    filter: ["table"],
    replacement: (_content, node) => {
      const table = node as HTMLTableElement
      const rows = Array.from(table.querySelectorAll("tr"))
      if (rows.length === 0) return ""

      const markdownRows: string[] = []
      rows.forEach((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll("th, td"))
        const rowCells = cells.map((cell) => {
          return cell.textContent?.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim() || ""
        })
        markdownRows.push(`| ${rowCells.join(" | ")} |`)

        // Add separator after header row (or first row)
        if (rowIndex === 0) {
          const separator = cells.map(() => "---")
          markdownRows.push(`| ${separator.join(" | ")} |`)
        }
      })

      return `\n\n${markdownRows.join("\n")}\n\n`
    }
  })

  // Discard interactive UI noise
  turndown.addRule("discardUINoise", {
    filter: (node) => ["button", "svg", "style", "script", "noscript"].includes(node.nodeName.toLowerCase()),
    replacement: () => ""
  })

  return turndown
}

/**
 * Extract conversation turns from ChatGPT DOM
 */
export function extractChatGPTTurns(doc: Document): ConversationTurn[] {
  const turns = Array.from(doc.querySelectorAll('[data-testid^="conversation-turn-"]'))
  const result: ConversationTurn[] = []
  const turndown = createTurndownService()

  for (const turn of turns) {
    const isUser =
      turn.querySelector('h4.sr-only, h5.sr-only, h6.sr-only')?.textContent?.toLowerCase().includes("you") ||
      turn.querySelector('[data-message-author-role="user"]') !== null ||
      turn.querySelector(".text-message") !== null

    const authorRole = isUser ? "user" : "assistant"
    const author = isUser ? "You" : "ChatGPT"

    // Extract message body
    const contentElement =
      turn.querySelector(".markdown") ||
      turn.querySelector('[data-message-author-role]') ||
      turn.querySelector(".whitespace-pre-wrap") ||
      turn

    const clone = contentElement.cloneNode(true) as HTMLElement
    clone.querySelectorAll("button, [data-state='closed'], .sr-only").forEach((el) => el.remove())

    const markdown = turndown.turndown(clone.innerHTML || clone.textContent || "").trim()
    if (markdown) {
      result.push({
        role: authorRole,
        author,
        content: markdown
      })
    }
  }

  return result
}

/**
 * Extract conversation turns from Claude DOM
 */
export function extractClaudeTurns(doc: Document): ConversationTurn[] {
  const messageNodes = Array.from(
    doc.querySelectorAll('div[data-testid="user-message"], div[data-testid="assistant-message"], div.font-claude-response')
  )
  const result: ConversationTurn[] = []
  const turndown = createTurndownService()

  for (const node of messageNodes) {
    const isUser =
      node.getAttribute("data-testid") === "user-message" ||
      node.classList.contains("font-user-message")
    const author = isUser ? "You" : "Claude"
    const role = isUser ? "user" : "assistant"

    const bodyElement =
      node.querySelector(".standard-markdown") ||
      node.querySelector(".font-claude-response") ||
      node

    const clone = bodyElement.cloneNode(true) as HTMLElement
    clone.querySelectorAll("button, [data-state='closed'], .sr-only").forEach((el) => el.remove())

    const markdown = turndown.turndown(clone.innerHTML || clone.textContent || "").trim()
    if (markdown) {
      result.push({
        role,
        author,
        content: markdown
      })
    }
  }

  return result
}

/**
 * Extract conversation turns from Gemini DOM
 */
export function extractGeminiTurns(doc: Document): ConversationTurn[] {
  const containers = Array.from(doc.querySelectorAll("div.conversation-container, .chat-turn"))
  const result: ConversationTurn[] = []
  const turndown = createTurndownService()

  for (const container of containers) {
    const userQuery = container.querySelector("user-query, .query-text")
    if (userQuery) {
      const text = userQuery.textContent?.trim() || ""
      if (text) {
        result.push({
          role: "user",
          author: "You",
          content: text
        })
      }
    }

    const modelResponse = container.querySelector("model-response, .model-response-text")
    if (modelResponse) {
      const contentEl =
        modelResponse.querySelector("#extended-response-markdown-content") ||
        modelResponse.querySelector(".model-response-text .markdown") ||
        modelResponse

      const clone = contentEl.cloneNode(true) as HTMLElement
      clone.querySelectorAll("button, mat-icon, .sr-only").forEach((el) => el.remove())

      const markdown = turndown.turndown(clone.innerHTML || clone.textContent || "").trim()
      if (markdown) {
        result.push({
          role: "assistant",
          author: "Gemini",
          content: markdown
        })
      }
    }
  }

  return result
}

/**
 * Extract conversation turns from Grok DOM
 */
export function extractGrokTurns(doc: Document): ConversationTurn[] {
  const containers = Array.from(
    doc.querySelectorAll(".relative.group.flex.flex-col.justify-center.w-full, .message-bubble")
  )
  const result: ConversationTurn[] = []
  const turndown = createTurndownService()

  for (const container of containers) {
    const isUser = container.classList.contains("items-end")
    const isGrok = container.classList.contains("items-start")
    const bubble = container.classList.contains("message-bubble")
      ? container
      : container.querySelector(".message-bubble")
    if (!bubble) continue

    const author = isUser ? "You" : "Grok"
    const role = isUser ? "user" : "assistant"

    if (isUser) {
      const text = bubble.textContent?.trim() || ""
      if (text) {
        result.push({ role, author, content: text })
      }
    } else if (isGrok) {
      const clone = bubble.cloneNode(true) as HTMLElement
      clone.querySelectorAll("button, svg").forEach((el) => el.remove())
      const markdown = turndown.turndown(clone.innerHTML || clone.textContent || "").trim()
      if (markdown) {
        result.push({ role, author, content: markdown })
      }
    }
  }

  return result
}

/**
 * Extract conversation turns from Perplexity DOM
 */
export function extractPerplexityTurns(doc: Document): ConversationTurn[] {
  const result: ConversationTurn[] = []
  const turndown = createTurndownService()

  // Queries are usually in headers or query containers
  const queryContainers = Array.from(doc.querySelectorAll("[data-testid='query-text'], h1, .font-display"))
  const proseContainers = Array.from(doc.querySelectorAll(".prose"))

  const count = Math.max(queryContainers.length, proseContainers.length)
  for (let i = 0; i < count; i++) {
    const query = queryContainers[i]
    if (query && query.textContent?.trim()) {
      result.push({
        role: "user",
        author: "You",
        content: query.textContent.trim()
      })
    }

    const answer = proseContainers[i]
    if (answer) {
      const clone = answer.cloneNode(true) as HTMLElement
      clone.querySelectorAll("button, svg").forEach((el) => el.remove())
      const markdown = turndown.turndown(clone.innerHTML || clone.textContent || "").trim()
      if (markdown) {
        result.push({
          role: "assistant",
          author: "Perplexity",
          content: markdown
        })
      }
    }
  }

  return result
}

/**
 * Extract readable content and convert to Markdown
 */
export function clipDocumentToMarkdown(doc: Document, url: string): ClippedResult {
  const urlObj = new URL(url)
  const hostname = urlObj.hostname.toLowerCase()
  const now = new Date().toISOString().replace("T", " ").slice(0, 19)

  let platform = "Web"
  let turns: ConversationTurn[] = []

  if (hostname.includes("chatgpt.com")) {
    platform = "ChatGPT"
    turns = extractChatGPTTurns(doc)
  } else if (hostname.includes("claude.ai")) {
    platform = "Claude"
    turns = extractClaudeTurns(doc)
  } else if (hostname.includes("gemini.google.com")) {
    platform = "Gemini"
    turns = extractGeminiTurns(doc)
  } else if (hostname.includes("grok.com")) {
    platform = "Grok"
    turns = extractGrokTurns(doc)
  } else if (hostname.includes("perplexity.ai")) {
    platform = "Perplexity"
    turns = extractPerplexityTurns(doc)
  }

  const pageTitle = doc.title?.trim() || `${platform} Conversation`

  // If conversation turns were extracted from an AI chat:
  if (turns.length > 0) {
    const firstUserTurn = turns.find((t) => t.role === "user")
    const titleCandidate = firstUserTurn ? firstUserTurn.content.slice(0, 60) : pageTitle
    const cleanTitle = titleCandidate.replace(/\n/g, " ").trim() || pageTitle

    const lines: string[] = [
      "---",
      `title: ${toYamlString(cleanTitle)}`,
      `date: ${toYamlString(now)}`,
      `source: ${toYamlString(url)}`,
      `platform: ${toYamlString(platform)}`,
      `message_count: ${turns.length}`,
      `clipped_by: "10xWise Multi-AI Chat"`,
      "---",
      "",
      `# ${cleanTitle}`,
      ""
    ]

    for (const turn of turns) {
      const icon = turn.role === "user" ? "🧑" : "🤖"
      lines.push(`### ${icon} ${turn.author}`)
      lines.push("")
      lines.push(turn.content)
      lines.push("")
      lines.push("---")
      lines.push("")
    }

    const markdown = lines.join("\n").trim() + "\n"
    return {
      title: cleanTitle,
      fileName: sanitizeFilename(`${platform} - ${cleanTitle}`),
      platform,
      url,
      markdown,
      turnCount: turns.length
    }
  }

  // Otherwise, use Defuddle / readability for general web page
  try {
    const defuddle = new Defuddle(doc, { url })
    const parsed = defuddle.parse()
    const turndown = createTurndownService()
    const articleMarkdown = turndown.turndown(parsed.content || doc.body.innerHTML || "").trim()

    const title = parsed.title || pageTitle
    const lines: string[] = [
      "---",
      `title: ${toYamlString(title)}`,
      `date: ${toYamlString(now)}`,
      `source: ${toYamlString(url)}`,
      parsed.author ? `author: ${toYamlString(parsed.author)}` : "",
      parsed.site ? `site: ${toYamlString(parsed.site)}` : "",
      `clipped_by: "10xWise Multi-AI Chat"`,
      "---",
      "",
      `# ${title}`,
      ""
    ].filter(Boolean)

    if (parsed.description) {
      lines.push(`> ${parsed.description}`)
      lines.push("")
    }

    lines.push(articleMarkdown)
    const markdown = lines.join("\n").trim() + "\n"

    return {
      title,
      fileName: sanitizeFilename(title),
      platform: parsed.site || "Web",
      url,
      markdown
    }
  } catch (err) {
    console.warn("Defuddle parsing fallback:", err)
    const turndown = createTurndownService()
    const fallbackMarkdown = turndown.turndown(doc.body.innerHTML || "").trim()
    const title = pageTitle || "Web Page"

    const markdown = [
      "---",
      `title: ${toYamlString(title)}`,
      `date: ${toYamlString(now)}`,
      `source: ${toYamlString(url)}`,
      `clipped_by: "10xWise Multi-AI Chat"`,
      "---",
      "",
      `# ${title}`,
      "",
      fallbackMarkdown
    ].join("\n").trim() + "\n"

    return {
      title,
      fileName: sanitizeFilename(title),
      platform: "Web",
      url,
      markdown
    }
  }
}
