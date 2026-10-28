import chalk from 'chalk';
import { Command } from 'commander';
import { runDreaminaVideo } from '../core/dreamina-video-orchestrator.js';
import { runVideo } from '../core/video-orchestrator.js';
import {
  DREAMINA_ASPECTS,
  DREAMINA_DEFAULT_MODEL,
  DREAMINA_MAX_DURATION,
  DREAMINA_MIN_DURATION,
  DREAMINA_REF_MODES,
  DREAMINA_RESOLUTIONS,
  DREAMINA_VIDEO_MODELS,
  type DreaminaAspect,
  type DreaminaRefMode,
  type DreaminaResolution,
  type DreaminaVideoModel,
} from '../providers/dreamina-video.js';
import type { VideoMode, VideoModel, VideoOrientation } from '../types.js';

const VALID_PROVIDERS = ['flow', 'dreamina'] as const;
const VALID_MODES = ['ingredients', 'frames'] as const;
const VALID_FLOW_MODELS = [
  'Omni Flash',
  'Veo 3.1 - Lite',
  'Veo 3.1 - Fast',
  'Veo 3.1 - Quality',
] as const;
const VALID_FLOW_DURATIONS = [4, 6, 8, 10] as const;
const VALID_ORIENTATIONS = ['landscape', 'portrait'] as const;

const collect = (value: string, prev: string[]): string[] => [...prev, value];

export function createVideoCommand(): Command {
  const cmd = new Command('video')
    .description('Generate video via browser automation (Google Flow / Veo or Dreamina / Seedance)')
    .requiredOption('-p, --prompt <text>', 'The video generation prompt')
    .option('--provider <name>', 'Provider: flow (default) or dreamina', 'flow')
    .option('--model <name>', 'Model name (provider-specific)')
    // ── Flow (Veo) options ──
    .option('--mode <mode>', '[flow] Video mode: ingredients (default) or frames', 'ingredients')
    .option('--orientation <dir>', '[flow] landscape (default) or portrait', 'landscape')
    .option('--count <n>', '[flow] Number of simultaneous generations (1-4)', '1')
    .option('--duration <secs>', '[flow] Clip length in seconds: 4, 6, 8 (default), or 10')
    .option('--start-frame <path>', '[flow] First keyframe image (frames mode)')
    .option('--end-frame <path>', '[flow] Last keyframe image (frames mode)')
    // ── Dreamina (Seedance) options ──
    .option('--aspect <ratio>', '[dreamina] Aspect ratio (e.g. 16:9, 9:16, 1:1)')
    .option('--resolution <res>', '[dreamina] Resolution: 720P (default) or 1080P')
    .option('--dreamina-duration <secs>', '[dreamina] Clip length in seconds (4-15)')
    .option('--ref-mode <mode>', '[dreamina] Input-image mode: omni (default), frames, multiframes')
    // ── Shared image option ──
    .option(
      '--image <path>',
      'Reference image for image-to-video. Flow: first image used as ingredient. Dreamina: repeatable, up to 12.',
      collect,
      [],
    )
    // ── Shared options ──
    .option('--headed', 'Show browser window during generation')
    .option('--timeout <ms>', 'Generation timeout in milliseconds', '600000')
    .option('--save-dir <dir>', 'Directory to save generated videos')
    .option('--isolated-profile', 'Use per-provider browser profiles')
    .action(async (options) => {
      const provider = options.provider as string;
      if (!VALID_PROVIDERS.includes(provider as (typeof VALID_PROVIDERS)[number])) {
        fail(`Invalid provider: ${provider}. Must be one of: ${VALID_PROVIDERS.join(', ')}`);
      }

      const timeoutMs = (() => {
        const t = Number.parseInt(options.timeout, 10);
        return Number.isFinite(t) && t > 0 ? t : 600_000;
      })();

      if (provider === 'dreamina') {
        await runDreaminaCommand(options, timeoutMs);
        return;
      }
      await runFlowCommand(options, timeoutMs);
    });

  return cmd;
}

function fail(message: string): never {
  console.error(chalk.red(message));
  process.exit(1);
}

// ── Dreamina ──────────────────────────────────────────────────────

