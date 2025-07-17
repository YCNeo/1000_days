/* =========================================================
   GLOBALS / CONTENT LOADING
   ========================================================= */
let CONTENT = null;  // loaded JSON
let LOCK_DURATION_MS = 15 * 60 * 1000; // fallback default

async function loadContent() {
  try {
    // cache-bust; GitHub Pages 有時會 cache
    const res = await fetch('content.json?cb=' + Date.now(), { cache: 'no-store' });
    CONTENT = await res.json();
    const min = parseInt(CONTENT?.meta?.lock_duration_minutes, 10);
    if (!isNaN(min) && min > 0) LOCK_DURATION_MS = min * 60 * 1000;
  } catch (err) {
    console.error('載入 content.json 失敗：', err);
    CONTENT = { sections: [] };
  }
}

/* =========================================================
   BUILD SECTIONS FROM CONTENT
   ========================================================= */
function buildSectionsFromContent() {
  const root = document.querySelector('#sections-root') || document.querySelector('main');
  if (!root) return;
  root.innerHTML = '';
  const secs = CONTENT?.sections || [];
  secs.forEach((sec) => {
    const el = document.createElement('section');
    el.className = 'block';   // no text-left/right yet; handled later
    el.id = sec.id;

    const textDiv = document.createElement('div');
    textDiv.className = 'text';

    const h2 = document.createElement('h2');
    h2.textContent = sec.title || '';
    textDiv.appendChild(h2);

    (sec.paragraphs || []).forEach(pTxt => {
      const p = document.createElement('p');
      p.textContent = pTxt;
      textDiv.appendChild(p);
    });

    const imgDiv = document.createElement('div');
    imgDiv.className = 'image';
    const img = document.createElement('img');
    const thumb = sec?.image?.thumb || sec?.image?.full || '';
    const full = sec?.image?.full || thumb;
    img.src = thumb;
    img.setAttribute('data-full', full);
    img.alt = sec?.image?.alt || '';
    img.loading = 'lazy';
    imgDiv.appendChild(img);

    el.appendChild(textDiv);
    el.appendChild(imgDiv);

    root.appendChild(el);
  });
}

/* =========================================================
   THEME TOGGLE (Light + 3 dark variants)
   ========================================================= */
const THEME_KEY = 'theme-v3';
const THEMES = ['light', 'nightpink', 'starry', 'candle'];
function applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme); }
function saveTheme(theme) { try { localStorage.setItem(THEME_KEY, theme); } catch (_) { } }
function getSavedTheme() { try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; } }
function detectSystemTheme() { return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'nightpink' : 'light'; }
function iconFor(theme) { return { light: '☀️', nightpink: '🌙', starry: '🌌', candle: '🕯️' }[theme] || '🌙'; }
function nextTheme(curr) { const i = THEMES.indexOf(curr); return THEMES[(i + 1) % THEMES.length]; }
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
    const nxt = nextTheme(curr);
    applyTheme(nxt); saveTheme(nxt); btn.textContent = iconFor(nxt);
  });
  document.body.appendChild(btn);
  if (!saved && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', e => {
      const sys = e.matches ? 'nightpink' : 'light';
      applyTheme(sys); btn.textContent = iconFor(sys);
    });
  }
}

/* =========================================================
   QUIZ LOCK (per-section, TTL)
   ========================================================= */
