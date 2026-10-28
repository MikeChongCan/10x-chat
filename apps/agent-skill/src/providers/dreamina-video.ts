import type { Page } from 'playwright';

/**
 * Dreamina (CapCut) video-generation UI automation.
 *
 * The video toolbar is built with Arco Design (`lv-*`) components:
 * - Type / Model / Reference-mode / Duration are `.lv-select[role="combobox"]`
 *   that open a portal `.lv-select-popup` containing `.lv-select-option`s.
 * - Aspect ratio + resolution share one `lv-btn` that opens a popover of radio
 *   chips (`[class*="radio-content"]`) — ratios (21:9 … 9:16) and 720P/1080P.
 * - References upload through `input[type="file"]` (multiple; images/video/audio).
 *
 * Hashed CSS-module suffixes (e.g. `toolbar-select-f8R3U4`) change per build, so
 * everything here keys off the stable Arco classes + visible option text.
 */

export const DREAMINA_VIDEO_MODELS = [
  'Seedance 2.0 Fast',
  'Seedance 2.0',
  'Seedance 1.5 Pro',
  'Seedance 1.0',
  'Seedance 1.0 Fast',
] as const;
export type DreaminaVideoModel = (typeof DREAMINA_VIDEO_MODELS)[number];

/** Cheapest model — "Faster and lower cost" — used as the test/default model. */
export const DREAMINA_DEFAULT_MODEL: DreaminaVideoModel = 'Seedance 2.0 Fast';

export const DREAMINA_ASPECTS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] as const;
export type DreaminaAspect = (typeof DREAMINA_ASPECTS)[number];

export const DREAMINA_RESOLUTIONS = ['720P', '1080P'] as const;
export type DreaminaResolution = (typeof DREAMINA_RESOLUTIONS)[number];

export const DREAMINA_MIN_DURATION = 4;
export const DREAMINA_MAX_DURATION = 15;

/** Reference (input-image) modes, mapped to their UI labels. */
export const DREAMINA_REF_MODES = {
  omni: 'Omni reference',
  frames: 'First and last frames',
  multiframes: 'Multiframes',
} as const;
export type DreaminaRefMode = keyof typeof DREAMINA_REF_MODES;

export interface DreaminaVideoOptions {
  prompt: string;
  model?: DreaminaVideoModel;
  aspect?: DreaminaAspect;
  resolution?: DreaminaResolution;
  /** Clip length in seconds (4–15). */
  durationSecs?: number;
  /** Input-image mode for the uploaded references. */
  refMode?: DreaminaRefMode;
  /** Reference / input images (image-to-video). Up to 12. */
  images?: string[];
  headed?: boolean;
  timeoutMs?: number;
  saveDir?: string;
  isolatedProfile?: boolean;
}

export const DREAMINA_VIDEO_SELECTORS = {
  combobox: '.lv-select[role="combobox"]',
  selectPopup: '.lv-select-popup',
  selectOption: '.lv-select-option',
  composer: '.tiptap.ProseMirror[role="textbox"]',
  submit: 'button[class*="submit-button"]:not(.lv-btn-disabled)',
  fileInput: 'input[type="file"]',
} as const;

// ── Browser-context helpers (run inside page.evaluate) ──────────────

/** Click the first visible `.lv-select` combobox whose text matches `pattern`. */
async function openCombobox(page: Page, pattern: string): Promise<boolean> {
  return page.evaluate((pat) => {
    const rx = new RegExp(pat, 'i');
    const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
    const vis = (el: Element | null): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      const s = getComputedStyle(el);
      return (
        el.offsetWidth > 0 &&
        el.offsetHeight > 0 &&
        s.visibility !== 'hidden' &&
        s.display !== 'none'
      );
    };
    const box = Array.from(document.querySelectorAll('.lv-select[role="combobox"]'))
      .filter(vis)
      .find((el) => rx.test(norm(el.textContent)));
    if (box) {
      box.click();
      return true;
    }
    return false;
  }, pattern);
}

/** Outcome of trying to pick an option from an open `.lv-select-popup`. */
type SelectOutcome = 'clicked' | 'disabled' | 'not-found';

