import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import { launchBrowser } from '../browser/index.js';
import { loadConfig } from '../config.js';
import { DREAMINA_CONFIG, dreaminaActions } from '../providers/dreamina.js';
import {
  captureVideoSrcs,
  clickGenerate,
  DREAMINA_DEFAULT_MODEL,
  type DreaminaVideoOptions,
  promptKey,
  selectAspectAndResolution,
  selectDuration,
  selectReferenceMode,
  selectVideoModel,
  typePrompt,
  uploadReferenceImages,
  waitForResultVideo,
} from '../providers/dreamina-video.js';
import { createSession, saveBundle, saveResponse, updateSession } from '../session/index.js';
import type { GeneratedVideo } from '../types.js';
import { downloadVideoSrcs } from './video-download.js';

export interface DreaminaVideoResult {
  sessionId: string;
  message: string;
  videos: GeneratedVideo[];
  truncated: boolean;
  durationMs: number;
}

/**
 * Run a Dreamina (CapCut) video generation:
 * launch → verify auth → select model/aspect/resolution/duration → upload
 * reference images → type prompt → generate → poll → download.
 *
 * Uses a shared *persistent* context (not the daemon) because the steps need a
 * full Playwright page (`evaluateHandle`, `keyboard.insertText`).
 */
export async function runDreaminaVideo(
  options: DreaminaVideoOptions,
): Promise<DreaminaVideoResult> {
  const config = await loadConfig();
  const model = options.model ?? DREAMINA_DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DREAMINA_CONFIG.defaultTimeoutMs;
  const headless = options.headed === true ? false : config.headless;
  const images = options.images ?? [];

  const session = await createSession('dreamina', options.prompt, model);
  await saveBundle(session.id, options.prompt);

  console.log(chalk.dim(`Session: ${session.id}`));
  console.log(chalk.blue(`Provider: ${DREAMINA_CONFIG.displayName}`));
  console.log(chalk.dim(`Model: ${model}`));
  if (images.length > 0) {
    console.log(chalk.dim(`Reference images: ${images.length} (${options.refMode ?? 'omni'})`));
  }

  let browser: Awaited<ReturnType<typeof launchBrowser>>;
  try {
    await updateSession(session.id, { status: 'running' });
    browser = await launchBrowser({
      provider: 'dreamina',
      headless,
      url: DREAMINA_CONFIG.url,
      profileMode: 'shared',
      persistent: true,
    });
  } catch (error) {
    await updateSession(session.id, { status: 'failed' });
    throw error;
  }

  const startTime = Date.now();
  const page = browser.page;

  try {
    await page.waitForTimeout(6000);

    if (!(await dreaminaActions.isLoggedIn(page))) {
      throw new Error('Not logged in to Dreamina. Run `10x-chat login dreamina` first.');
    }

    console.log(chalk.dim('Selecting model...'));
    await selectVideoModel(page, model);

    if (images.length > 0) {
      console.log(chalk.dim(`Setting reference mode (${options.refMode ?? 'omni'})...`));
      await selectReferenceMode(page, options.refMode ?? 'omni');
      console.log(chalk.dim('Uploading reference images...'));
      await uploadReferenceImages(page, images);
    }

    if (options.aspect || options.resolution) {
      console.log(chalk.dim('Setting aspect ratio / resolution...'));
      await selectAspectAndResolution(page, options.aspect, options.resolution);
    }

    if (options.durationSecs) {
      console.log(chalk.dim(`Setting duration (${options.durationSecs}s)...`));
      await selectDuration(page, options.durationSecs);
    }

    console.log(chalk.dim('Submitting prompt...'));
    await typePrompt(page, options.prompt);

    // Snapshot videos already on the page (history / promos) so the poll only
    // accepts a brand-new src as our result.
    const baseline = await captureVideoSrcs(page);

    const clicked = await clickGenerate(page);
    if (!clicked) {
      throw new Error('Could not find Dreamina generate button (is the prompt empty or invalid?).');
    }

    // Generate navigates to the results page; the result card echoes our prompt.
    await page.waitForURL('**/ai-tool/generate**', { timeout: 30_000 }).catch(() => {});

    console.log(chalk.dim('Generating video... (this can take a few minutes)'));
    let lastSecs = -1;
    const srcs = await waitForResultVideo(page, promptKey(options.prompt), {
      timeoutMs,
      baseline,
      onTick: (secs) => {
        if (secs !== lastSecs && secs % 6 === 0) {
          lastSecs = secs;
          process.stdout.write(`\r${chalk.blue('▸')} Generating... ${chalk.bold(`${secs}s`)}`);
        }
      },
    });
    process.stdout.write('\n');

    const durationMs = Date.now() - startTime;
    const timedOut = srcs.length === 0 && durationMs >= timeoutMs;

    const videos =
      srcs.length > 0
        ? await downloadVideoSrcs(
            page,
            srcs,
            options.saveDir ??
              path.join(os.homedir(), '.10x-chat', 'sessions', session.id, 'videos'),
          )
        : [];

    const saved = videos.filter((v) => v.localPath).length;
    const message =
      saved > 0
        ? `Generated ${saved} video(s) in ${Math.round(durationMs / 1000)}s`
        : timedOut
          ? 'Video generation timed out'
          : srcs.length > 0
            ? 'Generation completed but no video could be downloaded'
            : 'No video detected';

    await saveResponse(session.id, message);
    await updateSession(session.id, {
      status: timedOut ? 'timeout' : saved > 0 ? 'completed' : 'failed',
      durationMs,
    });

    return { sessionId: session.id, message, videos, truncated: timedOut, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.message.toLowerCase().includes('timeout');
    await updateSession(session.id, { status: isTimeout ? 'timeout' : 'failed', durationMs });
    throw error;
  } finally {
    await browser.close();
  }
}
