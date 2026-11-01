() => {
  const request =
    window.__tenxRequest ??
    JSON.parse(sessionStorage.getItem('10x-chat-dreamina-request') ?? 'null');
  const videos = [...document.querySelectorAll('video')]
    .filter((video) => {
      const src = video.currentSrc || video.src || video.querySelector('source')?.src || '';
      if (!src || request?.videos.includes(src)) return false;
      if (/capcutstatic\.com/i.test(src) || !(/\/video\//.test(src) || src.startsWith('blob:')))
        return false;
      if (!request?.prompt) return false;
      let record = video.closest('[class*="responsive-video-grid"]');
      while (
        record?.parentElement &&
        record.parentElement.querySelectorAll('[class*="responsive-video-grid"]').length === 1
      )
        record = record.parentElement;
      if (!record) return false;
      const clone = record.cloneNode(true);
      for (const el of clone.querySelectorAll('[contenteditable], textarea, input')) el.remove();
      return clone.textContent
        .replace(/\s+/g, ' ')
        .includes(request.prompt.replace(/\s+/g, ' ').trim());
    })
    .map((video) => video.currentSrc || video.src || video.querySelector('source')?.src);
  return { count: videos.length, text: videos.join('\n'), images: [], links: [], videos };
};
