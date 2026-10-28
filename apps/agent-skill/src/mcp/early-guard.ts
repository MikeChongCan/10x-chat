/**
 * Side-effect module. `src/bin/cli.ts` imports it FIRST, so the stdout guard
 * is active before any other module evaluates when the command is `mcp`.
 */
import { installStdoutGuard } from './stdio-guard.js';

if (process.argv[2] === 'mcp') {
  installStdoutGuard();
}
