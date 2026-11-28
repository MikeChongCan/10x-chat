() => {
  const visible = (el: Element): el is HTMLElement => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden], [aria-hidden="true"]')) return false;
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const button = [
    ...document.querySelectorAll(
      'button[aria-label*="picker" i], button[data-test-id="bard-mode-menu-button"]',
    ),
  ].find((el) => visible(el));
  if (!button) return { ok: false };
  (button as HTMLButtonElement).click();
  return { ok: true };
};
