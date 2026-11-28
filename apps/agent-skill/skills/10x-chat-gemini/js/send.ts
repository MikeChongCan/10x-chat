() => {
  const tenx = window as unknown as {
    __tenxRequest: { prompt: string; videos: (string | undefined)[] };
  };
  const visible = (el: Element): el is HTMLElement => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden], [aria-hidden="true"]')) return false;
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const candidates = [
    ...document.querySelectorAll('rich-textarea .ql-editor, .ql-editor[contenteditable="true"]'),
  ].filter(visible);
  const ed = candidates[0];
  const button = [
    ...document.querySelectorAll('button[aria-label*="Send" i], button.send-button'),
  ].find(
    (el) =>
      visible(el) &&
      !(el as HTMLButtonElement).disabled &&
      el.getAttribute('aria-disabled') !== 'true' &&
      !el.classList.contains('lv-btn-disabled'),
  );
  if (!button) return { ok: false };
  tenx.__tenxRequest = {
    prompt: (ed as HTMLTextAreaElement)?.value ?? ed?.textContent ?? '',
    videos: [...document.querySelectorAll('video')].map(
      (v) => v.currentSrc || v.src || v.querySelector('source')?.src,
    ),
  };
  (button as HTMLButtonElement).click();
  return { ok: true };
};
