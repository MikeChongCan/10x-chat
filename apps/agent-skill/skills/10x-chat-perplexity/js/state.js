() => {
  const visible = (el) => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden], [aria-hidden="true"]')) return false;
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const candidates = [
    ...document.querySelectorAll('div[role="textbox"][contenteditable="true"]'),
  ].filter(visible);
  const ed = candidates[0];
  const signedOut =
    /accounts\.google\.com|\/(?:login|auth\/login|sign-in)(?:[/?#]|$)/i.test(location.href) ||
    [...document.querySelectorAll('button, a, [role="button"], [class*="login-button"]')].some(
      (el) =>
        visible(el) &&
        /^(sign in|log in|sign up|continue with google)$/i.test(el.textContent.trim()),
    );
  const loggedIn = !!ed && !signedOut;
  const notices = [
    ...document.querySelectorAll(
      '[role="dialog"], [role="alert"], dialog, #challenge-running, #challenge-form, [class*="captcha"], iframe[title*="challenge" i], iframe[title*="captcha" i], #modal-no-auth-login, #modal-onboarding',
    ),
  ].filter(
    (el) =>
      visible(el) &&
      (el.tagName === 'IFRAME' || /\S/.test(el.textContent) || !!el.getAttribute('title')),
  );
  const notice =
    notices.find((el) =>
      /captcha|verify|human|two.factor|verification code|consent|cookies|limit|quota|upgrade|permission/i.test(
        `${el.textContent} ${el.getAttribute('title')} ${el.id}`,
      ),
    ) ?? notices[0];
  const blockedText = notice
    ? notice.textContent.trim() || notice.getAttribute('title') || notice.id || 'Action needed'
    : null;
  const blocked = !notice
    ? null
    : /captcha/i.test(blockedText)
      ? 'captcha'
      : /two.factor|verification code|2fa/i.test(blockedText)
        ? '2fa'
        : /verify|human|challenge/i.test(blockedText)
          ? 'verify'
          : /consent|cookies/i.test(blockedText)
            ? 'consent'
            : /quota|limit/i.test(blockedText)
              ? 'quota'
              : /upgrade/i.test(blockedText)
                ? 'upgrade'
                : 'other';
  const picker = [
    ...document.querySelectorAll('button[aria-label*="model" i], button[aria-label*="mode" i]'),
  ].find((el) => visible(el));
  const generating = [
    ...document.querySelectorAll(
      'button[aria-label*="Stop" i], button[aria-label*="Cancel" i], [data-is-streaming="true"], [aria-busy="true"], .image-generation-loading, .loading-indicator, .research-progress, model-response [class*="progress"]',
    ),
  ].some(visible);
  return {
    provider: 'perplexity',
    url: location.href,
    loggedIn,
    composer: !!ed,
    generating,
    model: picker ? picker.textContent.trim() || picker.getAttribute('aria-label') : null,
    blocked,
    blockedText,
  };
};
