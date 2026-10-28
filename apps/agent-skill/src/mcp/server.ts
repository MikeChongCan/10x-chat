import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { IMAGE_PROVIDERS, runImageGen } from '../core/image-orchestrator.js';
import { CHAT_PROVIDERS, runChat, runChatAll } from '../core/orchestrator.js';
import { RESEARCH_PROVIDERS, runResearch } from '../core/research-orchestrator.js';
import { getProvider, listProviders } from '../providers/index.js';
import { getSession } from '../session/index.js';
import type { ProviderName } from '../types.js';
import { ToolError, type ToolErrorBody, toErrorBody } from './errors.js';
import { type JobContext, JobStore, type JobView } from './jobs.js';
import { validateLocalFiles, validateProvider, validateSessionId } from './validate.js';

/**
 * The work functions the tools call. Today they are the Playwright
 * orchestrators. A later transport (for example the user's real Chrome) can
 * supply its own set without changes to the tool layer.
 */
export interface McpRunners {
  runChat: typeof runChat;
  runChatAll: typeof runChatAll;
  runResearch: typeof runResearch;
  runImageGen: typeof runImageGen;
}

export const defaultRunners: McpRunners = { runChat, runChatAll, runResearch, runImageGen };

export interface McpServerOptions {
  runners?: McpRunners;
  jobs?: JobStore;
  /** How long a write tool waits inline before it returns a job id. Default 20 s. */
  inlineWaitMs?: number;
  version?: string;
}

/** Longest `wait_seconds` that `get_job` accepts. */
export const MAX_GET_JOB_WAIT_SECONDS = 30;

function ok(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function failBody(body: ToolErrorBody): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }] };
}

function fail(error: unknown): CallToolResult {
  return failBody(toErrorBody(error));
}

async function guarded(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (error) {
    return fail(error);
  }
}

const promptField = z.string().min(1).describe('The prompt to send');
const modelField = z
  .string()
  .optional()
  .describe('Model or mode name. Default: the provider default (see providers_list)');
const filesField = z
  .array(z.string())
  .optional()
  .describe('Local file paths. Their text is put into the prompt as context. Max 25 MB total.');
const attachField = z
  .array(z.string())
  .optional()
  .describe('Local file paths to upload to the provider (images, PDFs). Max 25 MB total.');
const timeoutField = z
  .number()
  .int()
  .positive()
  .max(3600)
  .optional()
  .describe('Response timeout in seconds');

const JOB_NOTE =
  'If the work is not done in about 20 s, the result is {job_id, status:"running"}; then call get_job.';

