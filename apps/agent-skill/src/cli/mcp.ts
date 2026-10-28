import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Command } from 'commander';
import { stopDaemon } from '../browser/daemon.js';
import { JobStore } from '../mcp/jobs.js';
import { createMcpServer } from '../mcp/server.js';
import { installStdoutGuard } from '../mcp/stdio-guard.js';

export function createMcpCommand(version?: string): Command {
  return new Command('mcp')
    .description('Start a Model Context Protocol (MCP) server on stdio for AI agents')
    .action(async () => {
      // early-guard.ts installed this already; the call is idempotent.
      const protocolOut = installStdoutGuard();
      const jobs = new JobStore();
      const server = createMcpServer({ jobs, version });
      const transport = new StdioServerTransport(process.stdin, protocolOut);

      transport.onclose = () => {
        // Client is gone. Close running browser work the same way Ctrl+C does.
        const stop = jobs.activeCount() > 0 ? stopDaemon().catch(() => {}) : Promise.resolve();
        void stop.finally(() => process.exit(0));
      };
      process.stdin.on('end', () => {
        void transport.close();
      });

      await server.connect(transport);
      console.error('10x-chat MCP server ready on stdio');
    });
}
