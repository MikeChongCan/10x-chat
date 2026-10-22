import type { Page } from 'playwright';
import { pollUntilStable } from '../core/polling.js';
import type {
  CapturedResponse,
  GeneratedImage,
  ProviderActions,
  ProviderConfig,
} from '../types.js';
import { submitPromptToComposer } from './submit.js';

export const GEMINI_CONFIG: ProviderConfig = {
  name: 'gemini',
  displayName: 'Gemini',
  url: 'https://gemini.google.com/app',
  loginUrl: 'https://gemini.google.com/app',
  models: ['Flash-Lite', 'Flash', 'Pro', 'Argon', 'Deep Think'],
  defaultModel: 'Flash',
  defaultTimeoutMs: 5 * 60 * 1000,
};

function normalizeGeminiModeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function resolveGeminiModeLabel(model: string): string {
  const normalized = normalizeGeminiModeLabel(model);
  if (normalized === 'fast') return 'Flash-Lite';
  if (normalized === 'thinking') return 'Flash';
  return model;
}

/**
 * Version-free key for a Gemini mode label, so "4 Argon", "Argon" and
 * "Gemini 4 Argon" all compare equal and a version bump (3.5 → 3.8 Flash)
 * does not break `--model Flash`.
 */
export function geminiModeKey(label: string): string {
  return normalizeGeminiModeLabel(resolveGeminiModeLabel(label))
    .replace(/^gemini\s+/, '')
    .replace(/^(\d+\s+)+/, '')
    .trim();
}

export function matchesGeminiMode(optionLabel: string, model: string): boolean {
  if (normalizeGeminiModeLabel(optionLabel) === normalizeGeminiModeLabel(model)) return true;
  const key = geminiModeKey(model);
  return key.length > 0 && geminiModeKey(optionLabel) === key;
}

/** Visible elements inside open menus. Gemini now renders menus in a `[popover]`, not `.cdk-overlay-container`. */
const GEMINI_MENU_ROOTS = '.cdk-overlay-container, [popover], [role="menu"]';

async function getGeminiModeOptionLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return (
      Array.from(
        document.querySelectorAll(
          'gem-menu-item[data-mode-id], [data-test-id^="bard-mode-option-"]',
        ),
      ) as HTMLElement[]
    ).map((el) => {
      if (el.offsetWidth === 0 || el.offsetHeight === 0) return '';
      const label = el.querySelector('.label') ?? el;
      return (label.textContent ?? '').replace(/\s+/g, ' ').trim();
    });
  });
}

async function clickGeminiModeOption(page: Page, model: string): Promise<boolean> {
  const labels = await getGeminiModeOptionLabels(page);
  const index = labels.findIndex((label) => label && matchesGeminiMode(label, model));
  if (index < 0) return false;
  return page.evaluate((i: number) => {
    const el = document.querySelectorAll(
      'gem-menu-item[data-mode-id], [data-test-id^="bard-mode-option-"]',
    )[i];
    if (!(el instanceof HTMLElement)) return false;
    el.click();
    return true;
  }, index);
}

async function clickGeminiMenuOption(page: Page, label: string): Promise<boolean> {
  const target = normalizeGeminiModeLabel(label);
  return page.evaluate(
    ({ targetLabel, rootsSelector }: { targetLabel: string; rootsSelector: string }) => {
      const itemSelector =
        'button,[role="menuitem"],[role="menuitemcheckbox"],[role="option"],mat-option,gem-menu-item,toolbox-drawer-item';
      const inMenus = Array.from(document.querySelectorAll(rootsSelector)).flatMap(
        (root) => Array.from(root.querySelectorAll(itemSelector)) as HTMLElement[],
      );
      const pool = inMenus.some((el) => el.offsetWidth > 0)
        ? inMenus
        : (Array.from(document.body.querySelectorAll(itemSelector)) as HTMLElement[]);

      const candidates = [...new Set(pool)].sort((a, b) => {
        const aInteractive = a.tagName === 'BUTTON' || !!a.getAttribute('role');
        const bInteractive = b.tagName === 'BUTTON' || !!b.getAttribute('role');
        return Number(bInteractive) - Number(aInteractive);
      });
      for (const el of candidates) {
        const visible = el.offsetWidth > 0 && el.offsetHeight > 0;
        if (!visible) continue;
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
        const aria = (el.getAttribute('aria-label') ?? '').toLowerCase();
        const normalized = `${text} ${aria}`.replace(/[^a-z0-9]+/g, ' ').trim();
        if (
          normalized === targetLabel ||
          normalized.startsWith(`${targetLabel} `) ||
          normalized.includes(targetLabel)
        ) {
          const clickTarget =
            el.tagName === 'BUTTON' || el.getAttribute('role')
              ? el
              : ((el.querySelector(
                  'button,[role="menuitem"],[role="menuitemcheckbox"]',
                ) as HTMLElement | null) ?? el);
          clickTarget.click();
          return true;
        }
      }
      return false;
    },
    { targetLabel: target, rootsSelector: GEMINI_MENU_ROOTS },
  );
}

