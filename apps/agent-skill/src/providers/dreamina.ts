import type { Page } from 'playwright';
import type { CapturedResponse, ProviderActions, ProviderConfig } from '../types.js';

/**
 * Dreamina — ByteDance / CapCut's AI creation studio (https://dreamina.capcut.com).
 *
 * This provider currently implements the **login + auth-check** flow. Video
 * generation (prompt submission, model/aspect/duration selection, polling and
 * download) is wired in a follow-up; {@link dreaminaActions.submitPrompt} and
 * {@link dreaminaActions.captureResponse} intentionally throw until then.
 *
 * Auth detection notes (verified against the live site, May 2026):
 * - The studio renders for signed-out visitors too, so a visible composer is
 *   NOT evidence of being logged in.
 * - The reliable signed-out signal is the sidebar "Sign in" affordance
 *   (`div[class*="login-button"]`).
 * - Signed-in evidence: an account avatar, or a numeric credit balance in the
 *   sidebar credit menu (`#SiderMenuCredit`), which is empty when logged out.
 * - CSS-module class suffixes are content-hashed (e.g. `login-button-cgKP_u`)
 *   and change between builds, so we match on stable class *prefixes* and the
 *   Arco Design component classes (`lv-*`), never the full hashed class.
 */
export const DREAMINA_CONFIG: ProviderConfig = {
  name: 'dreamina',
  displayName: 'Dreamina',
  url: 'https://dreamina.capcut.com/ai-tool/home?type=video',
  loginUrl: 'https://dreamina.capcut.com/ai-tool/home?type=video',
  models: ['Seedance 2.0', 'Seedance 2.0 Fast'],
  defaultModel: 'Seedance 2.0 Fast',
  defaultTimeoutMs: 10 * 60 * 1000, // 10 mins — video gen is slow
};

export const DREAMINA_SELECTORS = {
  /** Signed-out indicator: sidebar "Sign in" button (CSS-module class prefix). */
  loginButton: '[class*="login-button"]',
  /** Prompt composer — Tiptap/ProseMirror rich-text input. */
  composer: '.tiptap.ProseMirror[role="textbox"]',
  /** Generate/submit button (disabled until a prompt is entered). */
  submitButton: 'button[class*="submit-button"]',
  /** Sidebar credit balance — stable id; empty text when signed out. */
  creditDisplay: '#SiderMenuCredit',
} as const;

/**
 * CapCut / ByteDance passport session cookies set on `.capcut.com` once signed
 * in. Presence of any of these is treated as proof of an authenticated session.
 * (`ttwid`, `msToken`, `_tea_web_id` are anti-bot/analytics, NOT auth, and are
 * present even when signed out, so they are deliberately excluded.)
 */
const DREAMINA_AUTH_COOKIES = new Set<string>([
  'sessionid',
  'sessionid_ss',
  'sid_guard',
  'sid_tt',
  'uid_tt',
  'uid_tt_ss',
  'sid_ucp_v1',
  'ssid_ucp_v1',
  'passport_auth_status',
]);

/** URLs Dreamina/CapCut redirects to when authentication is required. */
const LOGIN_URL_RE =
  /(?:passport|accounts?|login|signin)\.(?:capcut|byteoversea|tiktok|bytedance)\.com|\/(?:login|sign[-_]?in)(?:[/?#]|$)/i;

export const dreaminaActions: ProviderActions = {
  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      // A redirect to a login/passport page means we're not authenticated.
      if (LOGIN_URL_RE.test(page.url())) return false;

      // Settle the SPA. The signed-out studio reliably renders the sidebar
      // "Sign in" button, so waiting for it resolves fast when logged out and
      // avoids sampling the brief load window where it has not rendered yet
      // (during which guest feed thumbnails would otherwise look like avatars).
      await page
        .locator(DREAMINA_SELECTORS.loginButton)
        .first()
        .waitFor({ state: 'visible', timeout: 12_000 })
        .catch(() => {});

      const hasAuthCookies = await page
        .context()
        .cookies(['https://dreamina.capcut.com', 'https://www.capcut.com', 'https://capcut.com'])
        .then((cookies) => cookies.some((cookie) => DREAMINA_AUTH_COOKIES.has(cookie.name)))
        .catch(() => false);

      const dom = await page.evaluate(
        ({ loginButtonSel, creditSel }) => {
          const visible = (el: Element | null): el is HTMLElement => {
            if (!(el instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(el);
            return (
              el.offsetWidth > 0 &&
              el.offsetHeight > 0 &&
              style.visibility !== 'hidden' &&
              style.display !== 'none'
            );
          };
          const norm = (value: string | null | undefined) =>
            (value ?? '').replace(/\s+/g, ' ').trim();

          // Signed-out: a visible "Sign in / Log in / Sign up" affordance.
          const loginButtonVisible = Array.from(document.querySelectorAll(loginButtonSel)).some(
            visible,
          );
          const signInTextRe = /^(?:sign in|log ?in|sign up|登录|登入|注册)$/i;
          const textAffordance = Array.from(
            document.querySelectorAll('button, a, [role="button"]'),
          ).some((el) => visible(el) && signInTextRe.test(norm(el.textContent)));
          const signInVisible = loginButtonVisible || textAffordance;

          // Signed-in: the sidebar credit menu shows a numeric balance (it is
          // empty when signed out). Avatar-class elements are intentionally NOT
          // used — the guest feed renders several `[class*="avatar"]` thumbnails.
          const creditEl = document.querySelector(creditSel);
          const hasCreditBalance = !!creditEl && /\d/.test(norm(creditEl.textContent));

          return { signInVisible, hasCreditBalance };
        },
        {
          loginButtonSel: DREAMINA_SELECTORS.loginButton,
          creditSel: DREAMINA_SELECTORS.creditDisplay,
        },
      );

      // A visible sign-in affordance is authoritative — the guest studio shows it.
      if (dom.signInVisible) return false;
      // Require positive proof of a session: a CapCut passport cookie or a
      // rendered credit balance. Absence of the login button alone is NOT
      // enough — it is also briefly absent during initial page load.
      return hasAuthCookies || dom.hasCreditBalance;
    } catch {
      return false;
    }
  },

  async submitPrompt(_page: Page, _prompt: string): Promise<void> {
    throw new Error(
      'Dreamina video generation is not yet implemented. Login and auth-check are supported; ' +
        'prompt submission + generation are coming in a follow-up.',
    );
  },

  async captureResponse(
    _page: Page,
    _opts: { timeoutMs: number; onChunk?: (chunk: string) => void },
  ): Promise<CapturedResponse> {
    throw new Error(
      'Dreamina video generation is not yet implemented. Login and auth-check are supported; ' +
        'response capture is coming in a follow-up.',
    );
  },
};
