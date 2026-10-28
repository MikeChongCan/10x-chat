import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installStdoutGuard,
  isStdoutGuarded,
  restoreStdoutForTests,
} from '../src/mcp/stdio-guard.js';

describe('installStdoutGuard', () => {
  const savedStdout = process.stdout.write;
  const savedStderr = process.stderr.write;
  const savedConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    debug: console.debug,
  };

  afterEach(() => {
    restoreStdoutForTests();
    process.stdout.write = savedStdout;
    process.stderr.write = savedStderr;
    Object.assign(console, savedConsole);
  });

  it('sends console and stdout writes to stderr, and keeps a private protocol stream', async () => {
    const realStdout = vi.fn((_chunk: unknown, ...rest: unknown[]) => {
      const cb = rest.find((r) => typeof r === 'function') as (() => void) | undefined;
      cb?.();
      return true;
    });
    const stderr = vi.fn(() => true);
    process.stdout.write = realStdout as unknown as typeof process.stdout.write;
    process.stderr.write = stderr as unknown as typeof process.stderr.write;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const protocol = installStdoutGuard();
    expect(isStdoutGuarded()).toBe(true);
    expect(installStdoutGuard()).toBe(protocol);

    console.log('log line');
    console.info('info line');
    console.warn('warn line');
    console.debug('debug line');
    process.stdout.write('chunk from orchestrator');

    expect(consoleError).toHaveBeenCalledTimes(4);
    expect(stderr).toHaveBeenCalledWith('chunk from orchestrator');
    expect(realStdout).not.toHaveBeenCalled();

    await new Promise<void>((resolve, reject) =>
      protocol.write('{"jsonrpc":"2.0"}\n', (err) => (err ? reject(err) : resolve())),
    );
    expect(realStdout).toHaveBeenCalledTimes(1);
    expect(String(realStdout.mock.calls[0][0])).toBe('{"jsonrpc":"2.0"}\n');
    consoleError.mockRestore();
  });
});
