() => {
  const tenx = window as unknown as {
    __tenxRequest: { prompt: string; videos: (string | undefined)[] };
  };
  const visible = (el: Element): el is HTMLElement => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden], [aria-hidden="true"], [inert]'))
      return false;
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const enabled = (el: Element) =>
    visible(el) &&
    !(el as HTMLButtonElement).disabled &&
    el.getAttribute('aria-disabled') !== 'true' &&
    !el.classList.contains('lv-btn-disabled');
  const findEditor = () =>
    [
      ...document.querySelectorAll(
        '#prompt-textarea, [data-testid="composer-input"], .ProseMirror[contenteditable="true"], textarea',
      ),
    ].filter(visible)[0];
  const composerOf = (ed: HTMLElement | undefined) =>
    ed?.closest('form, #composer, [data-testid="composer"], [data-testid*="composer"]') ??
    ed?.parentElement;
  // Exact selectors win in this order; a loose "Send" label only counts inside the composer,
  // so "Send feedback" elsewhere on the page is never clicked.
  const findButton = (ed: HTMLElement | undefined) => {
    for (const selector of [
      '#composer-submit-button',
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send"]',
    ]) {
      const hit = [...document.querySelectorAll(selector)].find(enabled);
      if (hit) return hit;
    }
    return [...(composerOf(ed)?.querySelectorAll('button[aria-label*="Send" i]') ?? [])].find(
      enabled,
    );
  };
  // Only the model / Power menu hides the send button; dialogs (research plan, upload) are left alone.
  const openMenu = () =>
    [...document.querySelectorAll('[role="menu"]')].find(
      (el) => el instanceof HTMLElement && getComputedStyle(el).display !== 'none',
    );

  let ed = findEditor();
  let button = findButton(ed);
  let menuOpen = false;
  if (!button) {
    menuOpen = !!openMenu();
    // Close the menu; if the button does not come back at once, click nothing and let the caller run send again.
    if (menuOpen)
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
    ed = findEditor();
    button = findButton(ed);
  }
  if (!button) {
    const editorText = ed ? ((ed as HTMLTextAreaElement).value ?? ed.textContent ?? '') : '';
    const buttons = [...(composerOf(ed)?.querySelectorAll('button') ?? [])]
      .filter(visible)
      .map((el) => el.getAttribute('aria-label') ?? '')
      .filter(Boolean)
      .slice(0, 10);
    return {
      ok: false,
      reason: 'no-send-button',
      menuOpen,
      editorLen: editorText.length,
      buttons,
    };
  }
  const editorText = ed ? ((ed as HTMLTextAreaElement).value ?? ed.textContent ?? '') : '';
  tenx.__tenxRequest = {
    prompt: editorText,
    videos: [...document.querySelectorAll('video')].map(
      (v) => v.currentSrc || v.src || v.querySelector('source')?.src,
    ),
  };
  (button as HTMLButtonElement).click();
  return { ok: true };
};
