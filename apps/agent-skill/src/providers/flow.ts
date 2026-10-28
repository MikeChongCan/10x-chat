import type { Page } from 'playwright';
import type { CapturedResponse, ProviderActions, ProviderConfig, VideoModel } from '../types.js';

export const FLOW_CONFIG: ProviderConfig = {
  name: 'flow',
  displayName: 'Google Flow',
  url: 'https://labs.google/fx/tools/flow',
  loginUrl: 'https://labs.google/fx/tools/flow',
  models: ['Omni Flash', 'Veo 3.1 - Lite', 'Veo 3.1 - Fast', 'Veo 3.1 - Quality'],
  defaultModel: 'Omni Flash',
  defaultTimeoutMs: 10 * 60 * 1000, // 10 mins — video gen is slow
};

export const FLOW_SELECTORS = {
  // Navigation
  newProject: 'button:has-text("New project")',
  goBack: 'button:has-text("Go Back")',

  // Prompt composer
  composer: 'div[contenteditable="true"]',
  composerTextbox: '[role="textbox"]',

  // Submit
  // Legacy Flow used a Material icon button containing the text "arrow_forward".
  // Newer Flow builds often expose a labeled action like "Make clip" instead.
  createButton: 'button:has-text("arrow_forward")',

  // Model selector popup — open by clicking the pill button
  modelPill: '.sc-46973129-1', // the model pill component class

  // Output type tabs (role="tab")
  imageTab: 'button[role="tab"]:has-text("Image")',
  videoTab: 'button[role="tab"]:has-text("Video")',

  // Video sub-mode tabs
  ingredientsTab: 'button[role="tab"]:has-text("Ingredients")',
  framesTab: 'button[role="tab"]:has-text("Frames")',

  // Orientation — UI shows aspect-ratio buttons (9:16 / 16:9), not text labels.
  // :text-is() is exact match — prevents false hit on "Video · 8s □ 1x" status pill.
  landscapeBtn: 'button:text-is("16:9")',
  portraitBtn: 'button:text-is("9:16")',

  // Count — first button is "1x"; rest are "x2"/"x3"/"x4" (confirmed from UI screenshot)
  countX1: 'button[role="tab"]:text-is("1x")',
  countX2: 'button[role="tab"]:text-is("x2")',
  countX3: 'button[role="tab"]:text-is("x3")',
  countX4: 'button[role="tab"]:text-is("x4")',

  // Duration (seconds) — :text-is() for exact match, fallback broader selector second
  duration4s: 'button[role="tab"]:text-is("4s"), button:text-is("4s")',
  duration6s: 'button[role="tab"]:text-is("6s"), button:text-is("6s")',
  duration8s: 'button[role="tab"]:text-is("8s"), button:text-is("8s")',
  duration10s: 'button[role="tab"]:text-is("10s"), button:text-is("10s")',

  // Model dropdown (within popup)
  modelDropdown: 'button:has-text("arrow_drop_down")',

  // Frame inputs (Frames mode)
  startFrame: 'text="Start"',
  endFrame: 'text="End"',

  // Media upload
  addMedia: 'button:has-text("Add Media")',
  uploadImage: '[role="menuitem"]:has-text("Upload image")',
  fileInput: 'input[type="file"][accept="image/*"]',

  // Cookie
  cookieAgree: 'button:has-text("Agree")',

  // Scenebuilder
  scenebuilder: 'button:has-text("Scenebuilder")',
} as const;

/**
 * Open the model selector popup by clicking the pill button in the bottom bar.
 */
async function openModelSelector(page: Page): Promise<void> {
  // The model pill displays current mode info (e.g. "🍌 Nano Banana", "Video 📺 x2")
  const pill = page.locator(FLOW_SELECTORS.modelPill).first();
  if (await pill.isVisible().catch(() => false)) {
    await pill.click();
    await page.waitForTimeout(1000);
    return;
  }
  // Fallback: try clicking any button that contains the current model info
  const fallback = page
    .locator('button:has-text("Nano Banana"), button:has-text("Video"), button:has-text("Veo")')
    .first();
  if (await fallback.isVisible().catch(() => false)) {
    await fallback.click();
    await page.waitForTimeout(1000);
  }
}

/**
 * Configure the model selector for video generation.
 */
