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
    ...document.querySelectorAll('textarea, [contenteditable="true"][role="textbox"]'),
  ].filter(visible);
  const ed = candidates[0];
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