async function runDreaminaCommand(
  options: Record<string, unknown>,
  timeoutMs: number,
): Promise<void> {
  const model = (options.model as string | undefined) ?? DREAMINA_DEFAULT_MODEL;
  if (!DREAMINA_VIDEO_MODELS.includes(model as DreaminaVideoModel)) {
    fail(
      `Invalid Dreamina model: ${model}. Must be one of:\n  ${DREAMINA_VIDEO_MODELS.join('\n  ')}`,
    );
  }

  const aspect = options.aspect as string | undefined;
  if (aspect && !DREAMINA_ASPECTS.includes(aspect as DreaminaAspect)) {
    fail(`Invalid aspect: ${aspect}. Must be one of: ${DREAMINA_ASPECTS.join(', ')}`);
  }

  const resolution = options.resolution as string | undefined;
  if (resolution && !DREAMINA_RESOLUTIONS.includes(resolution as DreaminaResolution)) {
    fail(`Invalid resolution: ${resolution}. Must be one of: ${DREAMINA_RESOLUTIONS.join(', ')}`);
  }

  const refMode = options.refMode as string | undefined;
  if (refMode && !(refMode in DREAMINA_REF_MODES)) {
    fail(
      `Invalid ref-mode: ${refMode}. Must be one of: ${Object.keys(DREAMINA_REF_MODES).join(', ')}`,
    );
  }

  let durationSecs: number | undefined;
  if (options.dreaminaDuration !== undefined) {
    durationSecs = Number.parseInt(options.dreaminaDuration as string, 10);
    if (
      !Number.isFinite(durationSecs) ||
      durationSecs < DREAMINA_MIN_DURATION ||
      durationSecs > DREAMINA_MAX_DURATION
    ) {
      fail(
        `Invalid --dreamina-duration: ${options.dreaminaDuration}. Must be ${DREAMINA_MIN_DURATION}-${DREAMINA_MAX_DURATION} seconds`,
      );
    }
  }

  const images = (options.image as string[]) ?? [];
  if (images.length > 12) fail('Dreamina accepts at most 12 reference images.');

  try {
    console.log(chalk.bold.blue('🎬 Dreamina Video Generation\n'));
    const result = await runDreaminaVideo({
      prompt: options.prompt as string,
      model: model as DreaminaVideoModel,
      aspect: aspect as DreaminaAspect | undefined,
      resolution: resolution as DreaminaResolution | undefined,
      durationSecs,
      refMode: refMode as DreaminaRefMode | undefined,
      images,
      headed: options.headed as boolean | undefined,
      timeoutMs,
      saveDir: options.saveDir as string | undefined,
      isolatedProfile: options.isolatedProfile as boolean | undefined,
    });

    console.log('');
    console.log(chalk.bold.green(`--- ${result.message} ---\n`));
    for (const vid of result.videos) {
      if (vid.localPath) console.log(chalk.green(`  🎬 ${vid.localPath}`));
    }
    console.log('');
    console.log(chalk.dim(`Session: ${result.sessionId}`));
    console.log(chalk.dim(`Duration: ${Math.round(result.durationMs / 1000)}s`));
    if (result.truncated)
      console.log(chalk.yellow('⚠ Generation may not be complete (timeout reached)'));
  } catch (error) {
    fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ── Flow ──────────────────────────────────────────────────────────

async function runFlowCommand(options: Record<string, unknown>, timeoutMs: number): Promise<void> {
  const mode = options.mode as string;
  if (!VALID_MODES.includes(mode as VideoMode)) {
    fail(`Invalid mode: ${mode}. Must be one of: ${VALID_MODES.join(', ')}`);
  }

  const model = (options.model as string | undefined) ?? 'Omni Flash';
  if (!VALID_FLOW_MODELS.includes(model as VideoModel)) {
    fail(`Invalid model: ${model}. Must be one of:\n  ${VALID_FLOW_MODELS.join('\n  ')}`);
  }

  const orientation = options.orientation as string;
  if (!VALID_ORIENTATIONS.includes(orientation as VideoOrientation)) {
    fail(`Invalid orientation: ${orientation}. Must be: landscape or portrait`);
  }

  const count = Number.parseInt(options.count as string, 10);
  if (![1, 2, 3, 4].includes(count)) fail('Count must be 1, 2, 3, or 4');

  let durationSecs: (typeof VALID_FLOW_DURATIONS)[number] | undefined;
  if (options.duration !== undefined) {
    const d = Number.parseInt(options.duration as string, 10);
    if (!VALID_FLOW_DURATIONS.includes(d as (typeof VALID_FLOW_DURATIONS)[number])) {
      fail(
        `Invalid --duration: ${options.duration}. Must be one of: ${VALID_FLOW_DURATIONS.join(', ')} (seconds)`,
      );
    }
    durationSecs = d as (typeof VALID_FLOW_DURATIONS)[number];
  }

  if (mode === 'frames' && !options.startFrame && !options.endFrame) {
    fail('Frames mode requires --start-frame and/or --end-frame');
  }

  const images = (options.image as string[]) ?? [];
  // Flow only uses the first image as a reference ingredient
  const refImage = images[0] as string | undefined;
  if (images.length > 1) {
    console.warn(
      chalk.yellow(`⚠ Flow only uses one reference image — using ${refImage}, ignoring the rest`),
    );
  }

  try {
    console.log(chalk.bold.blue('🎬 Google Flow Video Generation\n'));
    const result = await runVideo({
      prompt: options.prompt as string,
      mode: mode as VideoMode,
      model: model as VideoModel,
      orientation: orientation as VideoOrientation,
      count: count as 1 | 2 | 3 | 4,
      durationSecs,
      refImage,
      startFrame: options.startFrame as string | undefined,
      endFrame: options.endFrame as string | undefined,
      headed: options.headed as boolean | undefined,
      timeoutMs,
      saveDir: options.saveDir as string | undefined,
      isolatedProfile: options.isolatedProfile as boolean | undefined,
    });

    console.log('');
    console.log(chalk.bold.green(`--- ${result.message} ---\n`));
    for (const vid of result.videos) {
      if (vid.localPath) console.log(chalk.green(`  🎬 ${vid.localPath}`));
    }
    console.log('');
    console.log(chalk.dim(`Session: ${result.sessionId}`));
    console.log(chalk.dim(`Duration: ${Math.round(result.durationMs / 1000)}s`));
    if (result.truncated)
      console.log(chalk.yellow('⚠ Generation may not be complete (timeout reached)'));
  } catch (error) {
    fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}
