/* =========================================================
   1000 DAYS SITE SCRIPT
   with YouTube crossfade + auto-mute heuristics (v3.2)
   ========================================================= */

/* ---------- DEBUG SWITCH ---------- */
const DEBUG_BGM = false;
function logDebug(...args) { if (DEBUG_BGM) console.log('[BGM]', ...args); }

/* =========================================================
   CONFIG
   ========================================================= */
const THEMES = ['light', 'nightpink', 'starry', 'candle'];
const THEME_KEY = 'theme-v3';
const MUSIC_MUTE_KEY = 'bgm-muted';
const MUSIC_AUTO_STATE_KEY = 'bgm-auto-state';
const DEFAULT_VOL = 30;
const CROSSFADE_OUT_MS = 600;
const CROSSFADE_IN_MS = 1200;
let LOCK_DURATION_MS = 15 * 60 * 1000;

/* =========================================================
   RUNTIME STATE
   ========================================================= */
let CONTENT = null;
let MUSIC_MAP = {};
let ytApiLoaded = false;
let ytReady = false;
let ytPlayer = null;
let pendingThemeOnYTReady = null;

let userInteracted = false; // first pointer/scroll/key -> allow audio fade in
let userMuted = false;      // explicit user action
let autoMuted = false;      // auto heuristic (visibility hidden)
let musicBtn = null;        // mute btn

/* quiz globals */
const QUIZ_DATA = {};
let quizOverlay = null, qEl, optsWrap, msgEl, cancelBtn, retakeBtn;
let currentId = null, currentSection = null;

/* =========================================================
   UTIL
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
function saveUserMute(v) { try { localStorage.setItem(MUSIC_MUTE_KEY, v ? '1' : '0'); } catch (_) { } }
function getSavedUserMute() { try { return localStorage.getItem(MUSIC_MUTE_KEY) === '1'; } catch (_) { return false; } }
function saveAutoMuteState(v) { try { localStorage.setItem(MUSIC_AUTO_STATE_KEY, v ? '1' : '0'); } catch (_) { } }
function getSavedAutoMuteState() { try { return localStorage.getItem(MUSIC_AUTO_STATE_KEY) === '1'; } catch (_) { return false; } }

/* parse YouTube id */
function parseYouTubeId(val) {
  if (!val) return null;
  if (val.startsWith('yt:')) return val.slice(3);
  if (/^[\w-]{6,15}$/.test(val)) return val;
  const m = val.match(/[?&]v=([^&]+)/) || val.match(/youtu\.be\/([^?&]+)/);
  return m ? m[1] : null;
}
function themeVideoId(theme) {
  const v = MUSIC_MAP[theme] || MUSIC_MAP.light;
  return parseYouTubeId(v);
}

/* =========================================================
   CONTENT LOAD + BUILD
   ========================================================= */
async function loadContent() {
  try {
    const res = await fetch('content.json?cb=' + Date.now(), { cache: 'no-store' });
    CONTENT = await res.json();
    const min = parseInt(CONTENT?.meta?.lock_duration_minutes, 10);
    if (!isNaN(min) && min > 0) LOCK_DURATION_MS = min * 60 * 1000;
    MUSIC_MAP = { ...(CONTENT?.meta?.music || {}) };
  } catch (err) {
    console.error('載入 content.json 失敗：', err);
    CONTENT = { sections: [] };
    MUSIC_MAP = {};
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

    const reviewBtn = document.createElement('button');
    reviewBtn.type = 'button';
    reviewBtn.className = 'quiz-review-btn';
    reviewBtn.title = '查看題目 / 再答一次';
    reviewBtn.textContent = '?';
    reviewBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      openQuiz(el, true);
    });
    el.appendChild(reviewBtn);

    root.appendChild(el);
  });
}

/* =========================================================
   THEME TOGGLE
   ========================================================= */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  crossfadeToTheme(theme); // smooth music change
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
   YOUTUBE PLAYER + MUSIC
   ========================================================= */
