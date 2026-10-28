import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runChat: vi.fn(),
  runChatAll: vi.fn(),
  runResearch: vi.fn(),
  runImageGen: vi.fn(),
}));

vi.mock('../src/core/orchestrator.js', () => ({
  CHAT_PROVIDERS: ['chatgpt', 'gemini', 'claude', 'grok', 'perplexity'],
  runChat: mocks.runChat,
  runChatAll: mocks.runChatAll,
}));
vi.mock('../src/core/research-orchestrator.js', () => ({
  RESEARCH_PROVIDERS: ['gemini', 'chatgpt', 'perplexity'],
  runResearch: mocks.runResearch,
}));
vi.mock('../src/core/image-orchestrator.js', () => ({
  IMAGE_PROVIDERS: ['chatgpt', 'gemini', 'grok'],
  runImageGen: mocks.runImageGen,
}));

const { createMcpServer } = await import('../src/mcp/server.js');

type ToolResult = { isError?: boolean; content: Array<{ type: string; text: string }> };

async function connect(inlineWaitMs = 200) {
  const server = createMcpServer({ inlineWaitMs });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(clientT);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as ToolResult;
    return { isError: res.isError === true, body: JSON.parse(res.content[0].text) };
  };
  return { client, call };
}

const chatResult = {
  sessionId: 's1',
  provider: 'gemini',
  response: 'hi',
  truncated: false,
  durationMs: 5,
};

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
});

describe('MCP server', () => {
  it('lists all tools with read-only hints', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual(
      [
        'cancel_job',
        'chat',
        'chat_many',
        'get_job',
        'image',
        'providers_list',
        'research',
        'session_get',
      ].sort(),
    );
    for (const ro of ['providers_list', 'get_job', 'session_get']) {
      expect(byName[ro].annotations?.readOnlyHint).toBe(true);
    }
    expect(byName.chat.annotations?.readOnlyHint).not.toBe(true);
  });

  it('providers_list returns providers with default models', async () => {
    const { call } = await connect();
    const { body } = await call('providers_list');
    const gemini = body.providers.find((p: { name: string }) => p.name === 'gemini');
    expect(gemini.displayName).toBeTruthy();
    expect(gemini.tools).toEqual(expect.arrayContaining(['chat', 'research', 'image']));
  });

  it('chat returns the result inline when fast', async () => {
    mocks.runChat.mockResolvedValue(chatResult);
    const { call } = await connect();
    const res = await call('chat', { prompt: 'hello', provider: 'gemini', timeout_seconds: 10 });
    expect(res.isError).toBe(false);
    expect(res.body.response).toBe('hi');
    expect(mocks.runChat).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'hello', provider: 'gemini', timeoutMs: 10_000 }),
    );
  });

  it('chat returns a job id when slow, and get_job waits for the result', async () => {
    let release = () => {};
    mocks.runChat.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(chatResult);
        }),
    );
    const { call } = await connect(20);
    const first = await call('chat', { prompt: 'slow' });
    expect(first.body.status).toBe('running');
    const jobId = first.body.job_id;
    expect((await call('get_job', { job_id: jobId })).body.status).toBe('running');
    setTimeout(() => release(), 20);
    const done = await call('get_job', { job_id: jobId, wait_seconds: 5 });
    expect(done.body.status).toBe('done');
    expect(done.body.result.response).toBe('hi');
  });

  it('cancel_job marks the job cancelled', async () => {
    mocks.runResearch.mockImplementation(() => new Promise(() => {}));
    const { call } = await connect(10);
    const first = await call('research', { prompt: 'deep' });
    const cancelled = await call('cancel_job', { job_id: first.body.job_id });
    expect(cancelled.body.status).toBe('cancelled');
    expect((await call('get_job', { job_id: first.body.job_id })).body.status).toBe('cancelled');
  });

  it('maps not-logged-in to a tool error', async () => {
    mocks.runChat.mockRejectedValue(
      new Error('Not logged in to ChatGPT. Run: 10x-chat login chatgpt'),
    );
    const { call } = await connect();
    const res = await call('chat', { prompt: 'x', provider: 'chatgpt' });
    expect(res.isError).toBe(true);
    expect(res.body).toMatchObject({ code: 'not_logged_in', retry: 'after_login' });
  });

  it('returns errors for unknown providers, unsupported features, missing jobs, bad files', async () => {
    const { call } = await connect();
    expect((await call('chat', { prompt: 'x', provider: 'nope' })).body.code).toBe(
      'unknown_provider',
    );
    expect((await call('research', { prompt: 'x', provider: 'claude' })).body.code).toBe(
      'unsupported',
    );
    expect((await call('get_job', { job_id: 'missing' })).body.code).toBe('job_not_found');
    expect((await call('cancel_job', { job_id: 'missing' })).body.code).toBe('job_not_found');
    const bad = await call('chat', { prompt: 'x', files: ['/no/such/file.txt'] });
    expect(bad.isError).toBe(true);
    expect(bad.body.code).toBe('invalid_input');
    expect(mocks.runChat).not.toHaveBeenCalled();
  });

  it('rejects get_job wait_seconds above 30', async () => {
    const { client } = await connect();
    const res = (await client.callTool({
      name: 'get_job',
      arguments: { job_id: 'x', wait_seconds: 31 },
    })) as ToolResult;
    expect(res.isError).toBe(true);
  });

  it('chat_many passes files and maps per-provider errors', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), '10x-mcp-'));
    const f = path.join(dir, 'ctx.md');
    await writeFile(f, '# ctx');
    mocks.runChatAll.mockResolvedValue([
      { provider: 'gemini', result: chatResult },
      { provider: 'grok', error: 'Not logged in to Grok. Run: 10x-chat login grok' },
    ]);
    const { call } = await connect();
    const res = await call('chat_many', { prompt: 'x', providers: ['gemini', 'grok'], files: [f] });
    expect(mocks.runChatAll).toHaveBeenCalledWith(
      expect.objectContaining({ providers: ['gemini', 'grok'], file: [f], attach: [] }),
    );
    expect(res.body.results[0].result.response).toBe('hi');
    expect(res.body.results[1].error.code).toBe('not_logged_in');
  });

  it('image passes save_dir and the default provider', async () => {
    mocks.runImageGen.mockResolvedValue({ sessionId: 's', images: [], text: '' });
    const { call } = await connect();
    await call('image', { prompt: 'a cat', save_dir: '/tmp/out' });
    expect(mocks.runImageGen).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'chatgpt', saveDir: '/tmp/out' }),
    );
  });

  it('session_get rejects bad and unknown ids', async () => {
    const { call } = await connect();
    expect((await call('session_get', { session_id: '../x' })).body.code).toBe('invalid_input');
    expect((await call('session_get', { session_id: 'no-such-session-zzz' })).body.code).toBe(
      'session_not_found',
    );
  });
});
