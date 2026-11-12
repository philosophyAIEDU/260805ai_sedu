/* ========================================================
   job-common.js — 직업 체험 5종이 함께 쓰는 공통 유틸
   (소리 팔레트 · DOM 빌더 · 선택버튼/제목 · 스캔모드 · 설정시트 배선)
   ======================================================== */

/* ---- 소리 ---- */
let actx = null;
function ensureAudio() {
  actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(o) {
  try {
    const ctx = ensureAudio();
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.sweepTo) osc.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + o.duration);
    g.gain.setValueAtTime(.0001, t0);
    g.gain.linearRampToValueAtTime(o.gain || .15, t0 + .015);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + o.duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + o.duration + .03);
  } catch (e) {}
}
function note(freq, delay, duration, gain, type) { tone({ freq, delay, duration, gain: gain || .16, type: type || 'triangle' }); }
function sTap()    { tone({ freq: 820, duration: .07, type: 'sine', gain: .1 }); tone({ freq: 1180, duration: .08, type: 'sine', gain: .08, delay: .05 }); }
function sNav()    { tone({ freq: 640, duration: .07, type: 'square', gain: .07 }); }
function sToggle() { tone({ freq: 700, duration: .07, type: 'sine', gain: .1 }); }
function sAdd()    { tone({ freq: 880, duration: .07, type: 'triangle', gain: .13 }); tone({ freq: 1245, duration: .09, type: 'triangle', gain: .1, delay: .05 }); }
function sRemove() { tone({ freq: 520, duration: .1, type: 'triangle', gain: .12, sweepTo: 360 }); }
function sError()  { tone({ freq: 300, duration: .18, type: 'square', gain: .09, sweepTo: 200 }); }
function sKeypad() { tone({ freq: 760, duration: .05, type: 'square', gain: .08 }); }
function sCardIn() { tone({ freq: 240, duration: .24, type: 'sawtooth', gain: .06, sweepTo: 110 }); }
function sCardOut(){ tone({ freq: 130, duration: .24, type: 'sawtooth', gain: .06, sweepTo: 280 }); }
function sCash()   { [1480, 1760, 2090].forEach((f, i) => tone({ freq: f, duration: .1, type: 'triangle', gain: .14, delay: i * .08 })); }
function sConfirm(){ tone({ freq: 660, duration: .1, type: 'sine', gain: .13 }); tone({ freq: 990, duration: .16, type: 'sine', gain: .11, delay: .08 }); }
function sScan()   { tone({ freq: 1900, duration: .08, type: 'square', gain: .11 }); }
function sHelp()   { tone({ freq: 880, duration: .16, type: 'sine', gain: .16 }); tone({ freq: 660, duration: .22, type: 'sine', gain: .14, delay: .18 }); }
function sWelcome(){
  [[659.25, 0, .09], [783.99, .09, .09], [987.77, .18, .09], [1318.51, .3, .24]]
    .forEach(([f, d, du]) => note(f, d, du, .14));
}
function sCheer(){
  [[392, 0, .11], [523.25, .1, .11], [659.25, .2, .11], [783.99, .3, .16],
   [880, .5, .09], [783.99, .59, .09], [1046.5, .68, .36]]
    .forEach(([f, d, du]) => note(f, d, du, .19));
}

/* ---- DOM 빌더 ---- */
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };

/* ---- 말하기 / 선택 버튼 / 제목 (페이지의 S 상태 객체에 맞춰 만들어 줍니다) ---- */
function makeUI(S) {
  function say(t) {
    if (!S.speak || !t) return;
    try {
      const u = new SpeechSynthesisUtterance(t); u.lang = 'ko-KR'; u.rate = .95;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) {}
  }
  function choice(o) {
    const b = el('button', 'choice' + (o.cls ? ' ' + o.cls : ''));
    b.type = 'button'; b.dataset.scan = '1';
    if (o.disabled) b.disabled = true;
    if (o.pressed !== undefined) b.setAttribute('aria-pressed', o.pressed ? 'true' : 'false');
    b.innerHTML = (o.pic ? '<span class="pic">' + o.pic + '</span>' : '') + '<span>' + o.label + '</span>' +
      (o.sub ? '<span class="won">' + o.sub + '</span>' : '') + (o.tag ? '<span class="tag">' + o.tag + '</span>' : '');
    if (!o.disabled) b.addEventListener('click', () => {
      (o.sound || sTap)(); say(o.speak || o.label);
      setTimeout(o.act, S.speak ? 220 : 70);
    });
    return b;
  }
  function head(t, hint, node) {
    const h = el('h1', 'ask'); h.textContent = t; node.appendChild(h);
    if (hint) { const p = el('p', 'hint'); p.textContent = hint; node.appendChild(p); }
    say(t);
  }
  return { say, choice, head };
}

