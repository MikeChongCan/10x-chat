export type ToolErrorCode =
  | 'not_logged_in'
  | 'unknown_provider'
  | 'unsupported'
  | 'invalid_input'
  | 'timeout'
  | 'provider_error'
  | 'job_not_found'
  | 'session_not_found';

export type RetryHint = 'yes' | 'no' | 'after_login';

export interface ToolErrorBody {
  code: ToolErrorCode;
  message: string;
  retry: RetryHint;
}

/** An error that already carries an MCP error code. */
export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
    readonly retry: RetryHint = 'no',
  ) {
    super(message);
    this.name = 'ToolError';
  }

  toBody(): ToolErrorBody {
    return { code: this.code, message: this.message, retry: this.retry };
  }
}

/** Map any thrown value to a `{code, message, retry}` body. */
export function toErrorBody(error: unknown): ToolErrorBody {
  if (error instanceof ToolError) return error.toBody();
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('not logged in')) {
    const provider = message.match(/10x-chat login (\S+)/)?.[1] ?? '<provider>';
    return {
      code: 'not_logged_in',
      message: `${message}. Ask the user to run \`10x-chat login ${provider}\`, then retry.`,
      retry: 'after_login',
    };
  }
  if (lower.includes('unknown provider')) {
    return { code: 'unknown_provider', message, retry: 'no' };
  }
  if (lower.includes('does not support')) {
    return { code: 'unsupported', message, retry: 'no' };
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return { code: 'timeout', message, retry: 'yes' };
  }
  return { code: 'provider_error', message, retry: 'yes' };
}
