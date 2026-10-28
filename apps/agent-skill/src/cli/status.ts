import { readFile } from 'node:fs/promises';
import chalk from 'chalk';
import { Command } from 'commander';
import { getSession, listSessions } from '../session/index.js';

export function createStatusCommand(): Command {
  return new Command('status')
    .description('List recent chat sessions')
    .option('--hours <n>', 'Show sessions from last N hours', '24')
    .action(async (options) => {
      const hours = Number.parseInt(options.hours, 10);
      if (Number.isNaN(hours) || hours <= 0) {
        console.error(
          chalk.red(`Invalid --hours value: ${options.hours} (expected a positive integer)`),
        );
        process.exit(1);
      }
      const sessions = await listSessions({ hours });

      if (sessions.length === 0) {
        console.log(chalk.dim(`No sessions in the last ${hours} hours.`));
        return;
      }

      console.log(chalk.bold(`Sessions (last ${hours}h)\n`));

      for (const session of sessions) {
        const statusIcon = {
          pending: '⏳',
          running: '🔄',
          completed: '✅',
          failed: '❌',
          timeout: '⏰',
        }[session.status];

        const duration = session.durationMs
          ? chalk.dim(` (${Math.round(session.durationMs / 1000)}s)`)
          : '';

        console.log(
          `  ${statusIcon} ${chalk.cyan(session.id.slice(0, 8))} ` +
            `${chalk.bold(session.provider)} ${duration}`,
        );
        console.log(`    ${chalk.dim(session.promptPreview.slice(0, 80))}`);
        console.log(`    ${chalk.dim(new Date(session.createdAt).toLocaleString())}`);
        console.log('');
      }
    });
}

export function createSessionCommand(): Command {
  return new Command('session')
    .description('View details of a specific session')
    .argument('<id>', 'Session ID (or prefix)')
    .option('--render', 'Pretty-print the response')
    .action(async (id: string, options: { render?: boolean }) => {
      try {
        const result = await getSession(id);
        const meta = result.meta;

        console.log(chalk.bold('Session Details\n'));
        console.log(`  ID:       ${meta.id}`);
        console.log(`  Provider: ${meta.provider}`);
        console.log(`  Model:    ${meta.model ?? chalk.dim('(default)')}`);
        console.log(`  Status:   ${meta.status}`);
        console.log(`  Created:  ${new Date(meta.createdAt).toLocaleString()}`);
        if (meta.durationMs) {
          console.log(`  Duration: ${Math.round(meta.durationMs / 1000)}s`);
        }
        console.log('');

        if (options.render && result.responsePath) {
          const response = await readFile(result.responsePath, 'utf-8');
          console.log(chalk.bold('--- Response ---\n'));
          console.log(response);
        } else if (result.responsePath) {
          console.log(chalk.dim(`Response saved at: ${result.responsePath}`));
        } else {
          console.log(chalk.dim('No response captured yet.'));
        }
      } catch {
        console.error(chalk.red(`Session not found: ${id}`));
        process.exit(1);
      }
    });
}
