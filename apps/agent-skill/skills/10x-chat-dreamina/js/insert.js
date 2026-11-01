({ text }) => {
  const visible = (el) => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden], [aria-hidden="true"]')) return false;
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const candidates = [
    ...document.querySelectorAll('.tiptap.ProseMirror[role="textbox"], [contenteditable="true"]'),
  ].filter(visible);
  const ed =
    candidates.find((el) =>
      /describe|prompt|video|mention/i.test(
        `${el.getAttribute('data-placeholder')} ${el.getAttribute('aria-placeholder')} ${el.querySelector('[data-placeholder]')?.getAttribute('data-placeholder')}`,
      ),
    ) ??
    candidates.find((el) => !/reference|upload/i.test(el.getAttribute('data-placeholder') ?? '')) ??
    candidates.at(-1);
  if (!ed || typeof text !== 'string') return { ok: false, len: 0 };
  ed.focus();
  if (ed instanceof HTMLTextAreaElement || ed instanceof HTMLInputElement) ed.select();
  else {
    const range = document.createRange();
    range.selectNodeContents(ed);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  document.execCommand('selectAll', false);
  const ok = document.execCommand('insertText', false, text);
  return { ok, len: (ed.value ?? ed.innerText ?? ed.textContent).length };
};
