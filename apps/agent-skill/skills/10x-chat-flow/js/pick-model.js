({ name }) => {
  const visible = (el) => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden], [aria-hidden="true"]')) return false;
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const key = (text) =>
    text
      .toLowerCase()
      .replace(/\b(?:gemini|gpt)\b/g, '')
      .replace(/\d+(?:\.\d+)*/g, '')
      .replace(/[^a-z]+/g, ' ')
      .trim();
  const items = [...document.querySelectorAll('[role="menuitem"], [role="option"]')].filter(
    visible,
  );
  const item =
    items.find(
      (el) =>
        (el.querySelector('.label')?.textContent ?? el.textContent).trim().toLowerCase() ===
        name.trim().toLowerCase(),
    ) ??
    items.find(
      (el) => key(el.querySelector('.label')?.textContent ?? el.textContent) === key(name),
    );
  if (
    !item ||
    item.matches('[disabled], [aria-disabled="true"], .lv-select-option-wrapper-disabled') ||
    item.closest('.lv-select-option-wrapper-disabled') ||
    /locked|upgrade/i.test(item.textContent)
  )
    return { ok: false, picked: null };
  item.click();
  return {
    ok: true,
    picked: (item.querySelector('.label')?.textContent ?? item.textContent).trim(),
  };
};