/* ---- 스캔 모드 (스위치 접근성) ---- */
function makeScan(S, rootId) {
  let scanTimer = null, scanAt = 0, scanItems = [];
  function stopScan() {
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    scanItems.forEach(b => b.classList.remove('scan')); scanItems = [];
  }
  function mark() { scanItems.forEach((b, i) => b.classList.toggle('scan', i === scanAt)); }
  function startScanIn(root) {
    if (!S.scan || !root) return;
    scanItems = Array.from(root.querySelectorAll('[data-scan]')).filter(b => !b.disabled);
    if (!scanItems.length) return;
    scanAt = 0; mark();
    if (scanTimer) clearInterval(scanTimer);
    scanTimer = setInterval(() => { scanAt = (scanAt + 1) % scanItems.length; mark(); }, S.scan * 1000);
  }
  function startScan() { startScanIn(document.getElementById(rootId)); }
  function choose() { if (scanItems[scanAt]) scanItems[scanAt].click(); }
  return { stopScan, startScan, startScanIn, choose };
}

/* ---- 토스트 ---- */
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---- 선생님 설정 시트 공통 배선 ---- */
function wireSettingsSheet(S, reset, opts) {
  opts = opts || {};
  const sheet = document.getElementById('sheet');
  const gear = document.getElementById('gear'), fill = document.getElementById('gfill');
  const scan = opts.scan;
  function paintSet() {
    document.querySelectorAll('.seg').forEach(seg => {
      const k = seg.dataset.set;
      seg.querySelectorAll('button').forEach(b =>
        b.setAttribute('aria-pressed', String(S[k]) === b.dataset.v ? 'true' : 'false'));
    });
    const tallyEl = document.getElementById('tally');
    if (tallyEl) tallyEl.textContent = (opts.tallyLabel || '이번 시간에 끝낸 횟수') + ' ' + S.done + '번';
  }
  document.querySelectorAll('.seg').forEach(seg => {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const k = seg.dataset.set;
      S[k] = (k === 'level') ? b.dataset.v : Number(b.dataset.v);
      paintSet(); reset();
    });
  });
  const closeBtn = document.getElementById('closeSet');
  if (closeBtn) closeBtn.addEventListener('click', () => { sheet.hidden = true; if (scan) scan.startScan(); });
  sheet.addEventListener('click', e => { if (e.target === sheet) { sheet.hidden = true; if (scan) scan.startScan(); } });
  if (gear) {
    let t = null, a = null, p = 0;
    const start = e => {
      e.preventDefault(); p = 0;
      a = setInterval(() => { p += 4; fill.style.height = Math.min(100, p) + '%'; }, 40);
      t = setTimeout(() => { end(); sheet.hidden = false; if (scan) scan.stopScan(); paintSet(); }, 1000);
    };
    const end = () => { clearTimeout(t); clearInterval(a); fill.style.height = '0'; };
    ['mousedown', 'touchstart'].forEach(ev => gear.addEventListener(ev, start, { passive: false }));
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(ev => gear.addEventListener(ev, end));
  }
  return { paintSet };
}

/* ---- 뒤로/처음부터/키보드(스캔 선택) 공통 배선 ---- */
function wireNav(S, back, reset, scan) {
  const backBtn = document.getElementById('backBtn');
  const homeBtn = document.getElementById('homeBtn');
  if (backBtn) backBtn.addEventListener('click', () => { sNav(); back(); });
  if (homeBtn) homeBtn.addEventListener('click', () => { sNav(); reset(); });
  document.addEventListener('keydown', e => {
    const sheet = document.getElementById('sheet');
    if (sheet && !sheet.hidden) return;
    if (S.scan && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); scan.choose(); }
  });
}
