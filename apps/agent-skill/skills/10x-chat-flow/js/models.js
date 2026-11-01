() => {
  const visible = (el) => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden], [aria-hidden="true"]')) return false;
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  return [...document.querySelectorAll('[role="menuitem"], [role="option"]')]
    .filter(visible)
    .map(
      (el) =>
        `${el.querySelector('.label')?.textContent?.trim() ?? el.textContent.trim()}${el.matches('[disabled], [aria-disabled="true"], .lv-select-option-wrapper-disabled') || el.closest('.lv-select-option-wrapper-disabled') ? ' [locked]' : ''}`,
    );
};
