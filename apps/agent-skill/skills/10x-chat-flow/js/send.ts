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
        !(el as HTMLButtonElement).disabled &&
        el.getAttribute('aria-disabled') !== 'true' &&
        !el.classList.contains('lv-btn-disabled'),
    ) ??
    [...document.querySelectorAll('button')].find(
      (el) =>
        visible(el) &&
        !(el as HTMLButtonElement).disabled &&
        /^(arrow_forward|make clip|generate|create)$/i.test((el.textContent ?? '').trim()),
    );
  if (!button) return { ok: false };
  tenx.__tenxRequest = {
    prompt: (ed as HTMLTextAreaElement)?.value ?? ed?.innerText ?? ed?.textContent ?? '',
    videos: [...document.querySelectorAll('video')].map(
      (v) => v.currentSrc || v.src || v.querySelector('source')?.src,
    ),
  };
  sessionStorage.setItem('10x-chat-flow-request', JSON.stringify(tenx.__tenxRequest));
  (button as HTMLButtonElement).click();
  return { ok: true };
};
