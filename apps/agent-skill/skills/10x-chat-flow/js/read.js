() => {
  const request =
    window.__tenxRequest ?? JSON.parse(sessionStorage.getItem('10x-chat-flow-request') ?? 'null');
  const videos = [...document.querySelectorAll('video')]
    .filter((video) => {
      const src = video.currentSrc || video.src || video.querySelector('source')?.src || '';
      if (!src || request?.videos.includes(src)) return false;
      return true;
    })
    .map((video) => video.currentSrc || video.src || video.querySelector('source')?.src);
  return { count: videos.length, text: videos.join('\n'), images: [], links: [], videos };
};
