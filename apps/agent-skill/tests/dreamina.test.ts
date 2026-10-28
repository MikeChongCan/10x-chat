import { describe, expect, it, vi } from 'vitest';
import { DREAMINA_CONFIG, dreaminaActions } from '../src/providers/dreamina.js';

interface DomState {
  signInVisible: boolean;
  hasCreditBalance: boolean;
}

function createLoginPage(opts: { url?: string; dom?: DomState; cookieNames?: string[] }) {
  const locator = {
    first: () => locator,
    waitFor: vi.fn(async () => {}),
  };
  return {
    url: vi.fn(() => opts.url ?? 'https://dreamina.capcut.com/ai-tool/home?type=video'),
    locator: vi.fn(() => locator),
    context: vi.fn(() => ({
      cookies: vi.fn(async () => (opts.cookieNames ?? []).map((name) => ({ name }))),
    })),
    evaluate: vi.fn(async () => opts.dom ?? { signInVisible: false, hasCreditBalance: false }),
  };
}

describe('Dreamina Provider', () => {
  describe('DREAMINA_CONFIG', () => {
    it('has the correct provider name and display name', () => {
      expect(DREAMINA_CONFIG.name).toBe('dreamina');
      expect(DREAMINA_CONFIG.displayName).toBe('Dreamina');
    });

    it('points at the CapCut Dreamina video tool', () => {
      expect(DREAMINA_CONFIG.url).toContain('dreamina.capcut.com');
      expect(DREAMINA_CONFIG.loginUrl).toContain('dreamina.capcut.com');
    });

    it('uses a long timeout suitable for video generation', () => {
      expect(DREAMINA_CONFIG.defaultTimeoutMs).toBe(10 * 60 * 1000);
    });
  });

  describe('dreaminaActions', () => {
    it('exports all required action methods', () => {
      expect(dreaminaActions.isLoggedIn).toBeTypeOf('function');
      expect(dreaminaActions.submitPrompt).toBeTypeOf('function');
      expect(dreaminaActions.captureResponse).toBeTypeOf('function');
    });

    it('video generation methods throw until implemented', async () => {
      await expect(dreaminaActions.submitPrompt({} as never, 'hi')).rejects.toThrow(
        /not yet implemented/i,
      );
      await expect(
        dreaminaActions.captureResponse({} as never, { timeoutMs: 1000 }),
      ).rejects.toThrow(/not yet implemented/i);
    });
  });

  describe('isLoggedIn', () => {
    it('treats a visible "Sign in" affordance as logged out (guest studio)', async () => {
      const page = createLoginPage({
        dom: { signInVisible: true, hasCreditBalance: false },
      });
      await expect(dreaminaActions.isLoggedIn(page as never)).resolves.toBe(false);
    });

    it('does not treat a guest composer alone as logged in (only anti-bot cookies)', async () => {
      const page = createLoginPage({
        dom: { signInVisible: false, hasCreditBalance: false },
        cookieNames: ['ttwid', 'msToken'],
      });
      await expect(dreaminaActions.isLoggedIn(page as never)).resolves.toBe(false);
    });

    // Regression: at ~3s the logged-out home transiently shows no "Sign in"
    // button while guest feed thumbnails match avatar classes. Without a real
    // session signal this must NOT be treated as logged in.
    it('does not false-positive during the transient load window', async () => {
      const page = createLoginPage({
        dom: { signInVisible: false, hasCreditBalance: false },
        cookieNames: ['ttwid'],
      });
      await expect(dreaminaActions.isLoggedIn(page as never)).resolves.toBe(false);
    });

    it('treats a rendered numeric credit balance as logged in', async () => {
      const page = createLoginPage({
        dom: { signInVisible: false, hasCreditBalance: true },
      });
      await expect(dreaminaActions.isLoggedIn(page as never)).resolves.toBe(true);
    });

    it('treats a CapCut passport session cookie as logged in', async () => {
      const page = createLoginPage({
        dom: { signInVisible: false, hasCreditBalance: false },
        cookieNames: ['sid_guard', 'ttwid'],
      });
      await expect(dreaminaActions.isLoggedIn(page as never)).resolves.toBe(true);
    });

    it('treats sign-in affordance as authoritative even with passport cookies', async () => {
      const page = createLoginPage({
        dom: { signInVisible: true, hasCreditBalance: false },
        cookieNames: ['sessionid', 'sid_guard'],
      });
      await expect(dreaminaActions.isLoggedIn(page as never)).resolves.toBe(false);
    });

    it('treats a CapCut passport login redirect as logged out', async () => {
      const page = createLoginPage({
        url: 'https://passport.capcut.com/login',
        dom: { signInVisible: false, hasCreditBalance: true },
        cookieNames: ['sessionid'],
      });
      await expect(dreaminaActions.isLoggedIn(page as never)).resolves.toBe(false);
      expect(page.evaluate).not.toHaveBeenCalled();
    });
  });
});
