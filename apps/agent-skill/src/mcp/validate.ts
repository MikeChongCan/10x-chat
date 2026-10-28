import { stat } from 'node:fs/promises';
import path from 'node:path';
import { isValidProvider } from '../providers/index.js';
import type { ProviderName } from '../types.js';
import { ToolError } from './errors.js';

/** Total size cap for `files` + `attach` in one call. */
export const MAX_TOTAL_FILE_BYTES = 25 * 1024 * 1024;

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/**
 * Resolve local file paths and check that each one exists and is a regular
 * file. Globs are not accepted. Relative paths resolve against the server's
 * working directory.
 */
export async function validateLocalFiles(
  groups: Array<string[] | undefined>,
  maxBytes = MAX_TOTAL_FILE_BYTES,
): Promise<string[][]> {
  let total = 0;
  const out: string[][] = [];
  for (const group of groups) {
    const resolved: string[] = [];
    for (const p of group ?? []) {
      if (/[*?{}[\]]/.test(p)) {
        throw new ToolError('invalid_input', `Globs are not supported, use exact paths: ${p}`);
      }
      const abs = path.resolve(p);
      let info: Awaited<ReturnType<typeof stat>>;
      try {
        info = await stat(abs);
      } catch {
        throw new ToolError('invalid_input', `File not found: ${abs}`);
      }
      if (!info.isFile()) throw new ToolError('invalid_input', `Not a regular file: ${abs}`);
      total += info.size;
      resolved.push(abs);
    }
    out.push(resolved);
  }
  if (total > maxBytes) {
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
    throw new ToolError(
      'invalid_input',
      `Files total ${mb(total)} MB, which is more than the ${mb(maxBytes)} MB limit. Send fewer or smaller files.`,
    );
  }
  return out;
}

/** Check a provider name against the registry and an optional allow-list. */
export function validateProvider(
  name: string,
  allowed?: readonly ProviderName[],
  feature?: string,
): ProviderName {
  if (!isValidProvider(name)) {
    throw new ToolError('unknown_provider', `Unknown provider "${name}"`);
  }
  if (allowed && !allowed.includes(name)) {
    throw new ToolError(
      'unsupported',
      `Provider "${name}" does not support ${feature ?? 'this tool'}. Use: ${allowed.join(', ')}`,
    );
  }
  return name;
}

export function validateSessionId(id: string): string {
  if (!SESSION_ID_PATTERN.test(id)) {
    throw new ToolError('invalid_input', `Invalid session id: ${id}`);
  }
  return id;
}
