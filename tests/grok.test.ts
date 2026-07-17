import { describe, expect, it, vi } from 'vitest';
import { extractGrokFailureText, GROK_CONFIG, grokActions } from '../src/providers/grok.js';

function createSubmitPage({ overlayVisible }: { overlayVisible: boolean }) {
  const events: string[] = [];
  let dialogVisible = overlayVisible;

  const closeButton = {
    first: vi.fn().mockReturnThis(),
    isVisible: vi.fn(async () => dialogVisible),
    click: vi.fn(async () => {
      events.push('close-overlay');
      dialogVisible = false;
    }),
  };
  const dialog = {
    first: vi.fn().mockReturnThis(),
    locator: vi.fn(() => closeButton),
    isVisible: vi.fn(async () => dialogVisible),
    waitFor: vi.fn(async ({ state }: { state: string }) => {
      if (state === 'hidden' && dialogVisible) throw new Error('Dialog still visible');
    }),
  };
  const composer = {
    first: vi.fn().mockReturnThis(),
    isVisible: vi.fn(async () => true),
    waitFor: vi.fn(async () => {}),
    click: vi.fn(async () => {
      events.push('click-composer');
      if (dialogVisible) throw new Error('dialog portal intercepts pointer events');
    }),
    evaluate: vi.fn(async () => true),
    fill: vi.fn(async () => {}),
  };
  const sendButton = {
    first: vi.fn().mockReturnThis(),
    waitFor: vi.fn(async () => {}),
    click: vi.fn(async () => events.push('click-send')),
  };

  const page = {
    locator: vi.fn((selector: string) => {
      if (selector === '#dialog-portal [role="dialog"]') return dialog;
      if (selector.includes('button[aria-label="Submit"]')) return sendButton;
      return composer;
    }),
    keyboard: {
      press: vi.fn(async (key: string) => {
        events.push(`press-${key}`);
        if (key === 'Escape') dialogVisible = false;
      }),
      insertText: vi.fn(async () => events.push('insert-text')),
    },
    waitForTimeout: vi.fn(async () => {}),
  };

  return { page, dialog, closeButton, events };
}

describe('Grok Provider', () => {
  describe('GROK_CONFIG', () => {
    it('should have correct provider name', () => {
      expect(GROK_CONFIG.name).toBe('grok');
    });

    it('should have correct display name', () => {
      expect(GROK_CONFIG.displayName).toBe('Grok');
    });

    it('should have correct URL', () => {
      expect(GROK_CONFIG.url).toBe('https://grok.com');
    });

    it('should have available models', () => {
      expect(GROK_CONFIG.models).toBeDefined();
      expect(GROK_CONFIG.models?.length).toBeGreaterThan(0);
      expect(GROK_CONFIG.models).toContain('Auto');
    });

    it('should default to Auto model', () => {
      expect(GROK_CONFIG.defaultModel).toBe('Auto');
    });

    it('should have a 5-minute default timeout', () => {
      expect(GROK_CONFIG.defaultTimeoutMs).toBe(5 * 60 * 1000);
    });
  });

  describe('extractGrokFailureText', () => {
    it('detects Grok no-response service failures', () => {
      expect(
        extractGrokFailureText(
          'No response. Grok was unable to finish replying. Please try again later or use a different model. Retry Auto',
        ),
      ).toBe(
        'Grok was unable to finish replying. Please try again later or use a different model.',
      );
    });

    it('does not flag normal assistant responses', () => {
      expect(extractGrokFailureText('OK')).toBeNull();
    });
  });

  describe('grokActions', () => {
    it('should export all required action methods', () => {
      expect(grokActions.isLoggedIn).toBeTypeOf('function');
      expect(grokActions.submitPrompt).toBeTypeOf('function');
      expect(grokActions.captureResponse).toBeTypeOf('function');
    });

    it('should export optional attachFiles method', () => {
      expect(grokActions.attachFiles).toBeTypeOf('function');
    });

    it('dismisses a dialog portal before clicking the composer', async () => {
      const { page, dialog, closeButton, events } = createSubmitPage({
        overlayVisible: true,
      });

      await grokActions.submitPrompt(page as never, 'Hello Grok');

      expect(closeButton.click).toHaveBeenCalledWith({ force: true });
      expect(dialog.waitFor).toHaveBeenCalledWith({ state: 'hidden', timeout: 1_500 });
      expect(events.indexOf('close-overlay')).toBeLessThan(events.indexOf('click-composer'));
      expect(events).toContain('insert-text');
      expect(events).toContain('click-send');
    });

    it('submits normally when no dialog portal is visible', async () => {
      const { page, dialog, closeButton, events } = createSubmitPage({
        overlayVisible: false,
      });

      await grokActions.submitPrompt(page as never, 'Hello Grok');

      expect(dialog.isVisible).toHaveBeenCalled();
      expect(closeButton.isVisible).not.toHaveBeenCalled();
      expect(page.keyboard.press).not.toHaveBeenCalledWith('Escape');
      expect(events).toContain('click-composer');
      expect(events).toContain('click-send');
    });
  });
});
