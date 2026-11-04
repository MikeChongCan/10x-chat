#!/usr/bin/env bun
// Native messaging host for the 10xWise agent bridge. Stdout is protocol only.
import { chmodSync, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  encodeMessage,
  FrameDecoder,
  MAX_MESSAGE_BYTES,
  SERVE_IDLE_TIMEOUT,
} from './framing.ts';

type Reply = { id: number; ok: boolean; result?: unknown; error?: { code: string; message?: string } };

const defaultDir = join(homedir(), '.10x-chat');
const sock = process.env.TENX_BRIDGE_SOCK || join(defaultDir, 'bridge.sock');
const log = (...args: unknown[]) => console.error('[10x-bridge]', ...args);

function isLive(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = connect(path);
    client.once('connect', () => {
      client.destroy();
      resolve(true);
    });
    client.once('error', () => resolve(false));
  });
}

mkdirSync(dirname(sock), { recursive: true, mode: 0o700 });
// Only lock down our own dir; a custom socket dir belongs to the user.
if (dirname(sock) === defaultDir) chmodSync(defaultDir, 0o700);
if (existsSync(sock)) {
  if (await isLive(sock)) {
    log(`socket ${sock} is in use by another bridge; exiting`);
    process.exit(1);
  }
  unlinkSync(sock);
}

let nextId = 1;
const waiting = new Map<number, (reply: Reply) => void>();

function send(frame: Uint8Array) {
  process.stdout.write(frame);
}

const server = Bun.serve({
  unix: sock,
  idleTimeout: SERVE_IDLE_TIMEOUT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method !== 'POST' || url.pathname !== '/call') {
      return Response.json({ ok: false, error: { code: 'not_found' } }, { status: 404 });
    }
    let body: { method?: unknown; params?: unknown };
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false, error: { code: 'bad_request' } }, { status: 400 });
    }
    if (typeof body.method !== 'string') {
      return Response.json({ ok: false, error: { code: 'bad_request' } }, { status: 400 });
    }
    const timeoutMs = Number(req.headers.get('x-timeout-ms')) || 60000;
    const id = nextId++;
    const frame = encodeMessage({ id, method: body.method, params: body.params ?? {} });
    if (frame.length - 4 > MAX_MESSAGE_BYTES) {
      return Response.json({
        ok: false,
        error: {
          code: 'too_large',
          message: `message is ${frame.length - 4} bytes; the limit is ${MAX_MESSAGE_BYTES}`,
        },
      });
    }
    const reply = await new Promise<Reply | null>((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        resolve(null);
      }, timeoutMs);
      waiting.set(id, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
      send(frame);
    });
    if (!reply) return Response.json({ ok: false, error: { code: 'timeout' } }, { status: 504 });
    const { id: _id, ...rest } = reply;
    return Response.json(rest);
  },
});
chmodSync(sock, 0o600);
const sockIno = statSync(sock).ino;
log(`listening on ${sock}`);

let closing = false;
function shutdown(code: number) {
  if (closing) return;
  closing = true;
  try {
    server.stop(true);
  } catch {}
  try {
    // A newer host may own this path now; only remove the socket we made.
    if (statSync(sock).ino === sockIno) unlinkSync(sock);
  } catch {}
  process.exit(code);
}
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

const decoder = new FrameDecoder((error) => log('bad frame', error));
process.stdin.on('data', (chunk: Buffer) => {
  const messages = decoder.push(new Uint8Array(chunk));
  for (const message of messages) {
    const reply = message as Reply;
    const resolve = waiting.get(reply?.id);
    if (!resolve) continue;
    waiting.delete(reply.id);
    resolve(reply);
  }
});
process.stdin.on('end', () => shutdown(0));
process.stdin.on('close', () => shutdown(0));