function ensureYTApi() {
  if (ytApiLoaded) return;
  ytApiLoaded = true;
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);

  const wrap = document.createElement('div');
  wrap.id = 'yt-music';
  wrap.style.position = 'fixed';
  wrap.style.width = '0';
  wrap.style.height = '0';
  wrap.style.overflow = 'hidden';
  wrap.style.opacity = '0';
  wrap.style.pointerEvents = 'none';
  document.body.appendChild(wrap);
}

/* YT global callback */
window.onYouTubeIframeAPIReady = function () {
  ytReady = true;
  createYTPlayer(themeVideoId(currentTheme()));
  if (pendingThemeOnYTReady) {
    crossfadeToTheme(pendingThemeOnYTReady);
    pendingThemeOnYTReady = null;
  }
};

function createYTPlayer(videoId) {
  if (!window.YT || !YT.Player) return;
  ytPlayer = new YT.Player('yt-music', {
    height: '0', width: '0',
    videoId: videoId,
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      loop: 1,
      playlist: videoId,
      mute: 1
    },
    events: {
      'onReady': onYTReady,
      'onStateChange': onYTStateChange,
      'onError': onYTError
    }
  });
}
function onYTReady() {
  logDebug('YT ready');
  try { ytPlayer.playVideo(); } catch (_) { }
  userMuted = getSavedUserMute();
  autoMuted = getSavedAutoMuteState();
  updateMusicMuteUI();
  applyEffectiveMuteState();
}
function onYTStateChange(e) {
  logDebug('YT state', e.data);
  // If ENDED (0) and loop param fails, replay manually
  if (e.data === YT.PlayerState.ENDED) {
    try { ytPlayer.playVideo(); } catch (_) { }
  }
}
function onYTError(e) {
  console.error('YT error', e?.data);
  // e.data: 2,5,100,101,150 etc.
  // If error on current video, try fallback to light theme track
  if (currentTheme() !== 'light') {
    console.warn('Falling back to light theme track due to YT error.');
    crossfadeToTheme('light');
  }
}

/* ---- Volume helpers ---- */
function setYTVolume(v) {
  if (!ytPlayer) return;
  try { ytPlayer.setVolume(v); } catch (_) { }
}
function mutePlayer() { if (!ytPlayer) return; try { ytPlayer.mute(); } catch (_) { } }
function unmutePlayer() { if (!ytPlayer) return; try { ytPlayer.unMute(); } catch (_) { } }

/* Fade with rAF, Promise */
function fadeYTVolumeTo(target, duration = 500) {
  return new Promise(res => {
    if (!ytPlayer) { res(); return; }
    let start;
    let from = 0;
    try { from = ytPlayer.getVolume(); } catch (_) { }
    const diff = target - from;
    const step = (ts) => {
      if (start == null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const v = Math.round(from + diff * p);
      setYTVolume(v);
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        if (target > 0) unmutePlayer(); else mutePlayer();
        res();
      }
    };
    requestAnimationFrame(step);
  });
}

/* Wait until PLAYING (with timeout) */
function waitForYTPlaying(timeout = 3000) {
  return new Promise(res => {
    if (!ytPlayer) { res(false); return; }
    const start = Date.now();
    const check = () => {
      try {
        if (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
          res(true); return;
        }
      } catch (_) { }
      if (Date.now() - start > timeout) { res(false); return; }
      setTimeout(check, 100);
    };
    check();
  });
}

/* Crossfade to theme track */
async function crossfadeToTheme(theme) {
  const vid = themeVideoId(theme);
  if (!ytReady || !ytPlayer) {
    pendingThemeOnYTReady = theme;
    return;
  }
  const curId = ytPlayer.getVideoData()?.video_id;
  if (curId === vid) {
    // Already on this video; just ensure volume state correct
    if (!isEffectivelyMuted() && userInteracted) {
      fadeYTVolumeTo(DEFAULT_VOL, 300);
    }
    return;
  }

  const wasMuted = isEffectivelyMuted();
  logDebug('crossfade', { from: curId, to: vid, wasMuted, userInteracted });

  // fade out current if we were audible
  if (!wasMuted && userInteracted) {
    await fadeYTVolumeTo(0, CROSSFADE_OUT_MS);
  } else {
    mutePlayer(); setYTVolume(0);
  }

  // load new video
  ytPlayer.loadVideoById({ videoId: vid, startSeconds: 0, suggestedQuality: 'small' });
  // refresh loop param (YT quirk: need to call again via playlist)
  try {
    // cheat: call cuePlaylist then play
    ytPlayer.cuePlaylist([vid]);
    ytPlayer.setLoop?.(true);
    ytPlayer.playVideo();
  } catch (_) { }

  // if we should stay muted (user/auto or no interaction yet) just stop here
  if (wasMuted || !userInteracted) {
    mutePlayer(); setYTVolume(0);
    return;
  }

  // wait for playing; if timeout, still try fade in
  const ok = await waitForYTPlaying(4000);
  if (!ok) logDebug('waitForYTPlaying timeout; forcing fade in');

  unmutePlayer();
  await fadeYTVolumeTo(DEFAULT_VOL, CROSSFADE_IN_MS);
}

