/* =========================================================
   speech.js — 이야기 읽어주기
   브라우저에 들어 있는 Web Speech API(speechSynthesis)만 사용합니다.
   API를 쓰지 않으므로 무료이고 인터넷이 없어도 동작합니다.
   ========================================================= */

const Speech = (() => {
  const supported = 'speechSynthesis' in window;
  let voices = [];

  function loadVoices() {
    if (!supported) return;
    voices = window.speechSynthesis.getVoices() || [];
  }
  if (supported) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function koVoice() {
    if (!voices.length) loadVoices();
    return voices.find(v => /^ko/i.test(v.lang)) ||
           voices.find(v => /Korean|한국/i.test(v.name)) || null;
  }

  function stop() {
    if (supported) { try { window.speechSynthesis.cancel(); } catch (_) {} }
  }

  /* rate: 0.5 ~ 1.5 (선생님용 설정의 "음성 읽어주기 속도") */
  function speak(text, opts) {
    if (!supported || !text) return false;
    const o = opts || {};
    stop();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = 'ko-KR';
    const v = koVoice();
    if (v) u.voice = v;
    u.rate = Math.min(1.6, Math.max(0.4, o.rate != null ? o.rate : (Store.get('speechRate') || 0.9)));
    u.pitch = 1.05;
    u.volume = 1;
    if (o.onend) u.onend = o.onend;
    if (o.onstart) u.onstart = o.onstart;
    try { window.speechSynthesis.speak(u); } catch (_) { return false; }
    return true;
  }

  function isSpeaking() { return supported && window.speechSynthesis.speaking; }

  return { supported, speak, stop, isSpeaking };
})();
