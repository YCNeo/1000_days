/* =========================================================
   Multi-theme toggle (Light + 3 Dark variants)
   - Cycle: light → nightpink → starry → candle → light ...
   - Saves in localStorage (THEME_KEY)
   - Default: system dark? nightpink : light
   ========================================================= */
const THEME_KEY = 'theme-v3';
const THEMES = ['light', 'nightpink', 'starry', 'candle'];

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
    ? 'nightpink'  // 若系統深色，給使用者最柔和的深色預設
    : 'light';
}
function iconFor(theme) {
  switch (theme) {
    case 'light': return '☀️';
    case 'nightpink': return '🌙';
    case 'starry': return '🌌';
    case 'candle': return '🕯️';
    default: return '🌙';
  }
}
function nextTheme(curr) {
  const idx = THEMES.indexOf(curr);
  return THEMES[(idx + 1) % THEMES.length];
}
function initThemeToggle() {
  const saved = getSavedTheme();
  const initial = (saved && THEMES.includes(saved)) ? saved : detectSystemTheme();
  applyTheme(initial);

  const btn = document.createElement('button');
  btn.id = 'theme-toggle';
  btn.className = 'theme-toggle';
  btn.type = 'button';
  btn.setAttribute('aria-label', '切換主題');
  btn.textContent = iconFor(initial);

  btn.addEventListener('click', () => {
    const curr = document.documentElement.getAttribute('data-theme') || initial;
    const next = nextTheme(curr);
    applyTheme(next);
    saveTheme(next);
    btn.textContent = iconFor(next);
  });

  document.body.appendChild(btn);

  // 如需同步系統深/淺（僅在未手動選時）
  if (!saved && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', (e) => {
      const sys = e.matches ? 'nightpink' : 'light';
      applyTheme(sys);
      btn.textContent = iconFor(sys);
    });
  }
}

/* =========================================================
   Lightbox (mobile safe)
   ========================================================= */
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
    document.body.classList.add('lightbox-open');   // hide theme toggle
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeLightbox() {
    overlay.classList.remove('open');
    overlayImg.src = '';
    overlayCaption.textContent = '';
    document.body.classList.remove('lightbox-open'); // show theme toggle
    document.body.style.overflow = '';
  }

  // click delegation
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

/* =========================================================
   Desktop alt layout & reveal
   ========================================================= */
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

/* =========================================================
   DOM ready
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initBlocks();
  initLightbox();
});
