import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  encodeMessage,
  FrameDecoder,
  SERVE_IDLE_TIMEOUT,
} from '../skills/10x-chat/bridge/framing.ts';

type Result = { status: number | null; stdout: string; stderr: string };
type Call = { method: string; params: Record<string, unknown> };

function run(
  file: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  command = 'bash',
): Promise<Result> {
  return new Promise((resolve) => {
    const child = spawn(command, [file, ...args], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function listen(server: Server, path: string): Promise<void> {
  return new Promise((resolve) => server.listen(path, resolve));
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function waitFor(check: () => boolean, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (check()) resolve();
      else if (Date.now() > deadline) reject(new Error('waitFor timed out'));
      else setTimeout(tick, 25);
    };
    tick();
  });
}

const bin = (name: string) => `skills/10x-chat/bin/${name}.sh`;

describe('native messaging framing', () => {
  it('round-trips messages', () => {
    const messages = [{ id: 1, method: 'ping' }, { text: 'héllo 世界 😀' }, []];
    const bytes = Buffer.concat(messages.map((message) => encodeMessage(message)));
    expect(new FrameDecoder().push(bytes)).toEqual(messages);
  });
  it('uses a little-endian length prefix', () => {
    const bytes = encodeMessage({ a: 1 });
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(bytes.length - 4);
  });
  it('decodes split chunks', () => {
    const bytes = Buffer.concat([encodeMessage({ id: 7 }), encodeMessage({ id: 8, ok: true })]);
    const decoder = new FrameDecoder();
    const out: unknown[] = [];
    for (let i = 0; i < bytes.length; i += 3) out.push(...decoder.push(bytes.subarray(i, i + 3)));
    expect(out).toEqual([{ id: 7 }, { id: 8, ok: true }]);
  });
  it('skips a bad JSON frame and keeps the others', () => {
    const bad = new Uint8Array(4 + 3);
    new DataView(bad.buffer).setUint32(0, 3, true);
    bad.set(new TextEncoder().encode('{x}'), 4);
    const errors: unknown[] = [];
    const decoder = new FrameDecoder((error) => errors.push(error));
    const bytes = Buffer.concat([encodeMessage({ id: 1 }), bad, encodeMessage({ id: 2 })]);
    expect(decoder.push(bytes)).toEqual([{ id: 1 }, { id: 2 }]);
    expect(errors).toHaveLength(1);
    expect(decoder.push(encodeMessage({ id: 3 }))).toEqual([{ id: 3 }]);
  });
});

describe('bridge client scripts', () => {
  let temp: string;
  let sock: string;
  let server: Server;
  let calls: Call[];
  let userScripts: boolean;
  let allUrls: boolean;
  let failWith: string | null;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    temp = mkdtempSync(join(tmpdir(), 'tb-'));
    sock = join(temp, 'b.sock');
    calls = [];
    userScripts = true;
    allUrls = true;
    failWith = null;
    writeFileSync(
      join(temp, 'bunx'),
      `#!/usr/bin/env bash\necho "$*" >> "${join(temp, 'bunx.log')}"\necho '1: https://x [selected]'\n`,
      { mode: 0o755 },
    );
    env = { ...process.env, PATH: `${temp}:${process.env.PATH}`, TENX_BRIDGE_SOCK: sock };
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        if (req.url !== '/call' || req.method !== 'POST') {
          res.writeHead(404).end();
          return;
        }
        const call = JSON.parse(body) as Call;
        calls.push(call);
        const reply = (value: unknown) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(value));
        };
        if (failWith) {
          if (failWith === 'timeout') {
            res.writeHead(504).end(JSON.stringify({ ok: false, error: { code: 'timeout' } }));
            return;
          }
          reply({ ok: false, error: { code: failWith, message: `fake ${failWith}` } });
          return;
        }
        if (call.method === 'ping')
          reply({ ok: true, result: { version: '1', userScripts, allUrls } });
        else if (call.method === 'new_page') reply({ ok: true, result: { tabId: 12, id: 't12' } });
        else if (call.method === 'evaluate')
          reply({ ok: true, result: new Function(`return ${call.params.code}`)() });
        else reply({ ok: true, result: { tabId: call.params.tabId } });
      });
    });
    await listen(server, sock);
  });
  afterEach(async () => {
    await close(server);
    rmSync(temp, { recursive: true, force: true });
  });
  const bunxLog = () =>
    existsSync(join(temp, 'bunx.log')) ? readFileSync(join(temp, 'bunx.log'), 'utf8') : '';

  it('open.sh opens a background tab through the bridge', async () => {
    const result = await run(bin('open'), ['https://new.example'], env);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('t12\n');
    expect(calls.map((call) => call.method)).toEqual(['ping', 'new_page']);
    expect(calls[1].params).toEqual({ url: 'https://new.example', background: true });
    expect(bunxLog()).toBe('');
  });

  it('open.sh warns and uses CDP when user scripts are off', async () => {
    userScripts = false;
    const result = await run(bin('open'), ['https://new.example'], env);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('1\n');
    expect(result.stderr).toContain('Allow User Scripts');
    expect(bunxLog()).toContain('chrome-existing.new_page');
  });

  it('open.sh warns and uses CDP when site access is off', async () => {
    allUrls = false;
    const result = await run(bin('open'), ['https://new.example'], env);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('1\n');
    expect(result.stderr).toContain('site access');
    expect(result.stderr).not.toContain('Allow User Scripts');
    expect(calls.map((call) => call.method)).toEqual(['ping']);
  });

  it('open.sh skips the bridge with TENX_BRIDGE=off', async () => {
    const result = await run(bin('open'), ['https://x'], { ...env, TENX_BRIDGE: 'off' });
    expect(result.stdout).toBe('1\n');
    expect(calls).toEqual([]);
  });

  it('js.sh sends an expression and prints the result', async () => {
    const file = join(temp, 'fn.js');
    writeFileSync(file, '(arg) => ({ ok: true, arg });\n');
    const arg = { text: 'one\ntwo "q" `x`' };
    const result = await run(bin('js'), ['t5', file, JSON.stringify(arg)], env);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, arg });
    expect(calls[0].method).toBe('evaluate');
    expect(calls[0].params.tabId).toBe(5);
    expect(String(calls[0].params.code).startsWith('((arg) =>')).toBe(true);
  });

  it.each([
    ['timeout', 124],
    ['tab_gone', 66],
    ['user_scripts_off', 78],
    ['eval_error', 1],
  ])('js.sh maps %s to exit %i', async (code, status) => {
    failWith = code;
    const file = join(temp, 'fn.js');
    writeFileSync(file, '() => 1');
    const result = await run(bin('js'), ['t5', file], env);
    expect(result.status).toBe(status);
    if (code !== 'timeout') expect(result.stderr).toContain(code);
  });

  it('page.sh selects and closes bridge tabs', async () => {
    expect((await run(bin('page'), ['select', 't3'], env)).status).toBe(0);
    expect((await run(bin('page'), ['close', 't3'], env)).status).toBe(0);
    expect(calls).toEqual([
      { method: 'select_page', params: { tabId: 3 } },
      { method: 'close_page', params: { tabId: 3 } },
    ]);
    const missing = await run(bin('page'), ['select', 't3'], {
      ...env,
      TENX_BRIDGE_SOCK: join(temp, 'no'),
    });
    expect(missing.status).toBe(69);
    expect(missing.stderr).toContain('bridge unavailable');
  });

  it('page.sh uses chrome-existing for CDP ids', async () => {
    expect((await run(bin('page'), ['select', '4'], env)).status).toBe(0);
    expect(bunxLog()).toContain(
      'chrome-existing.select_page --args {"pageId":4,"bringToFront":true}',
    );
    expect(calls).toEqual([]);
  });

  it('cdp-id.sh echoes CDP ids', async () => {
    const result = await run(bin('cdp-id'), ['17'], env);
    expect(result.stdout).toBe('17\n');
  });
});

