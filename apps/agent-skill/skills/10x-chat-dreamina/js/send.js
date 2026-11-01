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
    ...document.querySelectorAll('.tiptap.ProseMirror[role="textbox"], [contenteditable="true"]'),
  ].filter(visible);
  const ed =
    candidates.find((el) =>
      /describe|prompt|video|mention/i.test(
        `${el.getAttribute('data-placeholder')} ${el.getAttribute('aria-placeholder')} ${el.querySelector('[data-placeholder]')?.getAttribute('data-placeholder')}`,
      ),
    ) ??
    candidates.find((el) => !/reference|upload/i.test(el.getAttribute('data-placeholder') ?? '')) ??
    candidates.at(-1);
  const button = [
    ...document.querySelectorAll(
      'button[class*="submit-button"], button.lv-btn-primary.lv-btn-shape-circle',
    ),
  ].find(
    (el) =>
      visible(el) &&
      !el.disabled &&
      el.getAttribute('aria-disabled') !== 'true' &&
      !el.classList.contains('lv-btn-disabled'),
  );
  if (!button) return { ok: false };
  window.__tenxRequest = {
    prompt: ed?.value ?? ed?.innerText ?? ed?.textContent ?? '',
    videos: [...document.querySelectorAll('video')].map(
      (v) => v.currentSrc || v.src || v.querySelector('source')?.src,
    ),
  };
  sessionStorage.setItem('10x-chat-dreamina-request', JSON.stringify(window.__tenxRequest));
  button.click();
  return { ok: true };
};
