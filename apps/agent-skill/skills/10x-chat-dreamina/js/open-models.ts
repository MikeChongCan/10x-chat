() => {
  const visible = (el: Element): el is HTMLElement => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden], [aria-hidden="true"]')) return false;
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const button = [...document.querySelectorAll('[role="combobox"].lv-select')].find(
    (el) => visible(el) && /Seedance/i.test(el.textContent ?? ''),
  );
  if (!button) return { ok: false };
  (button as HTMLButtonElement).click();
  return { ok: true };
};
