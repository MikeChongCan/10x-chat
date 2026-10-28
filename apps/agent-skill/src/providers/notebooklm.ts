import type { Page } from 'playwright';
import { NotebookLMClient } from '../notebooklm/client.js';
import type { CapturedResponse, ProviderActions, ProviderConfig } from '../types.js';

export const NOTEBOOKLM_CONFIG: ProviderConfig = {
  name: 'notebooklm',
  displayName: 'NotebookLM',
  url: 'https://notebooklm.google.com/',
  loginUrl: 'https://notebooklm.google.com/',
  defaultTimeoutMs: 5 * 60 * 1000,
};

/**
 * Memoised client init promise to prevent race conditions
 * when multiple concurrent calls hit getClient() simultaneously.
 */
let clientInitPromise: Promise<NotebookLMClient> | null = null;
let cachedNotebookId: string | null = null;

function getClient(): Promise<NotebookLMClient> {
  if (!clientInitPromise) {
    clientInitPromise = (async () => {
      // Reuses cookies from the shared Gemini Google profile
      const client = await NotebookLMClient.fromStorage();
      await client.open();
      // Ensure cleanup on process exit to avoid resource leaks
      process.once('beforeExit', () => {
        client.close().catch(() => {});
      });
      return client;
    })();
  }
  return clientInitPromise;
}

/**
 * Get (or create) a notebook to use for this chat session.
 * Uses the most recently accessed notebook, or creates a "10x-chat" notebook.
 */
async function ensureNotebook(client: NotebookLMClient): Promise<string> {
  if (cachedNotebookId) {
    return cachedNotebookId;
  }

  const notebooks = await client.notebooks.list();

  // Use the first existing notebook if available
  if (notebooks.length > 0) {
    cachedNotebookId = notebooks[0].id;
    return cachedNotebookId;
  }

  // Create a default notebook
  const nb = await client.notebooks.create('10x-chat');
  cachedNotebookId = nb.id;
  return cachedNotebookId;
}

/**
 * Per-page session state to avoid global prompt variable race conditions.
 * Each Playwright Page gets its own pending RPC request promise.
 */
const sessionState = new WeakMap<Page, Promise<{ answer: string }>>();

export const notebooklmActions: ProviderActions = {
  async isLoggedIn(_page: Page): Promise<boolean> {
    try {
      // Verify RPC client can authenticate and list notebooks
      const client = await getClient();
      await client.notebooks.list();
      return true;
    } catch {
      return false;
    }
  },

  async submitPrompt(page: Page, prompt: string): Promise<void> {
    const client = await getClient();
    const notebookId = await ensureNotebook(client);

    // Kick off the RPC request immediately and store the promise per-page
    const requestPromise = client.chat.ask(notebookId, prompt);
    sessionState.set(page, requestPromise);
  },

  async captureResponse(
    page: Page,
    opts: {
      timeoutMs: number;
      onChunk?: (chunk: string) => void;
    },
  ): Promise<CapturedResponse> {
    const requestPromise = sessionState.get(page);
    if (!requestPromise) {
      throw new Error('No prompt submitted for this page. Call submitPrompt first.');
    }

    try {
      const result = await requestPromise;
      const text = result.answer;
      opts.onChunk?.(text);

      return {
        text,
        markdown: text,
        truncated: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`NotebookLM chat failed: ${errorMessage}`);
    } finally {
      // Clean up session state after response is captured
      sessionState.delete(page);
    }
  },
};
