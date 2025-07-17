// Theme utils ----------------------------------------------------
const THEME_KEY = 'theme-v1';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function saveTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch (_) { }
}

function getSavedTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; }
}

function detectSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light';
}

function initThemeToggle() {
  const saved = getSavedTheme();
  const initial = saved || detectSystemTheme();
  applyTheme(initial);

  // create button
  const btn = document.createElement('button');
  btn.id = 'theme-toggle';
  btn.className = 'theme-toggle';
  btn.type = 'button';
  btn.setAttribute('aria-label', '切換深淺模式 (Dark / Light)');
  const updateIcon = (t) => { btn.textContent = t === 'dark' ? '☀️' : '🌙'; };
  updateIcon(initial);

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    saveTheme(next);
    updateIcon(next);
  });

  document.body.appendChild(btn);

  // Update icon if system changes *and* user never manually saved
  if (!saved && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const sys = e.matches ? 'dark' : 'light';
      applyTheme(sys);
      updateIcon(sys);
    });
  }
}

// Lightbox utils ----------------------------------------------------
function initLightbox() {
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
    document.body.classList.add('lightbox-open');   // ✅ hide theme toggle
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeLightbox() {
    overlay.classList.remove('open');
    overlayImg.src = '';
    overlayCaption.textContent = '';
    document.body.classList.remove('lightbox-open'); // ✅ restore theme toggle
    document.body.style.overflow = '';
  }

  // mobile-safe click delegation
  document.body.addEventListener('click', (e) => {
    const wrapper = e.target.closest('.image');
    if (!wrapper) return;
    const img = wrapper.querySelector('img');
    if (!img) return;
    e.preventDefault();
    openLightbox(img);
  });

  closeBtn.addEventListener('click', closeLightbox);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeLightbox();
  });
}

// Desktop alt layout & reveal ---------------------------------------
function initBlocks() {
  const blocks = Array.from(document.querySelectorAll('main .block'));
  if (!blocks.length) return;

  blocks.forEach((el, i) => {
    if (!el.classList.contains('text-left') && !el.classList.contains('text-right')) {
      el.classList.add(i % 2 === 0 ? 'text-left' : 'text-right'); // desktop alt
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
}

// DOM ready ---------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initBlocks();
  initLightbox();
});
