() => {
  const visible = (el) => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden], [aria-hidden="true"]')) return false;
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const candidates = [...document.querySelectorAll('div[contenteditable="true"], textarea')].filter(
    visible,
  );
  const ed = candidates[0];
  const button =
    [
      ...document.querySelectorAll(
        'button[aria-label*="Generate" i], button[aria-label*="Make clip" i]',
      ),
    ].find(
      (el) =>
        visible(el) &&
        !el.disabled &&
        el.getAttribute('aria-disabled') !== 'true' &&
        !el.classList.contains('lv-btn-disabled'),
    ) ??
    [...document.querySelectorAll('button')].find(
      (el) =>
        visible(el) &&
        !el.disabled &&
        /^(arrow_forward|make clip|generate|create)$/i.test(el.textContent.trim()),
    );
  if (!button) return { ok: false };
  window.__tenxRequest = {
    prompt: ed?.value ?? ed?.innerText ?? ed?.textContent ?? '',
    videos: [...document.querySelectorAll('video')].map(
      (v) => v.currentSrc || v.src || v.querySelector('source')?.src,
    ),
  };
  sessionStorage.setItem('10x-chat-flow-request', JSON.stringify(window.__tenxRequest));
  button.click();
  return { ok: true };
};
