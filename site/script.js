/* =========================================================
   1000 DAYS SITE SCRIPT – RR Auth + Encrypted Payload (B2)
   ========================================================= */

/* -------------------- CONFIG -------------------- */
const THEMES = ['light', 'nightpink', 'starry', 'candle'];
const THEME_KEY = 'theme-v3';

const AUTH_MODE_KEY = 'rrAuthMode';     // 'guest' | 'rr'
const AUTH_EXP_KEY = 'rrAuthExp';      // ms epoch
const AUTH_KP_KEY = 'rrAuthKp';       // base64 master key

// path constants (relative)
const PATH_SAMPLE_CONTENT = 'content.sample.json';
const PATH_SAMPLE_CARD = 'card.sample.html';
const PATH_PRIVATE_ENC = 'private.enc.json'; // produced in prod build

// fallback TTL if payload missing
const DEFAULT_AUTH_TTL_MS = 15 * 60 * 1000;

/* quiz lock fallback; overwritten by content meta */
let LOCK_DURATION_MS = 15 * 60 * 1000;

/* runtime state */
let CURRENT_MODE = null;       // 'guest' or 'rr'
let CURRENT_CONTENT = null;    // content JSON currently bound to DOM
let RR_PAYLOAD = null;         // decrypted payload {content, card_html, images}
let QUIZ_DATA = {};
let quizOverlay = null, qEl, optsWrap, msgEl, cancelBtn, retakeBtn;
let currentId = null, currentSection = null;
let IS_CARD_PAGE = document.body.dataset.page === 'card';

/* =========================================================
   UTIL HELPERS
   ========================================================= */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function detectSystemTheme() {
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ? 'nightpink' : 'light';
}
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || detectSystemTheme();
}
function saveTheme(t) { try { localStorage.setItem(THEME_KEY, t); } catch (_) { } }
function getSavedTheme() { try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; } }

/* fetch JSON helper */
async function fetchJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetch ${path} ${res.status}`);
  return res.json();
}
async function fetchText(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetch ${path} ${res.status}`);
  return res.text();
}

/* base64 <-> ArrayBuffer */
function b64ToBuf(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
function bufToB64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = ''; for (let b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/* text -> ArrayBuffer */
const te = new TextEncoder();
const td = new TextDecoder();

/* answer normalization: sync with build script */
function normalizeAnswer(s) {
  if (!s) return '';
  let out = s.replace(/\s+/g, '');                      // remove whitespace
  out = out.replace(/[-_./:：;；,，]/g, '');            // remove common punct
  out = out.toLowerCase();
  return out;
}

/* PBKDF2 derive raw key */
async function deriveKeyRaw(passNorm, saltBuf, iter = 250000) {
  const passKey = await crypto.subtle.importKey(
    'raw', te.encode(passNorm), { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuf, iterations: iter, hash: 'SHA-256' },
    passKey, 256
  );
  return bits; // ArrayBuffer 32 bytes
}

/* AES-GCM encrypt/decrypt raw */
async function aesGcmEncryptRaw(keyBuf, ptBuf) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', keyBuf, 'AES-GCM', false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ptBuf);
  return { iv, ct };
}
async function aesGcmDecryptRaw(keyBuf, ivBuf, ctBuf) {
  const key = await crypto.subtle.importKey('raw', keyBuf, 'AES-GCM', false, ['decrypt']);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(ivBuf) }, key, ctBuf);
}