async function getVisibleGeminiMenuLabels(page: Page): Promise<string> {
  return page.evaluate((rootsSelector: string) => {
    const items = Array.from(document.querySelectorAll(rootsSelector)).flatMap(
      (root) =>
        Array.from(
          root.querySelectorAll(
            'button,[role="menuitem"],[role="menuitemcheckbox"],[role="option"],mat-option',
          ),
        ) as HTMLElement[],
    );
    return [...new Set(items)]
      .filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0)
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(', ');
  }, GEMINI_MENU_ROOTS);
}

async function clickGeminiToolsButton(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll('button,[role="button"],material-button'),
    ) as HTMLElement[];
    const visibleTools = candidates.filter((el) => {
      const visible = el.offsetWidth > 0 && el.offsetHeight > 0;
      if (!visible) return false;
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      const aria = (el.getAttribute('aria-label') ?? '').toLowerCase();
      const title = (el.getAttribute('title') ?? '').toLowerCase();
      const testId = (el.getAttribute('data-test-id') ?? '').toLowerCase();
      return (
        text === 'tools' ||
        text === '工具' ||
        /\btools?\b/.test(aria) ||
        /\btools?\b/.test(title) ||
        testId.includes('toolbox')
      );
    });

    const el = visibleTools.at(-1);
    if (el instanceof HTMLElement) {
      el.click();
      return true;
    }
    return false;
  });
}

/**
 * Activate a Gemini composer tool such as "Deep Think" or "Deep Research".
 * Google gates some Ultra features behind the Tools menu instead of the model
 * picker, so this helper intentionally searches both direct buttons and the
 * composer Tools popover.
 */
export async function activateGeminiTool(page: Page, tool: string): Promise<boolean> {
  const directClicked = await clickGeminiMenuOption(page, tool);
  if (directClicked) {
    await page.waitForTimeout(500);
    return true;
  }

  const toolsClicked = await clickGeminiToolsButton(page);
  if (!toolsClicked) return false;

  await page.waitForTimeout(1500);
  const toolClicked = await clickGeminiMenuOption(page, tool);
  if (toolClicked) {
    await page.waitForTimeout(500);
    return true;
  }

  await page.keyboard.press('Escape').catch(() => {});
  return false;
}

const SELECTORS = {
  composer: '.ql-editor[contenteditable="true"], div[role="textbox"][aria-label*="prompt"]',
  sendButton: 'button.send-button, button[aria-label="Send message"]',
  /** Model/mode picker button near the composer (Gemini calls it "mode picker") */
  modelPicker:
    'button[data-test-id="bard-mode-menu-button"], button[aria-label="Open mode picker"], button.input-area-switch, button.mat-mdc-menu-trigger:has(.input-area-switch-button-label)',
  /** model-response is the Angular custom element wrapping each AI turn */
  responseTurn: 'model-response .model-response-text, model-response message-content',
  /** Indicators that Gemini is still generating (text streaming or image generation in flight) */
  streamingIndicators: [
    // Stop/cancel button visible while generating
    'button[aria-label="Stop generating"], button[aria-label="Cancel"]',
    // Imagen / Nano Banana loading spinner or status
    '.image-generation-loading',
    '.loading-indicator',
    // "Generating image" / "Loading Nano Banana" text shown during image gen
    'model-response [class*="loading"]',
    'model-response [class*="progress"]',
  ].join(', '),
  /** Generated images in the response (Imagen / Nano Banana) */
  generatedImages: [
    'img.image.loaded',
    'img[alt*="AI generated"]',
    'img[alt*="Generated"]',
    // Imagen result containers
    'model-response img[src*="lh3.googleusercontent.com"]',
    'model-response img[src*="encrypted"]',
  ].join(', '),
} as const;