/**
 * Click an option in the open `.lv-select-popup` whose own title text (or that
 * of a descendant) exactly equals one of `labels`. Exact match disambiguates
 * e.g. "Dreamina Seedance 2.0" from "Dreamina Seedance 2.0 Fast".
 *
 * Returns `'disabled'` (without clicking) when the matching option is locked
 * — Arco marks it `lv-select-option-wrapper-disabled` / `aria-disabled`. Some
 * Dreamina models (e.g. Seedance 1.x) are unavailable on certain accounts, and
 * clicking them is a no-op that would silently leave the wrong model selected.
 */
async function clickSelectOption(page: Page, labels: string[]): Promise<SelectOutcome> {
  return page.evaluate((wanted) => {
    const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
    const vis = (el: Element | null): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      const s = getComputedStyle(el);
      return (
        el.offsetWidth > 0 &&
        el.offsetHeight > 0 &&
        s.visibility !== 'hidden' &&
        s.display !== 'none'
      );
    };
    const isDisabled = (el: Element): boolean =>
      /disabled/i.test(el.getAttribute('class') ?? '') ||
      el.getAttribute('aria-disabled') === 'true' ||
      !!el.closest('[aria-disabled="true"], [class*="disabled"]');
    const options = Array.from(
      document.querySelectorAll(
        '.lv-select-popup .lv-select-option, .lv-select-popup [role="option"]',
      ),
    ).filter(vis);
    for (const opt of options) {
      const nodes = [opt, ...Array.from(opt.querySelectorAll('*'))];
      if (nodes.some((n) => wanted.includes(norm(n.textContent)))) {
        if (isDisabled(opt)) return 'disabled';
        opt.click();
        return 'clicked';
      }
    }
    return 'not-found';
  }, labels);
}

// ── Public actions ──────────────────────────────────────────────────

export async function selectVideoModel(page: Page, model: DreaminaVideoModel): Promise<void> {
  const opened = await openCombobox(page, 'Seedance|Seedream|Dreamina|Veo|Kling');
  if (!opened) {
    console.warn(`⚠ Dreamina model selector not found — keeping default (wanted "${model}")`);
    return;
  }
  await page.waitForTimeout(700);
  const outcome = await clickSelectOption(page, [`Dreamina ${model}`, model]);
  await page.keyboard.press('Escape').catch(() => {});
  if (outcome === 'disabled') {
    throw new Error(
      `Dreamina model "${model}" is locked on your account (greyed out in the picker). ` +
        'Model availability depends on your plan/region — "Seedance 2.0 Fast" and ' +
        '"Seedance 2.0" are the generally-available options.',
    );
  }
  if (outcome === 'not-found') {
    console.warn(`⚠ Dreamina model "${model}" not in picker — keeping current`);
  }
  await page.waitForTimeout(500);
}

export async function selectReferenceMode(page: Page, refMode: DreaminaRefMode): Promise<void> {
  const label = DREAMINA_REF_MODES[refMode];
  const opened = await openCombobox(page, 'reference|frame|Multiframe|Omni');
  if (!opened) {
    console.warn(`⚠ Dreamina reference-mode selector not found (wanted "${label}")`);
    return;
  }
  await page.waitForTimeout(600);
  const outcome = await clickSelectOption(page, [label]);
  if (outcome !== 'clicked') {
    console.warn(`⚠ Dreamina reference mode "${label}" ${outcome} — keeping current`);
    await page.keyboard.press('Escape').catch(() => {});
  }
  await page.waitForTimeout(500);
}

export async function selectDuration(page: Page, durationSecs: number): Promise<void> {
  const clamped = Math.min(
    DREAMINA_MAX_DURATION,
    Math.max(DREAMINA_MIN_DURATION, Math.round(durationSecs)),
  );
  const opened = await openCombobox(page, '^\\s*\\d+s\\s*$');
  if (!opened) {
    console.warn(`⚠ Dreamina duration selector not found (wanted ${clamped}s)`);
    return;
  }
  await page.waitForTimeout(500);
  const outcome = await clickSelectOption(page, [`${clamped}s`]);
  if (outcome !== 'clicked') {
    console.warn(`⚠ Dreamina duration "${clamped}s" ${outcome} — keeping current`);
    await page.keyboard.press('Escape').catch(() => {});
  }
  await page.waitForTimeout(400);
}