/* localStorage helpers */
function getLS(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function setLS(k, v) { try { localStorage.setItem(k, v); } catch (_) { } }
function removeLS(k) { try { localStorage.removeItem(k); } catch (_) { } }

/* auth TTL helpers */
function getAuthExp() { const v = parseInt(getLS(AUTH_EXP_KEY), 10); return isNaN(v) ? 0 : v; }
function setAuthExp(ms) { setLS(AUTH_EXP_KEY, String(ms)); }
function getAuthMode() { return getLS(AUTH_MODE_KEY); }
function setAuthMode(m) { setLS(AUTH_MODE_KEY, m); }
function getStoredKp() { const b64 = getLS(AUTH_KP_KEY); return b64 ? b64ToBuf(b64) : null; }
function setStoredKp(buf) { setLS(AUTH_KP_KEY, bufToB64(buf)); }
function clearAuth() { removeLS(AUTH_MODE_KEY); removeLS(AUTH_EXP_KEY); removeLS(AUTH_KP_KEY); }

/* is current rr auth valid? */
function rrAuthValid() {
  const mode = getAuthMode();
  if (mode !== 'rr') return false;
  const exp = getAuthExp();
  if (!exp || Date.now() > exp) { clearAuth(); return false; }
  return true;
}

/* =========================================================
   AUTH GATE UI
   ========================================================= */
let authGateEl, authSelectEl, authRRField, authRRInput, authRRSubmit, authRRMsg, authQuestionEl;

function initAuthGateUI() {
  authGateEl = $('#auth-gate');
  authSelectEl = $('#auth-role-select');
  authRRField = $('#auth-rr-field');
  authRRInput = $('#auth-rr-input');
  authRRSubmit = $('#auth-rr-submit');
  authRRMsg = $('#auth-rr-msg');
  authQuestionEl = $('#auth-question');

  if (!authGateEl) return; // no gate? skip
  document.body.classList.add('auth-open');

  authSelectEl?.addEventListener('change', onAuthRoleChange);
  authRRSubmit?.addEventListener('click', onAuthRRSubmit);
  authRRInput?.addEventListener('keyup', e => { if (e.key === 'Enter') onAuthRRSubmit(); });
}

function showAuthRRField() {
  authRRField?.classList.remove('hidden');
  authRRInput?.focus();
}

function hideAuthGate() {
  authGateEl?.classList.add('hidden');
  document.body.classList.remove('auth-open');
}

function onAuthRoleChange() {
  const val = authSelectEl.value;
  if (val === 'guest') {
    hideAuthGate();     // ★ 新增：關閉遮罩
    chooseGuest();
    return;
  } else if (val === 'rr') {
    loadQuestionMeta().then(q => {
      if (q) authQuestionEl.textContent = q;
    });
    showAuthRRField();
  }
}


async function onAuthRRSubmit() {
  const ans = authRRInput.value.trim();
  if (!ans) { authRRMsg.textContent = '請輸入暗號'; return; }
  authRRSubmit.disabled = true;
  authRRMsg.textContent = '驗證中...';

  try {
    const ok = await attemptRRAuth(ans);
    if (ok) {
      authRRMsg.textContent = '成功！載入中...';
      hideAuthGate();
      await chooseRR();  // load rr content
    } else {
      authRRMsg.textContent = '不對喔，再試一次～';
      authRRSubmit.disabled = false;
      authRRInput.focus();
      authRRInput.select();
    }
  } catch (err) {
    console.error(err);
    authRRMsg.textContent = '驗證錯誤（請稍後重試）';
    authRRSubmit.disabled = false;
  }
}

/* load question meta from enc (without decrypt) */
let _metaCache = null;
async function loadQuestionMeta() {
  if (_metaCache) return _metaCache.question;
  try {
    const meta = await fetchJSON(PATH_PRIVATE_ENC);
    _metaCache = meta;
    return meta.question || '';
  } catch (_) {
    return '';
  }
}

/* =========================================================
   RR AUTH / DECRYPT WORKFLOW
   ========================================================= */

/* Attempt to authenticate using input answer; returns boolean */
async function attemptRRAuth(answerRaw) {
  const meta = await fetchJSON(PATH_PRIVATE_ENC);
  const norm = normalizeAnswer(answerRaw);

  const salt = b64ToBuf(meta.salt);
  const iter = meta.pbkdf2_iter || 250000;

  // derive key from answer
  const keyA = await deriveKeyRaw(norm, salt, iter);

  // try decrypt each envelope; success -> masterKey
  let masterKeyBuf = null;
  for (const env of meta.envelopes) {
    try {
      const ivBuf = b64ToBuf(env.iv);
      const ctBuf = b64ToBuf(env.data);
      const pt = await aesGcmDecryptRaw(keyA, ivBuf, ctBuf);
      if (pt.byteLength === 32) {
        masterKeyBuf = pt;
        break;
      }
    } catch (_) { }
  }
  if (!masterKeyBuf) {
    return false; // wrong answer
  }

  // decrypt payload
  try {
    const payloadIv = b64ToBuf(meta.payload.iv);
    const payloadCt = b64ToBuf(meta.payload.data);
    const payloadBuf = await aesGcmDecryptRaw(masterKeyBuf, payloadIv, payloadCt);
    const payloadObj = JSON.parse(td.decode(payloadBuf));
    RR_PAYLOAD = payloadObj;

    // save auth state
    const ttl = meta.ttl_ms ?? DEFAULT_AUTH_TTL_MS;
    setAuthMode('rr');
    setAuthExp(Date.now() + ttl);
    // store master key to shortcut future decrypt (TTL)
    setStoredKp(masterKeyBuf);
    return true;
  } catch (err) {
    console.error('payload decrypt failed', err);
    return false;
  }
}

/* Direct load using stored master key (TTL valid) */
async function rrResumeFromStored() {
  const kpBuf = getStoredKp();
  if (!kpBuf) return false;
  const meta = await fetchJSON(PATH_PRIVATE_ENC);
  try {
    const payloadIv = b64ToBuf(meta.payload.iv);
    const payloadCt = b64ToBuf(meta.payload.data);
    const payloadBuf = await aesGcmDecryptRaw(kpBuf, payloadIv, payloadCt);
    const payloadObj = JSON.parse(td.decode(payloadBuf));
    RR_PAYLOAD = payloadObj;
    // refresh TTL
    const ttl = meta.ttl_ms ?? DEFAULT_AUTH_TTL_MS;
    setAuthExp(Date.now() + ttl);
    return true;
  } catch (err) {
    console.warn('rrResumeFromStored decrypt fail', err);
    clearAuth();
    return false;
  }
}

/* =========================================================
   MODE LOADERS
   ========================================================= */

/* Guest (demo) mode */
async function chooseGuest() {
  hideAuthGate();  // 保險
  CURRENT_MODE = 'guest';
  setAuthMode('guest');
  setAuthExp(Date.now() + DEFAULT_AUTH_TTL_MS); // arbitrary; just to suppress gate re-open within session
  removeLS(AUTH_KP_KEY);

  const content = await fetchJSON(PATH_SAMPLE_CONTENT);
  CURRENT_CONTENT = content;
  const root = $('#sections-root');
  if (root) root.innerHTML = '';
  buildSectionsFromContent(content);
  initBlocks();
  initLightbox();
  initQuizLock(); // sample quiz OK
}

/* After successful RR auth */
async function chooseRR() {
  if (!RR_PAYLOAD) {
    // try resume if TTL valid but no payload
    if (rrAuthValid() && await rrResumeFromStored()) {
      // ok
    } else {
      console.warn('chooseRR without payload, fallback to guest');
      return chooseGuest();
    }
  }
  CURRENT_MODE = 'rr';
  const { content, card_html, images } = RR_PAYLOAD;

  // update global lock duration from payload meta
  const min = parseInt(content?.meta?.lock_duration_minutes, 10);
  if (!isNaN(min) && min > 0) LOCK_DURATION_MS = min * 60 * 1000;

  // convert embedded images into objectURLs, patch content refs
  const imgMap = {};
  for (const [fname, dataUrl] of Object.entries(images || {})) {
    imgMap[fname] = dataUrl; // dataURL 直接使用
  }
  const patched = patchContentImages(content, imgMap);
  CURRENT_CONTENT = patched;

  if (IS_CARD_PAGE) {
    injectRRCard(card_html);
  } else {
    const root = $('#sections-root');
    if (root) root.innerHTML = '';
    buildSectionsFromContent(patched);
    initBlocks();
    initLightbox();
    initQuizLock();
  }
}

/* patch content image src -> mapped data URLs */
function patchContentImages(content, imgMap) {
  const clone = JSON.parse(JSON.stringify(content));
  (clone.sections || []).forEach(sec => {
    const img = sec.image || {};
    // basename
    const pFull = img.full || img.thumb || '';
    const base = pFull.split('/').pop();
    if (imgMap[base]) {
      img.full = imgMap[base];
      img.thumb = imgMap[base];
    }
  });
  return clone;
}

/* card injection (RR) */
function injectRRCard(html) {
  const root = $('#card-root');
  if (!root) return;
  root.innerHTML = html;
  // ensure root visible (card.sample.html stub already)
}

/* =========================================================
   QUIZ LOCK + SECTION BUILDER (same as previous w/ minor adapt)
   ========================================================= */
function buildSectionsFromContent(content) {
  const root = $('#sections-root');
  if (!root) return;
  root.innerHTML = '';
  const secs = content?.sections || [];
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

    // review button
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

/* quiz localStorage keys */
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

function buildQuizDataFromContent(content) {
  const out = {};
  (content?.sections || []).forEach(sec => {
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
    <div class=\"quiz-card\" role=\"dialog\" aria-modal=\"true\">
      <h3 id=\"quiz-q\"></h3>
      <div class=\"quiz-options\" id=\"quiz-opts\"></div>
      <div class=\"quiz-msg\" id=\"quiz-msg\"></div>
      <button class=\"quiz-cancel\" type=\"button\">取消</button>
      <button class=\"quiz-retake\" type=\"button\" style=\"display:none;\">重新答題</button>
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
  QUIZ_DATA = buildQuizDataFromContent(CURRENT_CONTENT);
  buildQuizUI();
  const sections = Array.from(document.querySelectorAll('main .block[id]'));
  sections.forEach(sec => {
    const id = sec.id;
    const spec = CURRENT_CONTENT.sections.find(s => s.id === id);
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

  // refresh TTL w/ any activity
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
    <button class=\"lightbox-close\" aria-label=\"關閉圖片\">&times;</button>
    <img alt=\"\">
    <div class=\"lightbox-caption\" role=\"note\"></div>
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
   THEME TOGGLE
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
  btn.textContent = '•';
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
   ENTRY FLOW
   ========================================================= */
async function entryInit() {
  initThemeToggle();
  initAuthGateUI();

  // If card page & RR TTL valid -> skip gate & resume
  if (rrAuthValid() && await rrResumeFromStored()) {
    hideAuthGate();
    await chooseRR();
    return;
  }

  // If guest previously selected (or TTL valid guest), auto guest
  if (getAuthMode() === 'guest' && Date.now() < getAuthExp()) {
    hideAuthGate();
    await chooseGuest();
    return;
  }

  // else show gate UI; wait user choice
  // guest choose triggers chooseGuest(); rr choose triggers chooseRR() after submit
}

/* =========================================================
   DOM READY
   ========================================================= */
document.addEventListener('DOMContentLoaded', entryInit);