/**
 * Wait for Gemini image generation to complete.
 * After text stabilizes, check if image generation is in progress and
 * wait for images to appear and fully load (naturalWidth > 0).
 */
function isGeminiDeferredResponse(text: string): boolean {
  return /(?:deep think|正在处理|正在生成|稍后回来|check back|come back|generating your response)/i.test(
    text,
  );
}

async function waitForDeepThinkFinalResponse(
  page: Page,
  initialText: string,
  timeoutMs: number,
  onChunk?: (chunk: string) => void,
): Promise<{ text: string; truncated: boolean }> {
  if (!isGeminiDeferredResponse(initialText)) {
    return { text: initialText, truncated: false };
  }

  const startTime = Date.now();
  let lastText = initialText;
  while (Date.now() - startTime < timeoutMs) {
    await page.waitForTimeout(15_000);
    await page.goto(page.url(), { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(3_000);

    const currentText =
      (
        await page
          .locator(SELECTORS.responseTurn)
          .last()
          .textContent()
          .catch(() => '')
      )?.trim() ?? '';
    if (currentText && currentText !== lastText) {
      lastText = currentText;
      onChunk?.(currentText);
    }
    if (currentText && !isGeminiDeferredResponse(currentText)) {
      return { text: currentText, truncated: false };
    }
  }

  return { text: lastText, truncated: true };
}

async function waitForImages(page: Page, timeoutMs: number): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 2_000;

  // First, check if there are any signs of image generation in the last response
  const lastTurnHtml = await page
    .locator(SELECTORS.responseTurn)
    .last()
    .innerHTML()
    .catch(() => '');
  const lowerHtml = lastTurnHtml.toLowerCase();
  const hasImageGenHints =
    lowerHtml.includes('nano banana') ||
    lowerHtml.includes('imagen') ||
    lowerHtml.includes('image-generation') ||
    lowerHtml.includes('generating') ||
    lowerHtml.includes('img');

  if (!hasImageGenHints) return;

  // Wait for loading indicators to disappear and images to be fully loaded
  while (Date.now() - startTime < timeoutMs) {
    // Check if any loading indicators are still visible
    const stillLoading = await page
      .locator(SELECTORS.streamingIndicators)
      .first()
      .isVisible()
      .catch(() => false);

    if (stillLoading) {
      await page.waitForTimeout(pollInterval);
      continue;
    }

    // Check if images exist and are fully loaded
    const imageState = await page.evaluate((imgSelector: string) => {
      const imgs = Array.from(document.querySelectorAll(imgSelector));
      if (imgs.length === 0) return { count: 0, allLoaded: true };
      const allLoaded = imgs.every((img) => {
        const el = img as HTMLImageElement;
        return el.complete && el.naturalWidth > 0;
      });
      return { count: imgs.length, allLoaded };
    }, SELECTORS.generatedImages);

    if (imageState.count > 0 && imageState.allLoaded) {
      // Images are present and fully loaded
      return;
    }

    if (imageState.count > 0 && !imageState.allLoaded) {
      // Images exist but not yet loaded — keep waiting
      await page.waitForTimeout(pollInterval);
      continue;
    }

    // No loading indicators and no images — likely a text-only response
    break;
  }
}

export const geminiActions: ProviderActions = {
  async selectModel(page: Page, model: string): Promise<void> {
    const targetModel = resolveGeminiModeLabel(model);

    // Gemini Ultra exposes Deep Think as a Tools menu checkbox, not as a normal mode.
    if (normalizeGeminiModeLabel(targetModel) === 'deep think') {
      await page
        .locator(SELECTORS.composer)
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
        .catch(() => {});
      await page.waitForTimeout(1_500);
      const toolActivated = await activateGeminiTool(page, targetModel);
      if (!toolActivated) {
        console.warn(`Gemini tool "${targetModel}" was not available — using current mode`);
      }
      return;
    }

    // Check current mode via page.evaluate (avoids locator.textContent timeout)
    const pickerState = await page.evaluate((sel: string) => {
      const btn = Array.from(document.querySelectorAll(sel)).find(
        (el) => el instanceof HTMLElement && el.offsetWidth > 0,
      );
      if (!(btn instanceof HTMLElement)) return { found: false, text: '' };
      const label = btn.querySelector('.picker-primary-text') ?? btn;
      return { found: true, text: label.textContent?.trim() ?? '' };
    }, SELECTORS.modelPicker);

    if (!pickerState.found) {
      const toolActivated = await activateGeminiTool(page, targetModel);
      if (!toolActivated) {
        console.warn(
          `Gemini mode picker not found and tool "${targetModel}" was not available — using current mode`,
        );
      }
      return;
    }

    if (matchesGeminiMode(pickerState.text, targetModel)) {
      return; // Already on the requested mode
    }

    // Open the mode picker menu. Prefer a DOM click against the currently visible
    // button because Gemini's new UI can keep stale hidden picker buttons in the DOM.
    const pickerClicked = await page.evaluate((sel: string) => {
      const candidates = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
      const btn = candidates.find((el) => el.offsetWidth > 0 && el.offsetHeight > 0);
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }, SELECTORS.modelPicker);
    if (!pickerClicked) {
      await page.locator(SELECTORS.modelPicker).first().click();
    }
    await page.waitForTimeout(1000);

    // Mode items carry opaque data-mode-ids, so match on the visible label with the
    // version number stripped ("4 Argon" ↔ "Argon"). No loose substring fallback:
    // "Flash" must never pick "Flash-Lite".
    const textClicked = await clickGeminiModeOption(page, targetModel);

    if (!textClicked) {
      const availableModes = await getVisibleGeminiMenuLabels(page);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(700);

      const toolActivated = await activateGeminiTool(page, targetModel);
      if (!toolActivated) {
        console.warn(
          `Mode/tool "${targetModel}" not found in Gemini${availableModes ? ` (mode picker: ${availableModes})` : ''} — using current mode`,
        );
      }
      return;
    }
    await page.waitForTimeout(500);
  },

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      const currentUrl = page.url();
      if (/accounts\.google\.com/i.test(currentUrl)) return false;

      await page
        .locator(SELECTORS.composer)
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => {});
      const composerVisible = await page
        .locator(SELECTORS.composer)
        .first()
        .isVisible()
        .catch(() => false);
      if (!composerVisible) return false;

      const googleAuthCookieNames = new Set([
        'SID',
        'HSID',
        'SSID',
        'APISID',
        'SAPISID',
        'LSID',
        '__Secure-1PSID',
        '__Secure-3PSID',
        '__Secure-1PSIDTS',
        '__Secure-3PSIDTS',
      ]);
      const hasGoogleAuthCookies = await page
        .context()
        .cookies([
          'https://accounts.google.com',
          'https://gemini.google.com',
          'https://www.google.com',
        ])
        .then((cookies) => cookies.some((cookie) => googleAuthCookieNames.has(cookie.name)))
        .catch(() => false);

      const authState = await page.evaluate(() => {
        const visible = (el: Element): boolean => {
          if (!(el instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(el);
          return (
            el.offsetWidth > 0 &&
            el.offsetHeight > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none'
          );
        };

        // Gemini can expose a usable composer to signed-out/guest users. Treat the state
        // as authenticated only when we see positive account evidence, not merely because
        // the composer exists or because the page mentions paid plan names like Pro/Ultra.
        const signedInIndicators = Array.from(
          document.querySelectorAll(
            [
              '[aria-label*="Google Account" i]',
              '[aria-label*="account menu" i]',
              '[aria-label*="profile" i]',
              'button[aria-label*="account" i]',
              '[data-test-id*="account" i]',
              '[data-test-id*="profile" i]',
              'img[alt*="profile" i]',
              'img[alt*="account" i]',
              'a[href*="SignOutOptions"]',
              'a[href*="Logout"]',
            ].join(','),
          ),
        ).filter(visible);
        if (signedInIndicators.length > 0) {
          return { signedIn: true, signInVisible: false };
        }

        const candidates = Array.from(
          document.querySelectorAll(
            '.sign-in-button, button[data-test-id="bard-sign-in-button"], a[href*="accounts.google.com"], button, a',
          ),
        ).filter(visible) as HTMLElement[];
        const signInVisible = candidates.some((el) => {
          const text = (el.textContent ?? '').trim();
          const aria = el.getAttribute('aria-label') ?? '';
          const testId = el.getAttribute('data-test-id') ?? '';
          const href = el instanceof HTMLAnchorElement ? el.href : '';
          if (/SignOutOptions|Logout/i.test(href) || /Google Account/i.test(aria)) return false;
          return (
            /^sign in$/i.test(text) ||
            /\bsign in\b/i.test(aria) ||
            testId === 'bard-sign-in-button' ||
            /accounts\.google\.com/i.test(href)
          );
        });

        const bodyText = (document.body.textContent ?? '').replace(/\s+/g, ' ');
        const signedOutPromptVisible =
          /sign in to (?:gemini|continue|save|access|use)/i.test(bodyText) ||
          /try gemini without signing in/i.test(bodyText);

        return { signedIn: false, signInVisible: signInVisible || signedOutPromptVisible };
      });

      if (authState.signedIn) return true;
      if (authState.signInVisible) return false;

      // If Gemini has hidden the avatar/menu in this viewport, fall back to the presence
      // of Google auth cookies. Without these cookies, a visible composer is only guest mode.
      return hasGoogleAuthCookies;
    } catch {
      return false;
    }
  },

  async attachFiles(page: Page, filePaths: string[]): Promise<void> {
    // Gemini upload flow. The upload button only works when the composer is focused.
    //   1. Focus the composer
    //   2. Click upload-card-button → may show one-time consent dialog
    //   3. Dismiss consent if needed, then re-click upload-card-button
    //   4. Click visible "Upload files" menu item via Playwright (Playwright handles the CDK overlay)
    //      which triggers the hidden-local-file-upload-button Angular component
    //   5. Catch the filechooser event and set files

    // Step 1: focus composer (required for the upload button to be interactive)
    const composer = page.locator(SELECTORS.composer).first();
    await composer.waitFor({ state: 'visible', timeout: 10_000 });
    await composer.click();
    await page.waitForTimeout(500);

    // Helper: dismiss consent dialog if shown
    const dismissConsentDialog = async (): Promise<void> => {
      const agreeBtn = page.getByRole('button', { name: 'Agree' });
      const visible = await agreeBtn.isVisible().catch(() => false);
      if (visible) {
        await agreeBtn.click();
        await page.waitForTimeout(800);
      }
    };

    // Step 2: click upload button via aria-label (more stable than class selector)
    const uploadBtn = page
      .locator('button[aria-label="Open upload file menu"], button.upload-card-button')
      .first();
    await uploadBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await uploadBtn.click();
    await page.waitForTimeout(1200);

    // Check for unauthenticated state — upload button shows sign-in prompt instead of menu
    const isSignedIn = await page.evaluate(() => !document.querySelector('.sign-in-button'));
    if (!isSignedIn) {
      throw new Error(
        'Gemini file upload requires a signed-in Google account. Run `10x-chat login --provider gemini` to authenticate.',
      );
    }

    // Step 3: dismiss consent if it appeared, then re-open menu if needed
    await dismissConsentDialog();
    const overlayOpen = await page.evaluate(
      (rootsSelector: string) =>
        Array.from(document.querySelectorAll(rootsSelector)).some((el) =>
          Array.from(el.querySelectorAll('[role="menuitem"]')).some(
            (item) => item instanceof HTMLElement && item.offsetWidth > 0,
          ),
        ),
      GEMINI_MENU_ROOTS,
    );
    if (!overlayOpen) {
      // Re-focus composer then click upload button again
      await composer.click();
      await page.waitForTimeout(500);
      await uploadBtn.click();
      await page.waitForTimeout(1200);
    }

    // Step 4+5: click visible "Upload files" menu item
    const uploadItem = page.getByRole('menuitem', { name: /Upload files/i }).first();
    await uploadItem.waitFor({ state: 'visible', timeout: 8_000 });

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10_000 }),
      uploadItem.click(),
    ]);
    await fileChooser.setFiles(filePaths);

    // Wait for upload to settle
    await page.waitForTimeout(3000);
  },

  async submitPrompt(page: Page, prompt: string): Promise<void> {
    // Gemini mode/tool menus sometimes leave a transparent CDK backdrop open.
    // Dismiss it before focusing the composer, otherwise Playwright click is intercepted.
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
    await submitPromptToComposer(page, prompt, {
      composerSelector: SELECTORS.composer,
      sendButtonSelector: SELECTORS.sendButton,
    });
  },

  async captureResponse(
    page: Page,
    opts: { timeoutMs: number; onChunk?: (chunk: string) => void },
  ): Promise<CapturedResponse> {
    const { timeoutMs, onChunk } = opts;
    const startTime = Date.now();

    const existingTurns = await page.locator(SELECTORS.responseTurn).count();

    await page.locator(SELECTORS.responseTurn).nth(existingTurns).waitFor({ timeout: timeoutMs });

    const remainingMs = Math.max(timeoutMs - (Date.now() - startTime), 5_000);
    let {
      text,
      elapsed: _pollElapsed,
      truncated,
    } = await pollUntilStable(page, {
      getText: async (p) =>
        (await p.locator(SELECTORS.responseTurn).last().textContent())?.trim() ?? '',
      timeoutMs: remainingMs,
      onChunk,
      isStreaming: async (p) => {
        // Check if Gemini is still generating (text or images)
        const indicatorVisible = await p
          .locator(SELECTORS.streamingIndicators)
          .first()
          .isVisible()
          .catch(() => false);
        if (indicatorVisible) return true;

        // Also check for image-generation-specific text in the response
        // (e.g. "Loading Nano Banana", "Generating image", "Creating image")
        const lastTurnText =
          (await p.locator(SELECTORS.responseTurn).last().textContent())?.toLowerCase() ?? '';
        if (
          lastTurnText.includes('loading nano banana') ||
          lastTurnText.includes('generating image') ||
          lastTurnText.includes('creating image') ||
          lastTurnText.includes('loading imagen')
        ) {
          return true;
        }

        return false;
      },
    });

    const deepThinkRemainingMs = Math.max(timeoutMs - (Date.now() - startTime), 5_000);
    const deepThinkFinal = await waitForDeepThinkFinalResponse(
      page,
      text,
      deepThinkRemainingMs,
      onChunk,
    );
    text = deepThinkFinal.text;
    truncated = truncated || deepThinkFinal.truncated;

    // Post-poll: wait for images to finish loading if image generation was triggered.
    // Gemini image gen can take 10-30s after the text portion stabilizes.
    const postPollRemainingMs = Math.max(timeoutMs - (Date.now() - startTime), 5_000);
    await waitForImages(page, postPollRemainingMs);

    const lastTurn = page.locator(SELECTORS.responseTurn).last();
    const markdown = (await lastTurn.innerHTML()) ?? '';

    // Extract generated images (Imagen / Nano Banana)
    const images: GeneratedImage[] = await page.evaluate((imgSelector: string) => {
      const seen = new Set<string>();
      const results: { url: string; alt: string; width: number; height: number }[] = [];
      const imgs = Array.from(document.querySelectorAll(imgSelector));
      for (const img of imgs) {
        const src = img.getAttribute('src') ?? '';
        if (!src || seen.has(src)) continue;
        // Skip tiny icons/avatars (likely UI elements, not generated images)
        const w = (img as HTMLImageElement).naturalWidth;
        const h = (img as HTMLImageElement).naturalHeight;
        if (w > 0 && w < 64 && h > 0 && h < 64) continue;
        seen.add(src);
        const fullSizeUrl = src.startsWith('blob:') || src.includes('=s') ? src : `${src}=s1024-rj`;
        results.push({
          url: fullSizeUrl,
          alt: img.getAttribute('alt') ?? '',
          width: w,
          height: h,
        });
      }
      return results;
    }, SELECTORS.generatedImages);

    const totalElapsed = Date.now() - startTime;
    return {
      text,
      markdown,
      truncated,
      thinkingTime: Math.round(totalElapsed / 1000),
      ...(images.length > 0 ? { images } : {}),
    };
  },
};