/**
 * True if a toolbar button's text contains an aspect ratio like "16:9" — even
 * when a resolution is concatenated, e.g. "16:9720P" (Seedance 2.0). The key
 * detail: NO trailing word boundary. In "16:9720P" the ratio and resolution
 * digits run together, so `\b\d{1,2}:\d{1,2}\b` fails to match and the
 * aspect/resolution control is never found.
 *
 * NOTE: `selectAspectAndResolution` inlines this regex inside `page.evaluate`
 * (can't close over Node scope). Keep in sync — unit tests guard the contract.
 */
export function buttonTextHasAspectRatio(text: string): boolean {
  return /\b\d{1,2}:\d{1,2}/.test(text);
}

/** Open the aspect/resolution popover and pick the requested ratio + resolution. */
export async function selectAspectAndResolution(
  page: Page,
  aspect: DreaminaAspect | undefined,
  resolution: DreaminaResolution | undefined,
): Promise<void> {
  if (!aspect && !resolution) return;

  const opened = await page.evaluate(() => {
    const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
    const vis = (el: Element | null): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      const s = getComputedStyle(el);
      return (
        el.offsetWidth > 0 &&
        el.offsetHeight > 0 &&
        s.visibility !== 'hidden' &&
        s.display !== 'none'
      );
    };
    // Inline copy of `buttonTextHasAspectRatio` (page.evaluate can't close over
    // Node scope). Keep in sync — unit tests guard the contract. NO trailing
    // word boundary: "16:9720P" (Seedance 2.0) runs the ratio + resolution
    // digits together, so `\b\d{1,2}:\d{1,2}\b` would fail to match.
    const btn = Array.from(document.querySelectorAll('button.lv-btn'))
      .filter(vis)
      .find((el) => /\b\d{1,2}:\d{1,2}/.test(norm(el.textContent)));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  if (!opened) {
    console.warn('⚠ Dreamina aspect/resolution control not found — keeping defaults');
    return;
  }
  await page.waitForTimeout(600);

  const picked = await page.evaluate(
    ({ wantAspect, wantRes }) => {
      const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
      const vis = (el: Element | null): el is HTMLElement => {
        if (!(el instanceof HTMLElement)) return false;
        const s = getComputedStyle(el);
        return (
          el.offsetWidth > 0 &&
          el.offsetHeight > 0 &&
          s.visibility !== 'hidden' &&
          s.display !== 'none'
        );
      };
      const clickExact = (text: string): boolean => {
        const el = Array.from(
          document.querySelectorAll(
            '[class*="radio-content"], [class*="radio-"], button, [role="radio"]',
          ),
        )
          .filter(vis)
          .find((e) => norm(e.textContent) === text);
        if (el) {
          el.click();
          return true;
        }
        return false;
      };
      return {
        aspect: wantAspect ? clickExact(wantAspect) : true,
        res: wantRes ? clickExact(wantRes) : true,
      };
    },
    { wantAspect: aspect ?? null, wantRes: resolution ?? null },
  );
  if (aspect && !picked.aspect) console.warn(`⚠ Dreamina aspect "${aspect}" not found`);
  if (resolution && !picked.res) console.warn(`⚠ Dreamina resolution "${resolution}" not found`);

  await page.waitForTimeout(400);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

/** Upload reference / input images into the references file input. */
export async function uploadReferenceImages(page: Page, images: string[]): Promise<void> {
  if (images.length === 0) return;
  const input = page.locator(DREAMINA_VIDEO_SELECTORS.fileInput).first();
  await input.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
  await input.setInputFiles(images.slice(0, 12));
  // Give uploads time to register thumbnails before generating.
  await page.waitForTimeout(Math.min(3000 + images.length * 1500, 15_000));
}

/** Type the prompt into the "Describe your video" composer (not the reference box). */
export async function typePrompt(page: Page, prompt: string): Promise<void> {
  const handle = await page.evaluateHandle((composerSel) => {
    const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
    const vis = (el: Element | null): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      const s = getComputedStyle(el);
      return (
        el.offsetWidth > 0 &&
        el.offsetHeight > 0 &&
        s.visibility !== 'hidden' &&
        s.display !== 'none'
      );
    };
    const editables = Array.from(document.querySelectorAll(composerSel)).filter(vis);
    const placeholderOf = (el: Element) => {
      const ph = el.getAttribute('data-placeholder') || el.getAttribute('aria-placeholder') || '';
      const inner = el.querySelector('[data-placeholder]')?.getAttribute('data-placeholder') ?? '';
      return norm(`${ph} ${inner} ${el.textContent}`);
    };
    // Prefer the prompt composer; avoid the references box.
    const prompt = editables.find((el) => /describe|prompt|video|mention/i.test(placeholderOf(el)));
    const notReference = editables.find((el) => !/reference|upload/i.test(placeholderOf(el)));
    return prompt ?? notReference ?? editables[editables.length - 1] ?? null;
  }, DREAMINA_VIDEO_SELECTORS.composer);

  const composer = handle.asElement();
  if (!composer) throw new Error('Dreamina prompt composer not found.');

  await composer.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(prompt);
  await page.waitForTimeout(400);
}

/** Click the (now-enabled) generate/submit button. Returns false if not found. */
export async function clickGenerate(page: Page): Promise<boolean> {
  const submit = page.locator(DREAMINA_VIDEO_SELECTORS.submit).first();
  if (await submit.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await submit.click().catch(() => {});
    return true;
  }
  // Fallback: the primary circular icon button in the composer toolbar.
  return page.evaluate(() => {
    const vis = (el: Element | null): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      const s = getComputedStyle(el);
      return (
        el.offsetWidth > 0 &&
        el.offsetHeight > 0 &&
        s.visibility !== 'hidden' &&
        s.display !== 'none'
      );
    };
    const btn = Array.from(
      document.querySelectorAll(
        'button.lv-btn-primary.lv-btn-shape-circle, button[class*="submit-button"]',
      ),
    )
      .filter(vis)
      .find(
        (el) => !el.classList.contains('lv-btn-disabled') && !(el as HTMLButtonElement).disabled,
      );
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
}

/**
 * Build a stable lookup key from a prompt: the generation result card on
 * `/ai-tool/generate` echoes the prompt text, which uniquely identifies OUR
 * generation among other (history / in-progress) cards on the page.
 */
export function promptKey(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim().slice(0, 60).toLowerCase();
}

export interface ResultPoll {
  /** Video source URLs belonging to our generation (empty until ready). */
  srcs: string[];
  /** True if the result card surfaced an explicit failure. */
  failed: boolean;
}

/**
 * True if `src` is a *finished* generation clip rather than the in-progress
 * loading placeholder. While generating, the result card embeds a 780×780
 * spinner served from `capcutstatic.com/.../capcut-web-login-static`; the
 * finished clip is a real CDN video whose path contains `/video/` (or a
 * `blob:` URL). Polling must reject the former and wait for the latter, or it
 * downloads the placeholder instead of the video.
 *
 * NOTE: `readResultForPrompt` runs this inside `page.evaluate`, where it cannot
 * close over Node-scope functions, so it inlines an identical copy. Keep the
 * two in sync — the unit tests guard this contract.
 */
export function isDreaminaResultSrc(src: string): boolean {
  if (!src) return false;
  if (/capcutstatic\.com/.test(src)) return false;
  return src.startsWith('blob:') || /\/video\//.test(src);
}

/**
 * Locate OUR generation's result card by its echoed prompt text, then read the
 * `<video>` source(s) inside it. Scoping to the prompt's record avoids grabbing
 * trending-feed clips or other generations that share the page.
 */
async function readResultForPrompt(
  page: Page,
  key: string,
  baseline: string[],
): Promise<ResultPoll> {
  return page.evaluate(
    ({ wantedKey, baselineSrcs }) => {
      const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
      const srcOf = (v: HTMLVideoElement) =>
        v.currentSrc || v.src || v.querySelector('source')?.src || '';
      const GRID = '[class*="responsive-video-grid"]';
      const EDITABLE = '[contenteditable], .tiptap, .ProseMirror, textarea, input';
      const baseline = new Set(baselineSrcs);

      // Inline copy of `isDreaminaResultSrc` (page.evaluate can't close over
      // Node scope). Keep in sync — unit tests guard the contract. Rejects the
      // in-progress 780×780 `capcutstatic.com` placeholder; accepts the finished
      // CDN clip (`…/video/…`) or a blob URL.
      const isResultSrc = (src: string): boolean => {
        if (!src) return false;
        if (/capcutstatic\.com/.test(src)) return false;
        return src.startsWith('blob:') || /\/video\//.test(src);
      };

      // Text of `el` with any composer/editable text removed. The prompt
      // composer echoes OUR prompt, so including it would let an unrelated
      // card (or a home-page promo) match our key once `recordOf` walks up far
      // enough to swallow the composer. Stripping editables means only a real
      // result card's echoed prompt header can satisfy the match.
      const recordText = (el: Element): string => {
        const clone = el.cloneNode(true) as Element;
        for (const ed of Array.from(clone.querySelectorAll(EDITABLE))) ed.remove();
        return norm(clone.textContent).toLowerCase();
      };

      // Each generation renders one `responsive-video-grid`; the prompt header is
      // a sibling within the same record. The record is the largest ancestor that
      // still contains exactly ONE grid (going higher reaches the list of all
      // generations, whose combined text would mis-match). When only one grid is
      // on the page the walk reaches near-`body` and can swallow the composer —
      // `recordText` strips editables so that copy of our prompt can't match.
      const recordOf = (grid: Element): Element => {
        let record = grid;
        let node = grid.parentElement;
        for (let i = 0; i < 10 && node; i++) {
          if (node.querySelectorAll(GRID).length === 1) {
            record = node;
            node = node.parentElement;
          } else {
            break;
          }
        }
        return record;
      };

      for (const grid of Array.from(document.querySelectorAll(GRID))) {
        const text = recordText(recordOf(grid));
        if (!text.includes(wantedKey)) continue;

        const video = grid.querySelector('video');
        const src = video instanceof HTMLVideoElement ? srcOf(video) : '';
        // Accept only a finished, brand-new result clip — never the in-progress
        // placeholder or a pre-existing (history / trending) video.
        if (src && !baseline.has(src) && isResultSrc(src)) return { srcs: [src], failed: false };
        if (
          /generation failed|failed to generate|something went wrong|content.*violat/i.test(text)
        ) {
          return { srcs: [], failed: true };
        }
        // Our record exists but the video is still rendering — keep polling.
      }

      // Fallback: explicit failure text tied to our prompt (no grid rendered).
      for (const el of Array.from(document.querySelectorAll('div, p, span'))) {
        const t = recordText(el);
        if (
          t.includes(wantedKey) &&
          /generation failed|failed to generate|something went wrong|content.*violat/i.test(t)
        ) {
          return { srcs: [], failed: true };
        }
      }
      return { srcs: [], failed: false };
    },
    { wantedKey: key, baselineSrcs: baseline },
  );
}

/**
 * Snapshot the `src` of every `<video>` currently on the page. Captured just
 * before generating so the poll can exclude pre-existing (history / promo)
 * clips and only accept the brand-new generation result.
 */
export async function captureVideoSrcs(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const srcOf = (v: HTMLVideoElement) =>
      v.currentSrc || v.src || v.querySelector('source')?.src || '';
    return Array.from(document.querySelectorAll('video'))
      .map((v) => srcOf(v as HTMLVideoElement))
      .filter((s) => s.length > 0);
  });
}

/**
 * Poll the generate page until OUR prompt's result video has a src (or the
 * generation fails / times out). Returns the result video URL(s).
 */
export async function waitForResultVideo(
  page: Page,
  key: string,
  opts: { timeoutMs: number; baseline?: string[]; onTick?: (elapsedSecs: number) => void },
): Promise<string[]> {
  const { timeoutMs, baseline = [], onTick } = opts;
  const start = Date.now();
  const POLL = 3000;

  while (Date.now() - start < timeoutMs) {
    const result = await readResultForPrompt(page, key, baseline);
    if (onTick) onTick(Math.round((Date.now() - start) / 1000));

    if (result.failed) {
      throw new Error('Dreamina reported the generation failed (check prompt / content policy).');
    }
    if (result.srcs.length > 0) {
      // Let the src settle to its final CDN URL.
      await page.waitForTimeout(2000);
      const settled = await readResultForPrompt(page, key, baseline);
      return settled.srcs.length > 0 ? settled.srcs : result.srcs;
    }
    await page.waitForTimeout(POLL);
  }
  return [];
}