export async function configureVideoMode(
  page: Page,
  opts: {
    mode?: 'ingredients' | 'frames';
    model?: VideoModel;
    orientation?: 'landscape' | 'portrait';
    count?: 1 | 2 | 3 | 4;
    durationSecs?: 4 | 6 | 8 | 10;
  },
): Promise<void> {
  await openModelSelector(page);

  // All clicks inside the popup need { force: true } because Flow's
  // overlay/backdrop (<html>) intercepts pointer events.

  // 1. Switch to Video tab (Flow defaults to Image — this is critical)
  const videoTab = page.locator(FLOW_SELECTORS.videoTab).first();
  try {
    await videoTab.waitFor({ state: 'visible', timeout: 5_000 });
    await videoTab.click({ force: true });
    await page.waitForTimeout(800);
  } catch {
    // Popup may not have opened — retry
    await openModelSelector(page);
    const retry = page.locator(FLOW_SELECTORS.videoTab).first();
    if (await retry.isVisible().catch(() => false)) {
      await retry.click({ force: true });
      await page.waitForTimeout(800);
    } else {
      console.warn('⚠ Could not find Video tab — generation may default to Image mode');
    }
  }

  // 2. Select sub-mode (Ingredients or Frames)
  const mode = opts.mode ?? 'ingredients';
  const modeTab =
    mode === 'frames'
      ? page.locator(FLOW_SELECTORS.framesTab).first()
      : page.locator(FLOW_SELECTORS.ingredientsTab).first();
  if (await modeTab.isVisible().catch(() => false)) {
    await modeTab.click({ force: true });
    await page.waitForTimeout(500);
  }

  // 3. Set orientation
  const orientation = opts.orientation ?? 'landscape';
  const orientBtn =
    orientation === 'portrait'
      ? page.locator(FLOW_SELECTORS.portraitBtn).first()
      : page.locator(FLOW_SELECTORS.landscapeBtn).first();
  if (await orientBtn.isVisible().catch(() => false)) {
    await orientBtn.click({ force: true });
    await page.waitForTimeout(300);
  }

  // 4. Set count
  const count = opts.count ?? 1;
  const countSel = {
    1: FLOW_SELECTORS.countX1,
    2: FLOW_SELECTORS.countX2,
    3: FLOW_SELECTORS.countX3,
    4: FLOW_SELECTORS.countX4,
  }[count];
  const countBtn = page.locator(countSel).first();
  if (await countBtn.isVisible().catch(() => false)) {
    await countBtn.click({ force: true });
    await page.waitForTimeout(300);
  }

  // 5. Select model only if non-default (avoids problematic dropdown click)
  if (opts.model && opts.model !== 'Omni Flash') {
    const modelDropdown = page.locator(FLOW_SELECTORS.modelDropdown).last();
    if (await modelDropdown.isVisible().catch(() => false)) {
      await modelDropdown.click({ force: true });
      await page.waitForTimeout(1000);

      const modelOption = page.locator(`text="${opts.model}"`).first();
      if (await modelOption.isVisible().catch(() => false)) {
        await modelOption.click({ force: true });
        await page.waitForTimeout(500);
      }
    }
  }

  // 6. Set duration (4s / 6s / 8s / 10s tabs — shown after model selection)
  if (opts.durationSecs) {
    const durSel = {
      4: FLOW_SELECTORS.duration4s,
      6: FLOW_SELECTORS.duration6s,
      8: FLOW_SELECTORS.duration8s,
      10: FLOW_SELECTORS.duration10s,
    }[opts.durationSecs];
    const durBtn = page.locator(durSel).first();
    if (await durBtn.isVisible().catch(() => false)) {
      await durBtn.click({ force: true });
      await page.waitForTimeout(300);
    } else {
      console.warn(`⚠ Duration button "${opts.durationSecs}s" not found — using default`);
    }
  }

  // Close popup by pressing Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

/**
 * Upload a single reference image in Ingredients mode.
 *
 * Two strategies, attempted in order:
 *   A. filechooser event: click "Add Media" → "Upload image", intercept the
 *      native dialog with page.waitForEvent('filechooser') before it can open.
 *   B. Direct setInputFiles: if the file input is already in the DOM (hidden),
 *      set files on it directly — avoids triggering the dialog entirely.
 */
export async function uploadIngredientImage(page: Page, imagePath: string): Promise<void> {
  // Strategy A — open the "Add Media" menu and intercept the file chooser
  const addMediaBtn = page.locator(FLOW_SELECTORS.addMedia).first();
  if (await addMediaBtn.isVisible().catch(() => false)) {
    await addMediaBtn.click({ force: true });
    await page.waitForTimeout(800);

    const uploadItem = page.locator(FLOW_SELECTORS.uploadImage).first();
    if (await uploadItem.isVisible().catch(() => false)) {
      try {
        // waitForEvent must be set up BEFORE the click that triggers the dialog
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 5_000 }),
          uploadItem.click({ force: true }),
        ]);
        await fileChooser.setFiles(imagePath);
        await page.waitForTimeout(3000);
        return;
      } catch {
        // Dialog didn't open — fall through to strategy B
      }
    }
  }

  // Strategy B — file input already in DOM (hidden), set files directly
  const fileInput = page.locator(FLOW_SELECTORS.fileInput).first();
  const inputAttached = await fileInput
    .waitFor({ state: 'attached', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (inputAttached) {
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(3000);
    return;
  }

  // Both strategies failed — the user explicitly passed --image, so this is an error
  throw new Error(
    'Flow "Add Media" button and file input not found — could not upload reference image. ' +
      'Try running with --headed to debug the UI state.',
  );
}

/**
 * Upload keyframe images in Frames mode.
 */
export async function uploadKeyframes(
  page: Page,
  opts: { startFrame?: string; endFrame?: string },
): Promise<void> {
  if (opts.startFrame) {
    const startBox = page.locator(FLOW_SELECTORS.startFrame).first();
    if (await startBox.isVisible().catch(() => false)) {
      await startBox.click();
      await page.waitForTimeout(500);
      // The file input should become available
      const fileInput = page.locator(FLOW_SELECTORS.fileInput).first();
      await fileInput.setInputFiles(opts.startFrame);
      await page.waitForTimeout(2000);
    }
  }

  if (opts.endFrame) {
    const endBox = page.locator(FLOW_SELECTORS.endFrame).first();
    if (await endBox.isVisible().catch(() => false)) {
      await endBox.click();
      await page.waitForTimeout(500);
      const fileInput = page.locator(FLOW_SELECTORS.fileInput).first();
      await fileInput.setInputFiles(opts.endFrame);
      await page.waitForTimeout(2000);
    }
  }
}

async function clickCreateButton(page: Page): Promise<boolean> {
  const legacy = page.locator(FLOW_SELECTORS.createButton).last();
  if (await legacy.isVisible().catch(() => false)) {
    // Check if it's actually clickable (not disabled)
    const isDisabled = await legacy.evaluate(
      (el) =>
        el.hasAttribute('disabled') ||
        el.getAttribute('aria-disabled') === 'true' ||
        (el as HTMLButtonElement).disabled === true,
    );
    if (!isDisabled) {
      await legacy.click();
      return true;
    }
  }

  return page.evaluate(() => {
    const isVisible = (el: Element | null): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.hidden) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const normalize = (value: string | null | undefined) =>
      (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

    const exclusions = [
      'new project',
      'create with flow',
      'get started',
      'go back',
      'add media',
      'agree',
      'ingredients',
      'frames',
      'landscape',
      'portrait',
      'scenebuilder',
      'arrow_drop_down',
      'feedback',
      'help',
      'settings',
    ];

    const candidates = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter(isVisible)
      .map((el) => {
        const text = normalize(el.textContent);
        const aria = normalize(el.getAttribute('aria-label'));
        const title = normalize(el.getAttribute('title'));
        const testid = normalize(el.getAttribute('data-testid'));
        const hay = `${text} ${aria} ${title} ${testid}`.trim();
        const rect = el.getBoundingClientRect();
        const disabled =
          el.hasAttribute('disabled') ||
          el.getAttribute('aria-disabled') === 'true' ||
          (el as HTMLButtonElement).disabled === true;

        let score = 0;
        if (hay.includes('make clip')) score += 100;
        if (hay.includes('arrow_forward')) score += 90;
        if (hay.includes('generate')) score += 80;
        if (hay.includes('submit') || hay.includes('send')) score += 70;
        if (hay === 'create' || hay.startsWith('create ')) score += 60;
        if (rect.top > window.innerHeight * 0.5) score += 15;

        return { el, hay, score, disabled, top: rect.top };
      })
      .filter((candidate) => {
        if (candidate.disabled || candidate.score <= 0) return false;
        return !exclusions.some((term) => candidate.hay.includes(term));
      })
      .sort((a, b) => b.score - a.score || b.top - a.top);

    const target = candidates[0]?.el;
    if (!(target instanceof HTMLElement)) return false;
    target.click();
    return true;
  });
}

/**
 * Poll for video generation progress. Returns when all tiles show completion
 * or when the timeout is reached.
 */
export async function waitForGeneration(
  page: Page,
  opts: { timeoutMs: number; onProgress?: (pct: number) => void },
): Promise<void> {
  const { timeoutMs, onProgress } = opts;
  const start = Date.now();
  const POLL_INTERVAL = 3000;

  while (Date.now() - start < timeoutMs) {
    // Check for progress percentages in tiles
    const progress = await page.evaluate(() => {
      const tiles = document.querySelectorAll('[class*="tile"], [class*="card"], [class*="media"]');
      const percents: number[] = [];
      for (const tile of Array.from(tiles)) {
        const text = tile.textContent ?? '';
        const match = text.match(/(\d+)%/);
        if (match) percents.push(Number.parseInt(match[1], 10));
      }
      // Also check for video elements (generation complete)
      const videos = document.querySelectorAll('video');
      if (videos.length > 0) return { done: true, percent: 100, videoCount: videos.length };
      if (percents.length === 0) return { done: false, percent: 0, videoCount: 0 };
      const avg = Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
      return { done: avg >= 100, percent: avg, videoCount: 0 };
    });

    if (onProgress) onProgress(progress.percent);

    if (progress.done || progress.videoCount > 0) {
      // Wait a bit more for the UI to settle
      await page.waitForTimeout(2000);
      return;
    }

    await page.waitForTimeout(POLL_INTERVAL);
  }
}

export const flowActions: ProviderActions = {
  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      // Wait for the studio to load
      await page.waitForTimeout(3000);

      // Flow requires Google account — check for profile avatar or ULTRA badge
      const hasProfile = await page.evaluate(() => {
        const body = document.body.textContent ?? '';
        // If we see "New project" or "Create", we're logged in
        return body.includes('New project') || body.includes('Create a project');
      });
      return hasProfile;
    } catch {
      return false;
    }
  },

  async submitPrompt(page: Page, prompt: string): Promise<void> {
    // Find the composer
    const composer = page.locator(FLOW_SELECTORS.composer).first();
    await composer.waitFor({ state: 'visible', timeout: 10_000 });
    await composer.click();
    await page.waitForTimeout(300);

    // Clear any existing text and type the prompt
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');

    try {
      await composer.fill(prompt);
    } catch {
      await page.keyboard.type(prompt, { delay: 15 });
    }

    await page.waitForTimeout(300);

    // Click the create/generate button.
    // Older Flow builds used an icon-only Material button with text "arrow_forward".
    // Current builds may expose a labeled button like "Make clip" instead.
    const clicked = await clickCreateButton(page);
    if (!clicked) {
      throw new Error(
        'Could not find Flow create button after entering prompt. Expected arrow_forward / Make clip / Generate style action.',
      );
    }
    await page.waitForTimeout(300);
  },

  async captureResponse(
    page: Page,
    opts: { timeoutMs: number; onChunk?: (chunk: string) => void },
  ): Promise<CapturedResponse> {
    const { timeoutMs, onChunk } = opts;
    const startTime = Date.now();

    // Wait for generation to complete
    await waitForGeneration(page, {
      timeoutMs,
      onProgress: (pct) => {
        if (onChunk) onChunk(`\rGenerating... ${pct}%`);
      },
    });

    const elapsed = Date.now() - startTime;
    const timedOut = elapsed >= timeoutMs;

    // Extract video info from the page
    const videoInfo = await page.evaluate(() => {
      const videos = document.querySelectorAll('video');
      const results: string[] = [];
      for (const v of Array.from(videos)) {
        results.push(v.src || v.querySelector('source')?.src || '');
      }
      return { count: videos.length, urls: results.filter(Boolean) };
    });

    const text =
      videoInfo.count > 0
        ? `Generated ${videoInfo.count} video(s) successfully.`
        : timedOut
          ? 'Video generation timed out.'
          : 'Video generation status unknown.';

    return {
      text,
      markdown: text,
      truncated: timedOut,
      thinkingTime: Math.round(elapsed / 1000),
    };
  },
};
