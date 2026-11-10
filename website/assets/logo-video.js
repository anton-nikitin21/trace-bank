(() => {
  const video = document.querySelector('.connection-story video');
  if (!video) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  const sync = () => {
    if (visible && !reduced.matches && !document.hidden && !document.body.classList.contains('motion-paused')) {
      video.play().catch(() => {});
    } else video.pause();
  };
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }).observe(video);
  new MutationObserver(sync).observe(document.body, {attributes: true, attributeFilter: ['class']});
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
})();
