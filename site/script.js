// Auto-assign alternating left/right if not specified; then fade-in reveal.
document.addEventListener('DOMContentLoaded', () => {
  const blocks = Array.from(document.querySelectorAll('main .block'));
  blocks.forEach((el, i) => {
    if (!el.classList.contains('text-left') && !el.classList.contains('text-right')) {
      el.classList.add(i % 2 === 0 ? 'text-left' : 'text-right');
    }
    el.classList.add('reveal');
  });

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('reveal-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.2 });

  blocks.forEach(el => io.observe(el));
});
