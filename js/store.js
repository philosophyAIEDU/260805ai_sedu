/* =========================================================
   store.js — 설정 저장(localStorage), 영상 하루 사용 횟수, 효과음
   · 학생이 만든 이야기·이름은 서버로 보내지 않고 브라우저에만 남습니다.
   ========================================================= */

const Store = (() => {
  const KEY_SETTINGS = 'story.settings.v1';
  const KEY_VIDEO    = 'story.videoUsage.v1';
  const KEY_ONBOARD  = 'story.onboardingDone.v1';

  let settings = load();

  function load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY_SETTINGS) || '{}'); } catch (_) {}
    const s = Object.assign({}, CFG.DEFAULT_SETTINGS, saved);
    s.features = Object.assign({}, CFG.DEFAULT_SETTINGS.features, saved.features || {});
    return s;
  }

  function save() {
    try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings)); } catch (_) {}
  }

  function get(key) { return settings[key]; }
  function all() { return settings; }

  function set(key, value) {
    settings[key] = value;
    save();
    if (key === 'fontSize') applyFontSize();
  }

  function setFeature(id, on) {
    settings.features[id] = !!on;
    save();
  }

  function applyFontSize() {
    document.body.className = document.body.className
      .replace(/\bsize-(s|m|l|xl)\b/g, '').trim();
    document.body.classList.add('size-' + settings.fontSize);
  }

  /* ---------- 영상 하루 사용 횟수 ----------
     비용 관리용 장치입니다. 보안 장치가 아니며, 브라우저 저장소를 지우면 초기화됩니다. */
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function videoUsage() {
    let u = { date: today(), count: 0 };
    try {
      const raw = JSON.parse(localStorage.getItem(KEY_VIDEO) || 'null');
      if (raw && raw.date === today()) u = raw;   // 날짜가 바뀌면 자동 초기화
    } catch (_) {}
    return u;
  }

  function videoRemaining() {
    const limit = Number(settings.videoDailyLimit) || 0;
    return Math.max(0, limit - videoUsage().count);
  }

  function useVideoOnce() {
    const u = videoUsage();
    u.count += 1;
    u.date = today();
    try { localStorage.setItem(KEY_VIDEO, JSON.stringify(u)); } catch (_) {}
  }

  function resetVideoUsage() {
    try { localStorage.setItem(KEY_VIDEO, JSON.stringify({ date: today(), count: 0 })); } catch (_) {}
  }

  /* ---------- 처음 안내를 봤는지 ---------- */
  function onboardingDone() { return localStorage.getItem(KEY_ONBOARD) === '1'; }
  function markOnboardingDone() { try { localStorage.setItem(KEY_ONBOARD, '1'); } catch (_) {} }

  /* ---------- 효과음 (기본 꺼짐, 짧고 부드러운 소리만) ---------- */
  let audioCtx = null;
  function beep(kind) {
    if (!settings.soundEffects) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const freq = kind === 'done' ? 660 : kind === 'back' ? 330 : 520;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.28);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (_) {}
  }

  applyFontSize();

  return {
    get, set, all, setFeature, applyFontSize,
    videoRemaining, useVideoOnce, resetVideoUsage, videoUsage,
    onboardingDone, markOnboardingDone, beep
  };
})();
