import { Writable } from 'node:stream';

/**
 * MCP over stdio uses stdout for JSON-RPC only. The orchestrators print
 * progress with console.log / chalk and `process.stdout.write`, which would
 * corrupt the protocol stream. `installStdoutGuard()` sends all of that to
 * stderr and returns a private stream that still writes to the real stdout.
 * Only the MCP transport may use that stream.
 */

type StdoutWrite = typeof process.stdout.write;

let originalWrite: StdoutWrite | undefined;
let protocolStream: Writable | undefined;

export function installStdoutGuard(): Writable {
  if (protocolStream) return protocolStream;

  const realWrite = process.stdout.write.bind(process.stdout) as StdoutWrite;
  originalWrite = process.stdout.write;
  const toStderr = process.stderr.write.bind(process.stderr) as StdoutWrite;

  process.stdout.write = ((...args: Parameters<StdoutWrite>) => toStderr(...args)) as StdoutWrite;

  const toError = (...args: unknown[]) => console.error(...args);
  console.log = toError;
  console.info = toError;
  console.warn = toError;
  console.debug = toError;

  protocolStream = new Writable({
    write(chunk, encoding, callback) {
      realWrite(chunk, encoding, (err) => callback(err ?? null));
    },
  });
  return protocolStream;
}

/** True when the guard is active. */
export function isStdoutGuarded(): boolean {
  return protocolStream !== undefined;
}

/** Test helper: undo the stdout patch. Console methods stay on stderr. */
export function restoreStdoutForTests(): void {
  if (originalWrite) process.stdout.write = originalWrite;
  originalWrite = undefined;
  protocolStream = undefined;
}
