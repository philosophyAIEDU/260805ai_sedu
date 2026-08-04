/* =========================================================
   scanning.js — 스위치 스캐닝 모드
   선택지에 순서대로 불이 들어오고 스페이스바(또는 화면 아무 곳 누르기)로 선택합니다.
   기본은 꺼짐이며 선생님용 설정에서 켭니다.
   · 강조는 테두리·옅은 배경 변화로만 하고, 최소 1.5초 이상 머무릅니다(깜빡임 없음).
   ========================================================= */

const Scanning = (() => {
  let items = [];
  let index = 0;
  let timer = null;
  let hintEl = null;

  function enabled() { return !!Store.get('scanning'); }
  function speedMs() {
    const s = Number(Store.get('scanSpeed')) || 2.5;
    return Math.min(5, Math.max(1.5, s)) * 1000;
  }

  function root() {
    const overlay = document.querySelector('.overlay:not([hidden])');
    return overlay || UI.screenEl;
  }

  function collect() {
    const sel = 'button:not([aria-disabled="true"]):not([hidden]), a[href], input:not([type="hidden"]), select, textarea, summary';
    return Array.from(root().querySelectorAll(sel)).filter(n => {
      if (n.disabled) return false;
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  function clearHighlight() {
    document.querySelectorAll('.scan-here').forEach(n => n.classList.remove('scan-here'));
  }

  function highlight() {
    clearHighlight();
    const node = items[index];
    if (!node) return;
    node.classList.add('scan-here');
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const label = node.getAttribute('aria-label') || node.textContent.trim();
    UI.announce(label ? label + ' — 선택하려면 스페이스' : '');
  }

  function step() {
    if (!items.length) return;
    index = (index + 1) % items.length;
    highlight();
  }

  function showHint() {
    if (hintEl) return;
    hintEl = UI.el('div', {
      class: 'scan-hint',
      text: '스페이스바를 누르면 선택돼요',
      role: 'status'
    });
    document.body.appendChild(hintEl);
  }
  function hideHint() { if (hintEl) { hintEl.remove(); hintEl = null; } }

  function start() {
    stopTimer();
    items = collect();
    index = 0;
    if (!items.length) return;
    highlight();
    showHint();
    timer = setInterval(step, speedMs());
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function stop() {
    stopTimer();
    clearHighlight();
    hideHint();
    items = [];
  }

  function refresh() {
    if (!enabled()) { stop(); return; }
    // 화면이 다 그려진 뒤 모으도록 살짝 미룹니다.
    setTimeout(start, 120);
  }

  function select() {
    const node = items[index];
    if (!node) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName)) {
      node.focus();
      stopTimer();                       // 입력 중에는 스캐닝을 잠시 멈춥니다.
      setTimeout(() => { if (enabled()) start(); }, 12000);
      return;
    }
    node.click();
  }

  document.addEventListener('keydown', e => {
    if (!enabled()) return;
    const t = e.target;
    const typing = t && /^(INPUT|TEXTAREA)$/.test(t.tagName);
    if (e.code === 'Space' && !typing) {
      e.preventDefault();
      select();
    }
  });

  return { refresh, start, stop, enabled };
})();

window.Scanning = Scanning;
