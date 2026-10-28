import { describe, expect, it, vi } from 'vitest';
import { geminiActions } from '../src/providers/gemini.js';

function createVisibleLocator(visible = true) {
  const loc = {
    first: () => loc,
    waitFor: vi.fn(async () => {}),
    isVisible: vi.fn(async () => visible),
  };
  return loc;
}

function createLoginPage(opts: {
  url?: string;
  composerVisible?: boolean;
  authState?: { signedIn: boolean; signInVisible: boolean };
  cookieNames?: string[];
}) {
  const locator = createVisibleLocator(opts.composerVisible ?? true);
  return {
    url: vi.fn(() => opts.url ?? 'https://gemini.google.com/app'),
    locator: vi.fn(() => locator),
    context: vi.fn(() => ({
      cookies: vi.fn(async () => (opts.cookieNames ?? []).map((name) => ({ name }))),
    })),
    evaluate: vi.fn(async () => opts.authState ?? { signedIn: false, signInVisible: false }),
  };
}

describe('Gemini login detection', () => {
  it('does not treat a guest composer as logged in', async () => {
    const page = createLoginPage({
      authState: { signedIn: false, signInVisible: false },
      cookieNames: [],
    });

    await expect(geminiActions.isLoggedIn(page as never)).resolves.toBe(false);
  });

  it('does not treat paid-plan marketing text as logged-in evidence', async () => {
    const page = createLoginPage({
      // Simulates the page mentioning Pro/Ultra but not exposing an account avatar/menu.
      authState: { signedIn: false, signInVisible: false },
      cookieNames: [],
    });

    await expect(geminiActions.isLoggedIn(page as never)).resolves.toBe(false);
  });

  it('accepts visible Google account evidence as logged in', async () => {
    const page = createLoginPage({
      authState: { signedIn: true, signInVisible: false },
      cookieNames: [],
    });

    await expect(geminiActions.isLoggedIn(page as never)).resolves.toBe(true);
  });

  it('falls back to Google auth cookies when the account avatar is hidden', async () => {
    const page = createLoginPage({
      authState: { signedIn: false, signInVisible: false },
      cookieNames: ['__Secure-1PSID'],
    });

    await expect(geminiActions.isLoggedIn(page as never)).resolves.toBe(true);
  });

  it('treats visible sign-in prompts as logged out even with cookies present', async () => {
    const page = createLoginPage({
      authState: { signedIn: false, signInVisible: true },
      cookieNames: ['SID'],
    });

    await expect(geminiActions.isLoggedIn(page as never)).resolves.toBe(false);
  });

  it('treats Google sign-in redirects as logged out', async () => {
    const page = createLoginPage({
      url: 'https://accounts.google.com/v3/signin/identifier',
      authState: { signedIn: true, signInVisible: false },
      cookieNames: ['SID'],
    });

    await expect(geminiActions.isLoggedIn(page as never)).resolves.toBe(false);
    expect(page.locator).not.toHaveBeenCalled();
  });
});
