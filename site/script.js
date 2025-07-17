/* =========================================================
   1000 DAYS SITE SCRIPT (No-Music Edition v4)
   ========================================================= */

/* ----- CONFIG ----- */
const THEMES = ['light', 'nightpink', 'starry', 'candle'];
const THEME_KEY = 'theme-v3';        // same key so saved theme persists
let LOCK_DURATION_MS = 15 * 60 * 1000; // fallback; overridden by content.json

/* ----- RUNTIME STATE ----- */
let CONTENT = null;
const QUIZ_DATA = {};
let quizOverlay = null, qEl, optsWrap, msgEl, cancelBtn, retakeBtn;
let currentId = null, currentSection = null;

/* =========================================================
   THEME UTIL
   ========================================================= */
function detectSystemTheme() {
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ? 'nightpink' : 'light';
}
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || detectSystemTheme();
}
function saveTheme(t) { try { localStorage.setItem(THEME_KEY, t); } catch (_) { } }
function getSavedTheme() { try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; } }

/* =========================================================
   CONTENT LOAD + BUILD
   ========================================================= */
async function loadContent() {
  try {
    const res = await fetch('content.json?cb=' + Date.now(), { cache: 'no-store' });
    CONTENT = await res.json();
    const min = parseInt(CONTENT?.meta?.lock_duration_minutes, 10);
    if (!isNaN(min) && min > 0) LOCK_DURATION_MS = min * 60 * 1000;
  } catch (err) {
    console.error('載入 content.json 失敗：', err);
    CONTENT = { sections: [] };
  }
}

function buildSectionsFromContent() {
  const root = document.querySelector('#sections-root') || document.querySelector('main');
  if (!root) return;
  root.innerHTML = '';
  const secs = CONTENT?.sections || [];
  secs.forEach((sec) => {
    const el = document.createElement('section');
    el.className = 'block';
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

    // review button (hidden while locked)
    const reviewBtn = document.createElement('button');
    reviewBtn.type = 'button';
    reviewBtn.className = 'quiz-review-btn';
    reviewBtn.title = '查看題目 / 再答一次';
    reviewBtn.textContent = '?';
    reviewBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      openQuiz(el, /*review*/true);
    });
    el.appendChild(reviewBtn);

    root.appendChild(el);
  });
}

/* =========================================================
   THEME TOGGLE (no music)
   ========================================================= */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
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
  btn.textContent = '•'; // hidden via CSS
  btn.addEventListener('click', () => {
    const curr = currentTheme();
    const nxt = THEMES[(THEMES.indexOf(curr) + 1) % THEMES.length];
    applyTheme(nxt); saveTheme(nxt);
  });
  document.body.appendChild(btn);

  if (!saved && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', e => {
      const sys = e.matches ? 'nightpink' : 'light';
      applyTheme(sys); saveTheme(sys);
    });
  }
}

/* =========================================================
   QUIZ LOCK (with review)
   ========================================================= */