describe('cdp-id.sh for bridge tabs', () => {
  let temp: string;
  let server: Server;
  let env: NodeJS.ProcessEnv;
  let tokenPage: string;
  let bridgeUrl: string;
  const stub = (temp: string) => `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(join(temp, 'bunx.log'))}, JSON.stringify(args) + '\\n');
if (args.includes('chrome-existing.list_pages')) {
  process.stdout.write('1: https://a.test/ [selected]\\n2: https://b.test/\\n3: https://b.test/\\n');
} else {
  const request = JSON.parse(args[args.indexOf('--args') + 1]);
  const token = fs.readFileSync(${JSON.stringify(join(temp, 'token'))}, 'utf8');
  const page = fs.readFileSync(${JSON.stringify(join(temp, 'page'))}, 'utf8');
  const value = JSON.stringify(String(request.pageId) === page ? token : null);
  process.stdout.write(JSON.stringify({ content: [{ type: 'text', text: value }] }));
}
`;
  beforeEach(async () => {
    temp = mkdtempSync(join(tmpdir(), 'tc-'));
    writeFileSync(join(temp, 'bunx'), stub(temp), { mode: 0o755 });
    tokenPage = '3';
    bridgeUrl = 'https://b.test/';
    const sock = join(temp, 'b.sock');
    env = { ...process.env, PATH: `${temp}:${process.env.PATH}`, TENX_BRIDGE_SOCK: sock };
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const call = JSON.parse(body) as Call;
        let result: unknown = null;
        if (call.method === 'evaluate') {
          const token = String(call.params.code).match(/"(tenx-[0-9a-f]+)"/)?.[1] ?? '';
          writeFileSync(join(temp, 'token'), token);
          writeFileSync(join(temp, 'page'), tokenPage);
        } else if (call.method === 'list_pages') {
          result = [
            { id: 't9', tabId: 9, url: bridgeUrl },
            { id: 't8', tabId: 8, url: 'https://a.test/' },
          ];
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result }));
      });
    });
    await listen(server, sock);
  });
  afterEach(async () => {
    await close(server);
    rmSync(temp, { recursive: true, force: true });
  });
  const probed = () =>
    readFileSync(join(temp, 'bunx.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[])
      .filter((args) => args.includes('chrome-existing.evaluate_script'))
      .map((args) => JSON.parse(args[args.indexOf('--args') + 1]).pageId);

  it('probes only CDP pages with the same URL', async () => {
    const result = await run(bin('cdp-id'), ['t9'], env);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('3\n');
    expect(probed()).toEqual([2, 3]);
  });

  it('probes all pages when no URL matches', async () => {
    bridgeUrl = 'https://moved.test/';
    tokenPage = '1';
    const result = await run(bin('cdp-id'), ['t9'], env);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('1\n');
    expect(probed()).toEqual([1, 2, 3]);
  });

  it('exits 1 when no page has the token', async () => {
    tokenPage = 'none';
    const result = await run(bin('cdp-id'), ['t9'], env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('found 0');
  });
});

describe('CDP fallback', () => {
  let temp: string;
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), 'tb-'));
    const log = join(temp, 'bunx.log');
    const stub = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
