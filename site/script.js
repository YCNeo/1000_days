// Auto-assign alternating left/right if not specified; then fade-in reveal.
// ALSO: click any .image img to open lightbox.
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

  // ---- Lightbox ----
  // Create overlay DOM once
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
    // Use data-full if provided; else src
    const fullSrc = imgEl.dataset.full || imgEl.src;
    overlayImg.src = fullSrc;
    overlayImg.alt = imgEl.alt || '';
    // Caption: prefer section h2 text; fallback alt
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

  // Click image → open
  document.body.addEventListener('click', (e) => {
    const img = e.target.closest('.image img');
    if (img) {
      e.preventDefault();
      openLightbox(img);
    }
  });

  // Close button
  closeBtn.addEventListener('click', closeLightbox);

  // Click backdrop (but ignore clicks on img or close button)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeLightbox();
    }
  });

  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      closeLightbox();
    }
  });
});
