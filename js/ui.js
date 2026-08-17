/* =========================================================
   ui.js — 화면 그리기 도우미 (요소 만들기, 겹침 창, 파일 다루기)
   ========================================================= */

const UI = (() => {
  const screenEl   = document.getElementById('screen');
  const stepLabel  = document.getElementById('step-label');
  const stepFill   = document.getElementById('step-bar-fill');
  const backBtn    = document.getElementById('btn-back');
  const liveRegion = document.getElementById('live-region');

  let backHandler = null;
  backBtn.addEventListener('click', () => { if (backHandler) { Store.beep('back'); backHandler(); } });

  /* ---------- 요소 만들기 ---------- */
  function el(tag, props, children) {
    const node = document.createElement(tag);
    const p = props || {};
    Object.keys(p).forEach(k => {
      const v = p[k];
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'onClick') node.addEventListener('click', v);
      else if (k === 'onInput') node.addEventListener('input', v);
      else if (k === 'onChange') node.addEventListener('change', v);
      else if (k === 'style') node.setAttribute('style', v);
      else if (k in node && k !== 'list' && typeof v !== 'object') { try { node[k] = v; } catch (_) { node.setAttribute(k, v); } }
      else node.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(children) ? children : children ? [children] : [])
      .filter(Boolean)
      .forEach(c => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  /* ---------- 화면 바꾸기 ---------- */
  function render(nodes) {
    screenEl.innerHTML = '';
    (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean).forEach(n => screenEl.appendChild(n));
    screenEl.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // 화면이 바뀌면 스캐닝 대상 목록을 다시 모읍니다.
    if (window.Scanning) Scanning.refresh();
  }

  function setStep(label, current, total) {
    if (current && total) {
      stepLabel.textContent = `${current}/${total} 단계 — ${label}`;
      stepFill.style.width = Math.round((current / total) * 100) + '%';
      stepFill.parentElement.hidden = false;
    } else {
      stepLabel.textContent = label;
      stepFill.style.width = '0%';
      stepFill.parentElement.hidden = true;
    }
  }

  function setBack(fn) {
    backHandler = fn || null;
    backBtn.hidden = !fn;
  }

  function announce(msg) { liveRegion.textContent = msg; }

  /* ---------- 자주 쓰는 조각 ---------- */
  function title(t, sub) {
    return el('div', {}, [
      el('h1', { class: 'title', text: t }),
      sub ? el('p', { class: 'subtitle', text: sub }) : null
    ]);
  }

  function card(o) {
    const disabled = !!o.disabled;
    const node = el('button', {
      type: 'button',
      class: 'card' + (o.theme ? ' card--' + o.theme : '') + (o.chosen ? ' is-chosen' : ''),
      'aria-disabled': disabled ? 'true' : null,
      'aria-label': o.ariaLabel || `${o.label}${o.desc ? '. ' + o.desc : ''}${o.note ? '. ' + o.note : ''}`
    }, [
      el('span', { class: 'card__emoji', 'aria-hidden': 'true', text: o.emoji || '⭐' }),
      el('span', { class: 'card__label', text: o.label }),
      o.desc ? el('span', { class: 'card__desc', text: o.desc }) : null,
      o.note ? el('span', { class: 'card__note', text: o.note }) : null
    ]);
    node.addEventListener('click', () => {
      if (disabled) { if (o.onDisabled) o.onDisabled(); return; }
      Store.beep('tap');
      o.onClick && o.onClick();
    });
    if (disabled) node.classList.add('is-disabled');

    /* speak: 글자를 읽기 어려운 학생을 위해 카드 모서리에 작은 🔊 단추를 답니다.
       단추 안에 단추를 넣을 수 없어서 카드를 감싸고 그 위에 얹습니다.
       스캐닝(스위치) 차례에는 끼지 않도록 data-noscan 을 붙입니다. */
    if (!o.speak || !Speech.supported) return node;
    const sp = el('button', {
      type: 'button', class: 'card__speak', 'data-noscan': 'true',
      text: '🔊', title: `${o.label} 읽어주기`,
      'aria-label': `${o.label} 읽어주기`
    });
    sp.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      Speech.speak(o.speak);
    });
    return el('div', { class: 'card-wrap' }, [node, sp]);
  }

  function grid(cards, cls) { return el('div', { class: 'grid' + (cls ? ' ' + cls : '') }, cards); }

  function notice(text, kind, emoji) {
    return el('div', { class: 'notice' + (kind ? ' notice--' + kind : '') }, [
      el('span', { class: 'notice__icon', 'aria-hidden': 'true', text: emoji || '💡' }),
      el('span', { text: text })
    ]);
  }

  function btn(label, o) {
    const p = o || {};
    return el('button', {
      type: 'button',
      class: 'btn ' + (p.kind ? 'btn--' + p.kind : 'btn--ghost') + (p.wide ? ' btn--wide' : ''),
      text: label,
      'aria-label': p.ariaLabel || label,
      onClick: () => { Store.beep('tap'); p.onClick && p.onClick(); }
    });
  }

  /* ---------- 겹침 창 ---------- */
  let lastFocus = null;
  function openOverlay(id) {
    lastFocus = document.activeElement;
    const ov = document.getElementById(id);
    ov.hidden = false;
    if (window.Scanning) Scanning.refresh();
    const first = ov.querySelector('button, [href], input, select, textarea, summary');
    if (first) setTimeout(() => first.focus(), 60);
  }
  function closeOverlay(id) {
    document.getElementById(id).hidden = true;
    if (window.Scanning) Scanning.refresh();
    if (lastFocus && lastFocus.focus) setTimeout(() => lastFocus.focus(), 60);
  }
  function anyOverlayOpen() {
    return !!document.querySelector('.overlay:not([hidden])');
  }

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('.overlay:not([hidden])');
    if (open) { open.hidden = true; if (window.Scanning) Scanning.refresh(); }
  });

  /* ---------- 파일·이미지 ---------- */
  const MAX_SIDE = 1024;   // 첨부 그림은 크기를 줄여서 보냅니다(속도·비용)

  function fileToAttachment(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('파일이 없어요.')); return; }
      if (!/^image\//.test(file.type)) { reject(new Error('그림 파일만 올릴 수 있어요.')); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('그림을 읽지 못했어요.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('그림을 읽지 못했어요.'));
        img.onload = () => {
          let { width: w, height: h } = img;
          const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
          w = Math.round(w * scale); h = Math.round(h * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          resolve({ dataUrl, mimeType: 'image/jpeg', base64: dataUrl.split(',')[1] });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  /* data URL → Blob (올린 그림을 그대로 작품 파일로 쓸 때) */
  function dataUrlToBlob(dataUrl) {
    const [head, b64] = String(dataUrl).split(',');
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png';
    const bin = atob(b64 || '');
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: mime });
  }

  /* Blob → 모델에 다시 보낼 수 있는 형태
     (그림책에서 앞 장면 그림을 다음 장면 요청에 함께 보낼 때 씁니다) */
  async function blobToAttachment(blob) {
    const dataUrl = await blobToDataUrl(blob);
    return { dataUrl, mimeType: blob.type || 'image/png', base64: String(dataUrl).split(',')[1] };
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
    return filename;
  }

  /* ---------- "어디에 저장됐지?" 안내 ----------
     브라우저가 파일을 어디에 두는지는 기기마다 달라서, 저장한 뒤에
     찾아갈 곳을 그 기기에 맞는 말로 알려 줍니다. */
  function isIOS() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
           (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
  }

  function saveHint() {
    const ua = navigator.userAgent || '';
    if (isIOS())            return '아이패드·아이폰은 “파일” 앱 → “다운로드” 폴더에 들어 있어요.';
    if (/Android/.test(ua)) return '안드로이드는 “내 파일(파일)” 앱 → “Download(다운로드)” 폴더에 들어 있어요.';
    return '이 컴퓨터의 “다운로드” 폴더에 들어 있어요.';
  }

  /* 사진첩·다른 앱으로 바로 보내기 (태블릿에서 다운로드 폴더를 찾기 어려울 때 편합니다) */
  function makeFiles(blobs, names) {
    if (typeof File === 'undefined') return null;
    try { return blobs.map((b, i) => new File([b], names[i], { type: b.type || 'application/octet-stream' })); }
    catch (_) { return null; }
  }

  function canShareFiles(blobs, names) {
    if (!navigator.share || !navigator.canShare) return false;
    const files = makeFiles(blobs, names);
    if (!files) return false;
    try { return navigator.canShare({ files }); } catch (_) { return false; }
  }

  async function shareFiles(blobs, names, title) {
    const files = makeFiles(blobs, names);
    if (!files) return false;
    try {
      await navigator.share({ files, title: title || '내가 만든 작품' });
      return true;
    } catch (_) {
      return false;      // 학생이 취소했거나 이 기기가 지원하지 않는 경우
    }
  }

  function todayText() {
    const d = new Date();
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  }

  return {
    el, render, setStep, setBack, announce,
    title, card, grid, notice, btn,
    openOverlay, closeOverlay, anyOverlayOpen,
    fileToAttachment, blobToDataUrl, dataUrlToBlob, blobToAttachment, download, todayText,
    saveHint, canShareFiles, shareFiles, isIOS,
    screenEl
  };
})();
