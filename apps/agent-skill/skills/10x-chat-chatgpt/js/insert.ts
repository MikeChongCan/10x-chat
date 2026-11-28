({ text }: { text: string }) => {
  const visible = (el: Element): el is HTMLElement => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden], [aria-hidden="true"]')) return false;
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const candidates = [
    ...document.querySelectorAll(
      '#prompt-textarea, [data-testid="composer-input"], .ProseMirror[contenteditable="true"], textarea',
    ),
  ].filter(visible);
  const ed = candidates[0];
  if (!ed || typeof text !== 'string') return { ok: false, len: 0 };
  ed.focus();
  if (ed instanceof HTMLTextAreaElement || ed instanceof HTMLInputElement) ed.select();
  else {
    const range = document.createRange();
    range.selectNodeContents(ed);
    const selection = getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
  }
  document.execCommand('selectAll', false);
  const ok = document.execCommand('insertText', false, text);
  return {
    ok,
    len: ((ed as HTMLTextAreaElement).value ?? ed.innerText ?? ed.textContent ?? '').length,
  };
};
