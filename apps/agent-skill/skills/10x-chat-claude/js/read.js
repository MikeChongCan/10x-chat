() => {
  const visible = (el) => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden], [aria-hidden="true"]')) return false;
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const nodes = [
    ...document.querySelectorAll(
      '[data-testid="assistant-message"], .font-claude-message, .font-claude-response',
    ),
  ].filter(visible);
  const message = nodes.at(-1);
  const last =
    [...(message?.querySelectorAll('.standard-markdown, .progressive-markdown') ?? [])].at(-1) ??
    message;
  let text = (last?.innerText ?? last?.textContent ?? '').trim();
  text = text.replace(/^(?:(?:Thinking[^\n]*|Thought for[^\n]*|Pondering[^\n]*)\n)+/i, '').trim();
  return {
    count: nodes.length,
    text,
    images: [...(last?.querySelectorAll('img') ?? [])]
      .filter(
        (img) =>
          !(
            img.naturalWidth > 0 &&
            img.naturalWidth < 64 &&
            img.naturalHeight > 0 &&
            img.naturalHeight < 64
          ),
      )
      .map((img) => img.currentSrc || img.src)
      .filter(Boolean),
    links: [...(last?.querySelectorAll('a[href]') ?? [])].map((a) => a.href),
  };
};
