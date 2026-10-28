import { describe, expect, it } from 'vitest';
import {
  buttonTextHasAspectRatio,
  DREAMINA_ASPECTS,
  DREAMINA_DEFAULT_MODEL,
  DREAMINA_MAX_DURATION,
  DREAMINA_MIN_DURATION,
  DREAMINA_REF_MODES,
  DREAMINA_RESOLUTIONS,
  DREAMINA_VIDEO_MODELS,
  isDreaminaResultSrc,
} from '../src/providers/dreamina-video.js';

describe('Dreamina video config', () => {
  it('lists the five Seedance models', () => {
    expect(DREAMINA_VIDEO_MODELS).toContain('Seedance 2.0 Fast');
    expect(DREAMINA_VIDEO_MODELS).toContain('Seedance 1.5 Pro');
    expect(DREAMINA_VIDEO_MODELS).toHaveLength(5);
  });

  it('defaults to the cheapest model for tests', () => {
    // "Seedance 2.0 Fast" = "Faster and lower cost" per the model picker.
    expect(DREAMINA_DEFAULT_MODEL).toBe('Seedance 2.0 Fast');
    expect(DREAMINA_VIDEO_MODELS).toContain(DREAMINA_DEFAULT_MODEL);
  });

  it('exposes the observed aspect ratios and resolutions', () => {
    expect(DREAMINA_ASPECTS).toEqual(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']);
    expect(DREAMINA_RESOLUTIONS).toEqual(['720P', '1080P']);
  });

  it('maps the three input-image (reference) modes to UI labels', () => {
    expect(DREAMINA_REF_MODES.omni).toBe('Omni reference');
    expect(DREAMINA_REF_MODES.frames).toBe('First and last frames');
    expect(DREAMINA_REF_MODES.multiframes).toBe('Multiframes');
  });

  it('bounds duration to 4-15 seconds', () => {
    expect(DREAMINA_MIN_DURATION).toBe(4);
    expect(DREAMINA_MAX_DURATION).toBe(15);
  });
});

describe('isDreaminaResultSrc (placeholder rejection)', () => {
  it('accepts a finished CDN clip (the real result)', () => {
    // Observed live: 720×1280 / 1280×720 results come from the `…/video/…` CDN.
    expect(
      isDreaminaResultSrc(
        'https://v16-cc.capcut.com/90e23cee43988e56e312a587d546dcba/6a1efb74/video/tos/abc.mp4',
      ),
    ).toBe(true);
  });

  it('accepts a blob: result URL', () => {
    expect(isDreaminaResultSrc('blob:https://dreamina.capcut.com/uuid-1234')).toBe(true);
  });

  it('rejects the in-progress 780×780 loading placeholder', () => {
    // Observed live: while generating, the card embeds this static spinner.
    expect(
      isDreaminaResultSrc(
        'https://sf16-web-login-neutral.capcutstatic.com/obj/capcut-web-login-static/spinner.mp4',
      ),
    ).toBe(false);
  });

  it('rejects empty / non-video URLs', () => {
    expect(isDreaminaResultSrc('')).toBe(false);
    expect(isDreaminaResultSrc('https://dreamina.capcut.com/ai-tool/generate')).toBe(false);
  });
});

describe('buttonTextHasAspectRatio (aspect control discovery)', () => {
  it('matches a plain ratio (Seedance 2.0 Fast button)', () => {
    expect(buttonTextHasAspectRatio('16:9')).toBe(true);
    expect(buttonTextHasAspectRatio('9:16')).toBe(true);
    expect(buttonTextHasAspectRatio('21:9')).toBe(true);
  });

  it('matches when a resolution is concatenated (Seedance 2.0 button)', () => {
    // Regression: the button reads "16:9720P"; a trailing `\b` would fail here
    // because the ratio and resolution digits run together.
    expect(buttonTextHasAspectRatio('16:9720P')).toBe(true);
    expect(buttonTextHasAspectRatio('9:16720P')).toBe(true);
    expect(buttonTextHasAspectRatio('1:11080P')).toBe(true);
  });

  it('does not match non-ratio toolbar text', () => {
    expect(buttonTextHasAspectRatio('4s')).toBe(false);
    expect(buttonTextHasAspectRatio('Dreamina Seedance 2.0 Fast')).toBe(false);
    expect(buttonTextHasAspectRatio('720P')).toBe(false);
  });
});