export function createMcpServer(opts: McpServerOptions = {}): McpServer {
  const runners = opts.runners ?? defaultRunners;
  const jobs = opts.jobs ?? new JobStore();
  const inlineWaitMs = opts.inlineWaitMs ?? 20_000;

  const server = new McpServer({ name: '10x-chat', version: opts.version ?? '0.0.0' });

  /** Start a job, wait inline, and return the result or the job handle. */
  async function runAsJob(
    kind: string,
    work: (ctx: JobContext) => Promise<unknown>,
  ): Promise<CallToolResult> {
    const id = jobs.start(kind, work);
    const view = (await jobs.wait(id, inlineWaitMs)) as JobView;
    if (view.status === 'done') return ok(view.result);
    if (view.status === 'failed' && view.error) return failBody(view.error);
    return ok({ job_id: view.job_id, status: view.status, progress: view.progress });
  }

  // ── Read-only tools ────────────────────────────────────────────

  server.registerTool(
    'providers_list',
    {
      description:
        'List the web AI providers, their default model, known models, and which tools they support.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      guarded(async () => {
        const providers = listProviders().map((name) => {
          const { config } = getProvider(name);
          const tools: string[] = [];
          if (CHAT_PROVIDERS.includes(name) || name === 'notebooklm') tools.push('chat');
          if (CHAT_PROVIDERS.includes(name)) tools.push('chat_many');
          if (RESEARCH_PROVIDERS.includes(name)) tools.push('research');
          if (IMAGE_PROVIDERS.includes(name)) tools.push('image');
          return {
            name,
            displayName: config.displayName,
            defaultModel: config.defaultModel ?? null,
            models: config.models ?? [],
            tools,
          };
        });
        return ok({ providers });
      }),
  );

  server.registerTool(
    'get_job',
    {
      description:
        'Get the status of a job from chat, chat_many, research, or image. Status: running | done | failed | cancelled. Set wait_seconds to wait for the job to finish.',
      inputSchema: {
        job_id: z.string().min(1),
        wait_seconds: z
          .number()
          .min(0)
          .max(MAX_GET_JOB_WAIT_SECONDS)
          .optional()
          .describe(
            `Wait up to this many seconds for the job to finish (max ${MAX_GET_JOB_WAIT_SECONDS})`,
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ job_id, wait_seconds }) =>
      guarded(async () => {
        const view = await jobs.wait(job_id, (wait_seconds ?? 0) * 1000);
        if (!view) throw new ToolError('job_not_found', `No job with id ${job_id}`);
        return ok(view);
      }),
  );

  server.registerTool(
    'session_get',
    {
      description: 'Get a saved 10x-chat session by id: metadata and the captured response text.',
      inputSchema: { session_id: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ session_id }) =>
      guarded(async () => {
        const id = validateSessionId(session_id);
        let session: Awaited<ReturnType<typeof getSession>>;
        try {
          session = await getSession(id);
        } catch {
          throw new ToolError('session_not_found', `No session with id ${id}`);
        }
        const response = session.responsePath
          ? await readFile(session.responsePath, 'utf-8')
          : null;
        return ok({ meta: session.meta, response });
      }),
  );

  // ── Write tools ────────────────────────────────────────────────

  server.registerTool(
    'chat',
    {
      description: `Send a prompt to one web AI (ChatGPT, Gemini, Claude, Grok, Perplexity) in a browser and return its answer. ${JOB_NOTE}`,
      inputSchema: {
        prompt: promptField,
        provider: z.string().optional().describe('Provider name. Default: config default provider'),
        model: modelField,
        files: filesField,
        attach: attachField,
        timeout_seconds: timeoutField,
      },
    },
    async (args) =>
      guarded(async () => {
        const provider = args.provider ? validateProvider(args.provider) : undefined;
        const [file, attach] = await validateLocalFiles([args.files, args.attach]);
        return runAsJob('chat', async (ctx) => {
          ctx.setProgress(`waiting for ${provider ?? 'default provider'}`);
          return runners.runChat({
            prompt: args.prompt,
            provider,
            model: args.model,
            file,
            attach,
            timeoutMs: args.timeout_seconds ? args.timeout_seconds * 1000 : undefined,
          });
        });
      }),
  );

  server.registerTool(
    'chat_many',
    {
      description: `Send the same prompt to several web AIs in parallel. Each provider has its own result or error. ${JOB_NOTE}`,
      inputSchema: {
        prompt: promptField,
        providers: z
          .array(z.string())
          .min(1)
          .optional()
          .describe(`Provider names. Default: ${CHAT_PROVIDERS.join(', ')}`),
        model: modelField,
        files: filesField,
        attach: attachField,
        timeout_seconds: timeoutField,
      },
    },
    async (args) =>
      guarded(async () => {
        const providers = (args.providers ?? CHAT_PROVIDERS).map((p) => validateProvider(p));
        const [file, attach] = await validateLocalFiles([args.files, args.attach]);
        return runAsJob('chat_many', async (ctx) => {
          ctx.setProgress(`waiting for ${providers.join(', ')}`);
          const results = await runners.runChatAll({
            prompt: args.prompt,
            providers,
            model: args.model,
            file,
            attach,
            timeoutMs: args.timeout_seconds ? args.timeout_seconds * 1000 : undefined,
          });
          return {
            results: results.map((r) =>
              r.error ? { provider: r.provider, error: toErrorBody(new Error(r.error)) } : r,
            ),
          };
        });
      }),
  );

  server.registerTool(
    'research',
    {
      description: `Run deep research (Gemini, ChatGPT, Perplexity). This takes minutes, so it usually returns a job_id; then call get_job. ${JOB_NOTE}`,
      inputSchema: {
        prompt: promptField,
        provider: z.string().optional().describe('gemini (default), chatgpt, or perplexity'),
        model: modelField,
        timeout_seconds: timeoutField,
      },
    },
    async (args) =>
      guarded(async () => {
        const provider: ProviderName = validateProvider(
          args.provider ?? 'gemini',
          RESEARCH_PROVIDERS,
          'deep research',
        );
        return runAsJob('research', async (ctx) => {
          ctx.setProgress(`researching on ${provider}`);
          return runners.runResearch({
            prompt: args.prompt,
            provider,
            model: args.model,
            timeoutMs: args.timeout_seconds ? args.timeout_seconds * 1000 : undefined,
          });
        });
      }),
  );

  server.registerTool(
    'image',
    {
      description: `Generate images (ChatGPT, Gemini, Grok). Returns local file paths of the saved images. ${JOB_NOTE}`,
      inputSchema: {
        prompt: promptField,
        provider: z.string().optional().describe('chatgpt (default), gemini, or grok'),
        save_dir: z.string().optional().describe('Directory to save images. Default: session dir'),
        timeout_seconds: timeoutField,
      },
    },
    async (args) =>
      guarded(async () => {
        const provider: ProviderName = validateProvider(
          args.provider ?? 'chatgpt',
          IMAGE_PROVIDERS,
          'image generation',
        );
        return runAsJob('image', async (ctx) => {
          ctx.setProgress(`generating on ${provider}`);
          return runners.runImageGen({
            prompt: args.prompt,
            provider,
            saveDir: args.save_dir,
            timeoutMs: args.timeout_seconds ? args.timeout_seconds * 1000 : undefined,
          });
        });
      }),
  );

  server.registerTool(
    'cancel_job',
    {
      description:
        'Cancel a running job. The job is marked cancelled and its result is dropped. The browser tab may finish its current step in the background.',
      inputSchema: { job_id: z.string().min(1) },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ job_id }) =>
      guarded(async () => {
        const view = jobs.cancel(job_id);
        if (!view) throw new ToolError('job_not_found', `No job with id ${job_id}`);
        return ok(view);
      }),
  );

  return server;
}
