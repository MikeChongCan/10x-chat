// Chrome native messaging framing: 4-byte little-endian length, then UTF-8 JSON.
export function encodeMessage(message: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message));
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setUint32(0, body.length, true);
  out.set(body, 4);
  return out;
}

// Chrome refuses messages from the host above 1 MB.
export const MAX_MESSAGE_BYTES = 1_000_000;
// Bun.serve idleTimeout in seconds. 0 turns it off, so long /call requests stay open.
export const SERVE_IDLE_TIMEOUT = 0;

export class FrameDecoder {
  private buffer = new Uint8Array(0);

  // onError gets each frame that is not valid JSON. The decoder skips it and goes on.
  constructor(private onError: (error: unknown) => void = () => {}) {}

  push(chunk: Uint8Array): unknown[] {
    const joined = new Uint8Array(this.buffer.length + chunk.length);
    joined.set(this.buffer, 0);
    joined.set(chunk, this.buffer.length);
    this.buffer = joined;
    const messages: unknown[] = [];
    while (this.buffer.length >= 4) {
      const size = new DataView(
        this.buffer.buffer,
        this.buffer.byteOffset,
        this.buffer.byteLength,
      ).getUint32(0, true);
      if (this.buffer.length < 4 + size) break;
      const body = this.buffer.subarray(4, 4 + size);
      this.buffer = this.buffer.slice(4 + size);
      try {
        messages.push(JSON.parse(new TextDecoder().decode(body)));
      } catch (error) {
        this.onError(error);
      }
    }
    return messages;
  }
}
