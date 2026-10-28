import chalk from 'chalk';
import { Command } from 'commander';
import { loadConfig, saveConfig } from '../config.js';
import { isValidProvider } from '../providers/index.js';
import type { ProviderName } from '../types.js';

export function createConfigCommand(): Command {
  const cmd = new Command('config').description('View or modify configuration');

  cmd
    .command('show')
    .description('Show current configuration')
    .action(async () => {
      const config = await loadConfig();
      console.log(chalk.bold('Current Configuration\n'));
      console.log(JSON.stringify(config, null, 2));
    });

  cmd
    .command('set')
    .description('Set a configuration value')
    .argument('<key>', 'Configuration key (provider, model, timeout, headless)')
    .argument('<value>', 'Configuration value')
    .action(async (key: string, value: string) => {
      const config = await loadConfig();

      switch (key) {
        case 'provider':
          if (!isValidProvider(value)) {
            console.error(chalk.red(`Invalid provider: ${value}`));
            process.exit(1);
          }
          config.defaultProvider = value as ProviderName;
          break;
        case 'model':
          config.defaultModel = value;
          break;
        case 'timeout': {
          const timeoutMs = Number.parseInt(value, 10);
          if (Number.isNaN(timeoutMs) || timeoutMs <= 0) {
            console.error(
              chalk.red(`Invalid timeout: ${value} (expected a positive integer in ms)`),
            );
            process.exit(1);
          }
          config.defaultTimeoutMs = timeoutMs;
          break;
        }
        case 'headless':
          if (value !== 'true' && value !== 'false') {
            console.error(
              chalk.red(`Invalid headless value: ${value} (expected 'true' or 'false')`),
            );
            process.exit(1);
          }
          config.headless = value === 'true';
          break;
        default:
          console.error(chalk.red(`Unknown config key: ${key}`));
          console.log(chalk.dim('Available keys: provider, model, timeout, headless'));
          process.exit(1);
      }

      await saveConfig(config);
      console.log(chalk.green(`✓ Set ${key} = ${value}`));
    });

  return cmd;
}
