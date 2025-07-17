// Auto-assign alternating left/right if not specified; then fade-in reveal.
// ALSO: click any .image img to open lightbox.
document.addEventListener('DOMContentLoaded', () => {
  // --- 交錯＆淡入 ---
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

  // --- Lightbox DOM ---
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="關閉圖片">&times;</button>
    <img alt="">
    <div class="lightbox-caption" role="note"></div>
  `;
  document.body.appendChild(overlay);

  const overlayImg = overlay.querySelector('img');
  const overlayCaption = overlay.querySelector('.lightbox-caption');
  const closeBtn = overlay.querySelector('.lightbox-close');

  function openLightbox(imgEl) {
    const fullSrc = imgEl.dataset.full || imgEl.src;
    overlayImg.src = fullSrc;
    overlayImg.alt = imgEl.alt || '';
    const section = imgEl.closest('section');
    const heading = section?.querySelector('h2')?.textContent?.trim();
    overlayCaption.textContent = heading || imgEl.alt || '';
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeLightbox() {
    overlay.classList.remove('open');
    overlayImg.src = '';
    overlayCaption.textContent = '';
    document.body.style.overflow = '';
  }

  // --- 修正：正確的事件委派 ---
  document.body.addEventListener('click', (e) => {
    const wrapper = e.target.closest('.image');
    if (!wrapper) return;
    const img = wrapper.querySelector('img');
    if (!img) return;
    e.preventDefault();
    openLightbox(img);
  });

  closeBtn.addEventListener('click', closeLightbox);

  // 點黑底關閉（避免點到圖就關掉）
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeLightbox();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      closeLightbox();
    }
  });
});
