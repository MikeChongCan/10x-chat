import chalk from 'chalk';
import { Command } from 'commander';
import { runImageGen } from '../core/image-orchestrator.js';
import { isValidProvider } from '../providers/index.js';
import type { ImageGenResult, ProviderName } from '../types.js';

const IMAGE_PROVIDERS: ProviderName[] = ['chatgpt', 'gemini'];

export function createImageCommand(): Command {
  const cmd = new Command('image')
    .description('Generate images via ChatGPT (DALL-E) or Gemini (Imagen) with browser automation')
    .requiredOption('-p, --prompt <text>', 'The image generation prompt')
    .option('--provider <name>', `Provider (${IMAGE_PROVIDERS.join(', ')})`, 'chatgpt')
    .option('--headed', 'Show browser window')
    .option('--timeout <ms>', 'Generation timeout in milliseconds', '120000')
    .option('--save-dir <dir>', 'Directory to save generated images')
    .option('--isolated-profile', 'Use per-provider browser profiles')
    .action(async (options) => {
      const provider = (options.provider as string) ?? 'chatgpt';
      if (!isValidProvider(provider)) {
        console.error(chalk.red(`Unknown provider: ${provider}`));
        process.exit(1);
      }
      if (!IMAGE_PROVIDERS.includes(provider as ProviderName)) {
        console.error(
          chalk.red(
            `Provider "${provider}" does not support image generation. Use: ${IMAGE_PROVIDERS.join(', ')}`,
          ),
        );
        process.exit(1);
      }

      const timeoutMs = (() => {
        const t = Number.parseInt(options.timeout, 10);
        return Number.isFinite(t) && t > 0 ? t : 120_000;
      })();

      try {
        console.log(chalk.bold.blue('🖼  Image Generation\n'));

        const result = await runImageGen({
          prompt: options.prompt,
          provider: provider as ProviderName,
          headed: options.headed,
          timeoutMs,
          saveDir: options.saveDir,
          isolatedProfile: options.isolatedProfile,
        });

        renderImageResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`Error: ${message}`));
        process.exit(1);
      }
    });

  return cmd;
}

function renderImageResult(result: ImageGenResult): void {
  console.log('');
  if (result.images.length > 0) {
    console.log(chalk.bold.green(`--- ${result.images.length} Image(s) Generated ---\n`));
    for (const img of result.images) {
      if (img.localPath) {
        console.log(chalk.green(`  🖼 ${img.localPath}`));
      } else {
        console.log(chalk.dim(`  🔗 ${img.url?.slice(0, 100)}`));
      }
    }
  } else {
    console.log(chalk.yellow('No images were generated.'));
  }

  if (result.text) {
    console.log(chalk.dim(`\n${result.text}`));
  }

  console.log('');
  console.log(chalk.dim(`Session: ${result.sessionId}`));
  console.log(chalk.dim(`Provider: ${result.provider}`));
  console.log(chalk.dim(`Duration: ${Math.round(result.durationMs / 1000)}s`));
  if (result.truncated) {
    console.log(chalk.yellow('⚠ Generation may be incomplete (timeout reached)'));
  }
}
