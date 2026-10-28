import {
  sanitizeFilename,
  extractChatGPTTurns,
  extractClaudeTurns,
  extractGeminiTurns,
  clipDocumentToMarkdown,
  toYamlString
} from "../../src/lib/page-clipper"

describe("page-clipper", () => {
  describe("sanitizeFilename", () => {
    it("cleans illegal characters and adds .md extension", () => {
      expect(sanitizeFilename("What is AI? A guide: Part 1/2*")).toBe("What is AI A guide Part 12.md")
    })

    it("falls back to clipped-page.md when empty", () => {
      expect(sanitizeFilename("   ")).toBe("clipped-page.md")
      expect(sanitizeFilename("???///:::")).toBe("clipped-page.md")
    })

    it("truncates very long filenames", () => {
      const longTitle = "a".repeat(150)
      const sanitized = sanitizeFilename(longTitle)
      expect(sanitized.endsWith(".md")).toBe(true)
      expect(sanitized.length).toBeLessThanOrEqual(84) // 80 + .md
    })
  })

  describe("extractChatGPTTurns", () => {
    it("extracts user and assistant turns accurately", () => {
      const doc = document.implementation.createHTMLDocument("ChatGPT")
      doc.body.innerHTML = `
        <div data-testid="conversation-turn-1">
          <div data-message-author-role="user" class="text-message">Hello, how do I learn Rust?</div>
        </div>
        <div data-testid="conversation-turn-2">
          <div data-message-author-role="assistant" class="markdown">
            <p>Start with <strong>The Rust Programming Language</strong> book.</p>
            <pre><code class="language-rust">fn main() { println!("Hello!"); }</code></pre>
          </div>
        </div>
      `
      const turns = extractChatGPTTurns(doc)
      expect(turns).toHaveLength(2)
      expect(turns[0].role).toBe("user")
      expect(turns[0].author).toBe("You")
      expect(turns[0].content).toContain("Hello, how do I learn Rust?")

      expect(turns[1].role).toBe("assistant")
      expect(turns[1].author).toBe("ChatGPT")
      expect(turns[1].content).toContain("Start with **The Rust Programming Language** book.")
      expect(turns[1].content).toContain("```rust")
      expect(turns[1].content).toContain("println!")
    })
  })

  describe("extractClaudeTurns", () => {
    it("extracts Claude user and assistant messages", () => {
      const doc = document.implementation.createHTMLDocument("Claude")
      doc.body.innerHTML = `
        <div data-testid="user-message">Write a poem about the sea.</div>
        <div data-testid="assistant-message" class="font-claude-response">
          <div class="standard-markdown">
            <p>The sapphire waves upon the shore,<br>Whisper secrets of before.</p>
          </div>
        </div>
      `
      const turns = extractClaudeTurns(doc)
      expect(turns).toHaveLength(2)
      expect(turns[0].role).toBe("user")
      expect(turns[0].content).toContain("Write a poem about the sea.")
      expect(turns[1].role).toBe("assistant")
      expect(turns[1].author).toBe("Claude")
      expect(turns[1].content).toContain("The sapphire waves upon the shore")
    })
  })

  describe("extractGeminiTurns", () => {
    it("extracts Gemini queries and responses", () => {
      const doc = document.implementation.createHTMLDocument("Gemini")
      doc.body.innerHTML = `
        <div class="conversation-container">
          <user-query><div class="query-text">Explain quantum computing</div></user-query>
          <model-response><div class="model-response-text"><div class="markdown"><p>Quantum computing uses qubits.</p></div></div></model-response>
        </div>
      `
      const turns = extractGeminiTurns(doc)
      expect(turns).toHaveLength(2)
      expect(turns[0].role).toBe("user")
      expect(turns[0].content).toBe("Explain quantum computing")
      expect(turns[1].role).toBe("assistant")
      expect(turns[1].author).toBe("Gemini")
      expect(turns[1].content).toContain("Quantum computing uses qubits.")
    })
  })

  describe("clipDocumentToMarkdown", () => {
    it("generates markdown document with frontmatter for AI chat", () => {
      const doc = document.implementation.createHTMLDocument("ChatGPT - Learn Swift")
      doc.body.innerHTML = `
        <div data-testid="conversation-turn-1">
          <div data-message-author-role="user">Show Swift code</div>
        </div>
        <div data-testid="conversation-turn-2">
          <div data-message-author-role="assistant" class="markdown">
            <pre><code class="language-swift">let x = 10</code></pre>
          </div>
        </div>
      `
      const result = clipDocumentToMarkdown(doc, "https://chatgpt.com/c/12345")
      expect(result.platform).toBe("ChatGPT")
      expect(result.fileName.endsWith(".md")).toBe(true)
      expect(result.markdown).toContain("---")
      expect(result.markdown).toContain('platform: "ChatGPT"')
      expect(result.markdown).toContain("### 🧑 You")
      expect(result.markdown).toContain("### 🤖 ChatGPT")
      expect(result.markdown).toContain("```swift")
      expect(result.markdown).toContain("let x = 10")
    })

    it("handles general web pages via readability extraction", () => {
      const doc = document.implementation.createHTMLDocument("Tech Blog - Modern Web")
      doc.body.innerHTML = `
        <article>
          <h1>Modern Web Development</h1>
          <p>Web development is evolving rapidly with modern frameworks.</p>
        </article>
      `
      const result = clipDocumentToMarkdown(doc, "https://blog.example.com/modern-web")
      expect(result.fileName.endsWith(".md")).toBe(true)
      expect(result.markdown).toContain("---")
      expect(result.markdown).toContain("Modern Web Development")
      expect(result.markdown).toContain("Web development is evolving rapidly")
    })

    it("safely escapes backslashes and quotes in YAML frontmatter", () => {
      expect(toYamlString('Path is C:\\Users\\test "special"')).toBe('"Path is C:\\\\Users\\\\test \\"special\\""')

      const doc = document.implementation.createHTMLDocument('Guide to C:\\Windows\\System32 & "Quotes"')
      doc.body.innerHTML = `
        <article>
          <h1>Guide to Windows</h1>
          <p>System details and files.</p>
        </article>
      `
      const result = clipDocumentToMarkdown(doc, "https://example.com/windows-guide")
      expect(result.markdown).toContain(`title: ${toYamlString('Guide to C:\\Windows\\System32 & "Quotes"')}`)
    })

    it("chooses code fence that cannot collide with triple backticks in code", () => {
      const doc = document.implementation.createHTMLDocument("Markdown Inside Code")
      doc.body.innerHTML = `
        <div data-testid="conversation-turn-1">
          <div data-message-author-role="user">Show markdown example</div>
        </div>
        <div data-testid="conversation-turn-2">
          <div data-message-author-role="assistant" class="markdown">
            <pre><code class="language-markdown">\`\`\`js
console.log('hello')
\`\`\`</code></pre>
          </div>
        </div>
      `
      const result = clipDocumentToMarkdown(doc, "https://chatgpt.com/c/nested")
      expect(result.markdown).toContain("````markdown")
      expect(result.markdown).toContain("````")
    })
  })
})
