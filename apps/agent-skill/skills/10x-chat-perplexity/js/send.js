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
  const button = [...document.querySelectorAll('button[aria-label="Submit"]')].find(
    (el) =>
      visible(el) &&
      !el.disabled &&
      el.getAttribute('aria-disabled') !== 'true' &&
      !el.classList.contains('lv-btn-disabled'),
  );
  if (!button) return { ok: false };
  window.__tenxRequest = {
    prompt: ed?.value ?? ed?.textContent ?? '',
    videos: [...document.querySelectorAll('video')].map(
      (v) => v.currentSrc || v.src || v.querySelector('source')?.src,
    ),
  };
  button.click();
  return { ok: true };
};