const lsKey = (id) => `quizUnlock:${id}`;
const lsAnsKey = (id) => `quizAns:${id}`;

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
function saveAnswer(id, choiceIdx) {
  try { localStorage.setItem(lsAnsKey(id), JSON.stringify({ choice: choiceIdx, ts: Date.now() })); } catch (_) { }
}
function getAnswer(id) {
  try {
    const raw = localStorage.getItem(lsAnsKey(id));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return (typeof obj.choice === 'number') ? obj.choice : null;
  } catch (_) { return null; }
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

function buildQuizUI() {
  quizOverlay = document.createElement('div');
  quizOverlay.className = 'quiz-overlay';
  quizOverlay.innerHTML = `
    <div class="quiz-card" role="dialog" aria-modal="true">
      <h3 id="quiz-q"></h3>
      <div class="quiz-options" id="quiz-opts"></div>
      <div class="quiz-msg" id="quiz-msg"></div>
      <button class="quiz-cancel" type="button">取消</button>
      <button class="quiz-retake" type="button" style="display:none;">重新答題</button>
    </div>`;
  document.body.appendChild(quizOverlay);
  qEl = quizOverlay.querySelector('#quiz-q');
  optsWrap = quizOverlay.querySelector('#quiz-opts');
  msgEl = quizOverlay.querySelector('#quiz-msg');
  cancelBtn = quizOverlay.querySelector('.quiz-cancel');
  retakeBtn = quizOverlay.querySelector('.quiz-retake');

  cancelBtn.addEventListener('click', closeQuiz);
  retakeBtn.addEventListener('click', () => { if (currentId) openQuiz(currentSection, false, true); });
  quizOverlay.addEventListener('click', (e) => { if (e.target === quizOverlay) closeQuiz(); });
}

function openQuiz(section, review = false, forceRetake = false) {
  const id = section.id;
  const data = QUIZ_DATA[id];
  if (!data) {
    unlockSection(section); refreshUnlock(id);
    return;
  }
  currentId = id; currentSection = section;
  qEl.textContent = data.q;
  optsWrap.innerHTML = '';
  msgEl.textContent = '';
  retakeBtn.style.display = 'none';

  const prevChoice = getAnswer(id);
  const showReview = (review && prevChoice != null && !forceRetake);

  data.opts.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    if (showReview) {
      b.disabled = true;
      if (i === data.ans) b.classList.add('correct');
      if (i === prevChoice && i !== data.ans) b.classList.add('wrong');
    } else {
      b.addEventListener('click', () => submitAnswer(i));
    }
    optsWrap.appendChild(b);
  });

  if (showReview) {
    msgEl.textContent = (prevChoice === data.ans)
      ? '妳剛剛答對了！(期限內免重答)'
      : '這是妳剛剛的選擇（已解鎖）';
    retakeBtn.style.display = 'inline';
  }

  quizOverlay.classList.add('open');
  document.body.classList.add('quiz-open');
  cancelBtn.focus();
  refreshUnlock(id); // review refresh TTL
}

function closeQuiz() {
  quizOverlay.classList.remove('open');
  document.body.classList.remove('quiz-open');
  currentId = null; currentSection = null;
}

function submitAnswer(choiceIdx) {
  if (currentId == null) return;
  const data = QUIZ_DATA[currentId];
  const btns = optsWrap.querySelectorAll('button');
  btns.forEach(b => b.disabled = true);
  if (choiceIdx === data.ans) {
    msgEl.textContent = '答對啦！解鎖中...';
    btns[choiceIdx].classList.add('correct');
    unlockSection(currentSection);
    refreshUnlock(currentId);
    saveAnswer(currentId, choiceIdx);
    setTimeout(closeQuiz, 800);
  } else {
    msgEl.textContent = '答錯了，再想想～';
    btns[choiceIdx].classList.add('wrong');
    setTimeout(() => {
      btns.forEach((b, idx) => {
        if (idx !== choiceIdx) {
          b.disabled = false;
          b.classList.remove('wrong', 'correct');
        }
      });
      msgEl.textContent = '';
    }, 800);
  }
}

function initQuizLock() {
  Object.assign(QUIZ_DATA, buildQuizDataFromContent());
  buildQuizUI();
  const sections = Array.from(document.querySelectorAll('main .block[id]'));
  sections.forEach(sec => {
    const id = sec.id;
    const spec = CONTENT.sections.find(s => s.id === id);
    const shouldLock = (spec?.locked ?? !!QUIZ_DATA[id]);
    const unlocked = shouldLock ? isUnlocked(id) : true;
    if (unlocked) {
      unlockSection(sec);
      refreshUnlock(id);
    } else {
      lockSection(sec);
    }
    sec.addEventListener('click', (e) => {
      if (!sec.classList.contains('locked')) return;
      e.preventDefault(); e.stopPropagation();
      openQuiz(sec, false, false);
    }, true);
  });

  // refresh TTL with activity
  ['click', 'scroll', 'keydown', 'touchstart', 'visibilitychange', 'focus'].forEach(ev => {
    window.addEventListener(ev, () => {
      sections.forEach(sec => {
        if (sec.classList.contains('unlocked') && QUIZ_DATA[sec.id]) refreshUnlock(sec.id);
      });
    }, { passive: true });
  });
}

/* =========================================================
   LIGHTBOX (respect lock)
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
    if (sec && sec.classList.contains('locked')) return;
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
   BLOCK LAYOUT + REVEAL
   ========================================================= */
function initBlocks() {
  const blocks = Array.from(document.querySelectorAll('main .block'));
  if (!blocks.length) return;
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
