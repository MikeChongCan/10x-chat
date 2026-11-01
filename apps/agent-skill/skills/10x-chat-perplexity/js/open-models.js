() => {
  const visible = (el) => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden], [aria-hidden="true"]')) return false;
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const button = [
    ...document.querySelectorAll('button[aria-label*="model" i], button[aria-label*="mode" i]'),
  ].find((el) => visible(el));
  if (!button) return { ok: false };
  button.click();
  return { ok: true };
};