function buildQuizDataFromContent() {
  const out = {};
  (CONTENT?.sections || []).forEach(sec => {
    if (sec.quiz) {
      out[sec.id] = {
        q: sec.quiz.question,
        opts: sec.quiz.options,
        ans: sec.quiz.answer_index
      };
    }
  });
  return out;
}
const QUIZ_DATA = {}; // populated at init from content
const lsKey = (id) => `quizUnlock:${id}`;
function isUnlocked(id) {
  try {
    const ts = parseInt(localStorage.getItem(lsKey(id)), 10);
    if (isNaN(ts)) return false;
    if (Date.now() - ts > LOCK_DURATION_MS) { localStorage.removeItem(lsKey(id)); return false; }
    return true;
  } catch (_) { return false; }
}
function refreshUnlock(id) {
  try { localStorage.setItem(lsKey(id), String(Date.now())); } catch (_) { }
}
function lockSection(section) {
  section.classList.add('locked');
  section.classList.remove('unlocked');
  section.setAttribute('aria-locked', 'true');
}
function unlockSection(section) {
  section.classList.remove('locked');
  section.classList.add('unlocked');
  section.removeAttribute('aria-locked');
}
/* quiz UI (singleton) */
function buildQuizUI() {
  const overlay = document.createElement('div');
  overlay.className = 'quiz-overlay';
  overlay.innerHTML = `
    <div class="quiz-card" role="dialog" aria-modal="true">
      <h3 id="quiz-q"></h3>
      <div class="quiz-options" id="quiz-opts"></div>
      <div class="quiz-msg" id="quiz-msg"></div>
      <button class="quiz-cancel" type="button">取消</button>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}
function initQuizLock() {
  Object.assign(QUIZ_DATA, buildQuizDataFromContent());
  const sections = Array.from(document.querySelectorAll('main .block[id]'));
  const overlay = buildQuizUI();
  const qEl = overlay.querySelector('#quiz-q');
  const optsWrap = overlay.querySelector('#quiz-opts');
  const msgEl = overlay.querySelector('#quiz-msg');
  const cancelBtn = overlay.querySelector('.quiz-cancel');

  let currentId = null;
  let currentSection = null;

  // 初始
  sections.forEach(sec => {
    const id = sec.id;
    const hasQuiz = !!QUIZ_DATA[id];
    const shouldLock = (CONTENT?.sections?.find(s => s.id === id)?.locked ?? hasQuiz);
    if (shouldLock && !isUnlocked(id)) {
      lockSection(sec);
    } else {
      unlockSection(sec);
      if (shouldLock) refreshUnlock(id); // refresh TTL
    }
    // 捕獲階段監聽，避免傳到 Lightbox
    sec.addEventListener('click', (e) => {
      if (!sec.classList.contains('locked')) return;
      e.preventDefault();
      e.stopPropagation();
      openQuiz(sec);
    }, true);
  });

  function openQuiz(section) {
    const id = section.id;
    const data = QUIZ_DATA[id];
    if (!data) {
      unlockSection(section);
      refreshUnlock(id);
      return;
    }
    currentId = id;
    currentSection = section;
    qEl.textContent = data.q;
    optsWrap.innerHTML = '';
    msgEl.textContent = '';
    data.opts.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t;
      b.addEventListener('click', () => submitAnswer(i));
      optsWrap.appendChild(b);
    });
    overlay.classList.add('open');
    document.body.classList.add('quiz-open');
    cancelBtn.focus();
  }
  function closeQuiz() {
    overlay.classList.remove('open');
    document.body.classList.remove('quiz-open');
    currentId = null;
    currentSection = null;
  }
  function submitAnswer(i) {
    if (currentId == null) return;
    const data = QUIZ_DATA[currentId];
    const btns = optsWrap.querySelectorAll('button');
    btns.forEach(b => { b.disabled = true; });
    if (i === data.ans) {
      msgEl.textContent = '答對啦！解鎖中...';
      btns[i].classList.add('correct');
      unlockSection(currentSection);
      refreshUnlock(currentId);
      setTimeout(closeQuiz, 800);
    } else {
      msgEl.textContent = '答錯了，再想想～';
      btns[i].classList.add('wrong');
      setTimeout(() => {
        btns.forEach((b, idx) => {
          b.disabled = false;
          if (idx !== i) b.classList.remove('wrong', 'correct');
        });
        msgEl.textContent = '';
      }, 800);
    }
  }
  cancelBtn.addEventListener('click', closeQuiz);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeQuiz(); });

  // 使用者互動刷新 TTL（已解鎖章節）
  ['click', 'scroll', 'keydown', 'touchstart', 'visibilitychange', 'focus'].forEach(ev => {
    window.addEventListener(ev, () => {
      sections.forEach(sec => {
        if (sec.classList.contains('unlocked') && QUIZ_DATA[sec.id]) refreshUnlock(sec.id);
      });
    }, { passive: true });
  });
}

/* =========================================================
   LIGHTBOX (respects lock)
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
  const closeBtn = overlay.querySelector('button.lightbox-close');

  function openLightbox(imgEl) {
    const sec = imgEl.closest('section');
    if (sec && sec.classList.contains('locked')) return; // 鎖住不開
    const fullSrc = imgEl.dataset.full || imgEl.src;
    overlayImg.src = fullSrc;
    overlayImg.alt = imgEl.alt || '';
    const heading = sec?.querySelector('h2')?.textContent?.trim();
    overlayCaption.textContent = heading || imgEl.alt || '';
    overlay.classList.add('open');
    document.body.classList.add('lightbox-open');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }
  function closeLightbox() {
    overlay.classList.remove('open');
    overlayImg.src = '';
    overlayCaption.textContent = '';
    document.body.classList.remove('lightbox-open');
    document.body.style.overflow = '';
  }

  // Delegation after build
  document.body.addEventListener('click', (e) => {
    const wrapper = e.target.closest('.image');
    if (!wrapper) return;
    const img = wrapper.querySelector('img');
    if (!img) return;
    e.preventDefault();
    openLightbox(img);
  });

  closeBtn.addEventListener('click', closeLightbox);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLightbox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('open')) closeLightbox(); });
}

/* =========================================================
   DESKTOP ALTERNATING LAYOUT + SCROLL REVEAL
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
   MAIN INIT
   ========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  await loadContent();
  buildSectionsFromContent();
  initThemeToggle();
  initBlocks();
  initLightbox();
  initQuizLock();
});
