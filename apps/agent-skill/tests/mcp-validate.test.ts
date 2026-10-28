import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ToolError, toErrorBody } from '../src/mcp/errors.js';
import { validateLocalFiles, validateProvider, validateSessionId } from '../src/mcp/validate.js';

describe('toErrorBody', () => {
  it.each([
    ['Not logged in to ChatGPT. Run: 10x-chat login chatgpt', 'not_logged_in', 'after_login'],
    ['Unknown provider "x". Available: a', 'unknown_provider', 'no'],
    ['Provider "claude" does not support deep research', 'unsupported', 'no'],
    ['page.waitForSelector: Timeout 30000ms exceeded', 'timeout', 'yes'],
    ['Something broke', 'provider_error', 'yes'],
  ])('maps %s', (message, code, retry) => {
    const body = toErrorBody(new Error(message));
    expect(body.code).toBe(code);
    expect(body.retry).toBe(retry);
  });

  it('tells the agent the login command', () => {
    const body = toErrorBody(new Error('Not logged in to Grok. Run: 10x-chat login grok'));
    expect(body.message).toContain('`10x-chat login grok`');
  });

  it('keeps ToolError fields', () => {
    expect(toErrorBody(new ToolError('job_not_found', 'gone'))).toEqual({
      code: 'job_not_found',
      message: 'gone',
      retry: 'no',
    });
  });
});

describe('validateLocalFiles', () => {
  it('resolves existing files, rejects missing files, dirs, globs, and size overflow', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), '10x-mcp-'));
    const a = path.join(dir, 'a.txt');
    await writeFile(a, 'hello');
    const [files, attach] = await validateLocalFiles([[a], undefined]);
    expect(files).toEqual([a]);
    expect(attach).toEqual([]);

    await expect(validateLocalFiles([[path.join(dir, 'missing.txt')]])).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(validateLocalFiles([[dir]])).rejects.toThrow(/Not a regular file/);
    await expect(validateLocalFiles([[`${dir}/*.txt`]])).rejects.toThrow(/Globs/);
    await expect(validateLocalFiles([[a], [a]], 6)).rejects.toThrow(/MB limit/);
  });
});

describe('validateProvider / validateSessionId', () => {
  it('checks names and allow-lists', () => {
    expect(validateProvider('gemini')).toBe('gemini');
    expect(() => validateProvider('nope')).toThrow(ToolError);
    try {
      validateProvider('claude', ['gemini'], 'deep research');
    } catch (e) {
      expect((e as ToolError).code).toBe('unsupported');
    }
  });

  it('rejects path traversal in session ids', () => {
    expect(validateSessionId('abc-123')).toBe('abc-123');
    expect(() => validateSessionId('../etc')).toThrow(/Invalid session id/);
  });
});