if (args.includes('chrome-existing.new_page')) process.stdout.write('3: https://a [selected]\\n');
else {
  const request = JSON.parse(args[args.indexOf('--args') + 1]);
  process.stdout.write(JSON.stringify(new Function('return ' + request.function)()()));
}
`;
    writeFileSync(join(temp, 'bunx'), stub, { mode: 0o755 });
    env = {
      ...process.env,
      PATH: `${temp}:${process.env.PATH}`,
      TENX_BRIDGE_SOCK: join(temp, 'missing.sock'),
    };
  });
  afterEach(() => rmSync(temp, { recursive: true, force: true }));
  const calls = () =>
    readFileSync(join(temp, 'bunx.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);

  it('open.sh and js.sh use chrome-existing without a bridge socket', async () => {
    const opened = await run(bin('open'), ['https://a'], env);
    expect(opened.status, opened.stderr).toBe(0);
    expect(opened.stdout).toBe('3\n');
    const file = join(temp, 'fn.js');
    writeFileSync(file, '(arg) => ({ arg })');
    const evaluated = await run(bin('js'), ['3', file, '{"n":1}'], env);
    expect(evaluated.status, evaluated.stderr).toBe(0);
    expect(JSON.parse(evaluated.stdout)).toEqual({ arg: { n: 1 } });
    const [first, second] = calls();
    expect(first.slice(0, 3)).toEqual(['mcporter', 'call', 'chrome-existing.new_page']);
    expect(second.slice(0, 3)).toEqual(['mcporter', 'call', 'chrome-existing.evaluate_script']);
    expect(JSON.parse(second[4]).pageId).toBe(3);
  });

  it('bridge.sh exits 69 without a socket', async () => {
    const result = await run(bin('bridge'), ['ping'], env);
    expect(result.status).toBe(69);
    expect(result.stderr).toContain('bridge unavailable');
  });
});

describe('native host', () => {
  let temp: string;
  let host: ChildProcess | null;
  const hostPath = 'skills/10x-chat/bridge/host.ts';
  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), 'th-'));
    host = null;
  });
  afterEach(() => {
    host?.kill('SIGKILL');
    rmSync(temp, { recursive: true, force: true });
  });

  it('turns off the Bun.serve idle timeout', () => {
    expect(SERVE_IDLE_TIMEOUT).toBe(0);
    expect(readFileSync(hostPath, 'utf8')).toContain('idleTimeout: SERVE_IDLE_TIMEOUT');
  });

  it('answers too_large and sends nothing for a message over 1 MB', async () => {
    const sock = join(temp, 'b.sock');
    const child = spawn('bun', [hostPath], { env: { ...process.env, TENX_BRIDGE_SOCK: sock } });
    host = child;
    let stdout = 0;
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.length;
    });
    await waitFor(() => existsSync(sock));
    const reply = await new Promise<{ status?: number; body: string }>((resolve, reject) => {
      const req = request({ socketPath: sock, path: '/call', method: 'POST' }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.end(JSON.stringify({ method: 'evaluate', params: { code: 'x'.repeat(1_000_001) } }));
    });
    expect(JSON.parse(reply.body)).toMatchObject({ ok: false, error: { code: 'too_large' } });
    expect(stdout).toBe(0);
  }, 15000);

  it('refuses a live socket and keeps it', async () => {
    const sock = join(temp, 'b.sock');
    const server = createServer();
    await listen(server, sock);
    const result = await run(hostPath, [], { ...process.env, TENX_BRIDGE_SOCK: sock }, 'bun');
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(existsSync(sock)).toBe(true);
    await close(server);
  });

  it('serves /call end to end and removes the socket on stdin end', async () => {
    const sock = join(temp, 'b.sock');
    writeFileSync(sock, 'stale');
    const child = spawn('bun', [hostPath], { env: { ...process.env, TENX_BRIDGE_SOCK: sock } });
    host = child;
    const decoder = new FrameDecoder();
    child.stdout?.on('data', (chunk: Buffer) => {
      for (const message of decoder.push(chunk)) {
        const { id, method, params } = message as { id: number; method: string; params: unknown };
        child.stdin?.write(encodeMessage({ id, ok: true, result: { method, params } }));
      }
    });
    await waitFor(() => {
      try {
        return readFileSync(sock).length === 0;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code !== 'ENOENT';
      }
    });
    const reply = await new Promise<{ status?: number; body: string }>((resolve, reject) => {
      const req = request(
        { socketPath: sock, path: '/call', method: 'POST', headers: { 'X-Timeout-Ms': '5000' } },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => resolve({ status: res.statusCode, body }));
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify({ method: 'ping', params: { a: 1 } }));
    });
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toEqual({
      ok: true,
      result: { method: 'ping', params: { a: 1 } },
    });
    const exited = new Promise((resolve) => child.on('exit', resolve));
    child.stdin?.end();
    expect(await exited).toBe(0);
    expect(existsSync(sock)).toBe(false);
  }, 15000);
});