/* effective mute = user OR auto */
function isEffectivelyMuted() { return userMuted || autoMuted; }
function applyEffectiveMuteState() {
  if (isEffectivelyMuted()) {
    mutePlayer(); setYTVolume(0);
  } else {
    unmutePlayer(); setYTVolume(DEFAULT_VOL);
  }
  updateMusicMuteUI();
}

/* manual mute toggle */
function toggleMusicMute() {
  userMuted = !userMuted;
  saveUserMute(userMuted);
  applyEffectiveMuteState();
}

/* update mute btn glyph */
function updateMusicMuteUI() {
  if (!musicBtn) return;
  musicBtn.dataset.icon = isEffectivelyMuted() ? '🔇' : '🔈';
}

/* one-time unmute after first interaction (autoplay unlock) */
function setupAutoUnmuteAfterInteraction() {
  const handler = () => {
    if (userInteracted) return;
    userInteracted = true;
    logDebug('first interaction');
    if (!isEffectivelyMuted()) {
      unmutePlayer();
      fadeYTVolumeTo(DEFAULT_VOL, 500);
    }
    cleanup();
  };
  function cleanup() {
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('keydown', handler);
    window.removeEventListener('scroll', handler);
    window.removeEventListener('touchstart', handler);
  }
  window.addEventListener('pointerdown', handler, { once: false });
  window.addEventListener('keydown', handler, { once: false });
  window.addEventListener('scroll', handler, { once: false, passive: true });
  window.addEventListener('touchstart', handler, { once: false, passive: true });
}

/* conservative auto-mute heuristics (no blur; reduces誤觸) */
function setupAutoMuteHeuristics() {
  autoMuted = getSavedAutoMuteState();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      autoMuted = true;
      saveAutoMuteState(true);
      applyEffectiveMuteState();
    } else {
      if (autoMuted && !userMuted) {
        autoMuted = false;
        saveAutoMuteState(false);
        // fade in only after interaction unlock
        if (userInteracted) {
          unmutePlayer();
          fadeYTVolumeTo(DEFAULT_VOL, CROSSFADE_IN_MS);
        } else {
          applyEffectiveMuteState();
        }
      }
    }
  });
  window.addEventListener('pagehide', () => {
    autoMuted = true; saveAutoMuteState(true); applyEffectiveMuteState();
  });
}

/* mute button UI */
function initMusicButton() {
  musicBtn = document.createElement('button');
  musicBtn.type = 'button';
  musicBtn.className = 'music-toggle';
  musicBtn.dataset.icon = '🔈';
  musicBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    toggleMusicMute();
  });
  document.body.appendChild(musicBtn);
  // restore saved states
  userMuted = getSavedUserMute();
  autoMuted = getSavedAutoMuteState();
  updateMusicMuteUI();
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

  ['click', 'scroll', 'keydown', 'touchstart', 'visibilitychange', 'focus'].forEach(ev => {
    window.addEventListener(ev, () => {
      sections.forEach(sec => {
        if (sec.classList.contains('unlocked') && QUIZ_DATA[sec.id]) refreshUnlock(sec.id);
      });
    }, { passive: true });
  });
}

/* =========================================================
   LIGHTBOX
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

  initMusicButton();
  ensureYTApi();
  setupAutoUnmuteAfterInteraction();
  setupAutoMuteHeuristics();
});
