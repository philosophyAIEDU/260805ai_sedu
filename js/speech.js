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

  /* 이어 읽기(speakList)가 돌고 있으면 함께 멈추도록 표시해 둡니다. */
  let seqStop = false;

  function stop() {
    seqStop = true;
    if (supported) { try { window.speechSynthesis.cancel(); } catch (_) {} }
  }

  /* rate: 0.5 ~ 1.5 (선생님용 설정의 "음성 읽어주기 속도")
     keep: true 이면 앞의 말을 끊지 않습니다(여러 낱말을 이어 읽을 때). */
  function speak(text, opts) {
    if (!supported || !text) return false;
    const o = opts || {};
    if (!o.keep) stop();
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

  /* 여러 낱말을 하나씩 차례로 읽어 줍니다.
     (주제·선택지 카드를 "우주 … 바다 … 산 … 하늘" 처럼 순서대로 들려줄 때 씁니다.)
     낱말 사이에 잠깐 쉬어야 어떤 낱말인지 알아듣기 쉬워서 조금씩 쉬어 갑니다. */
  function speakList(list, opts) {
    const arr = (list || []).map(s => String(s || '').trim()).filter(Boolean);
    if (!supported || !arr.length) return false;
    const gap = (opts && opts.gap != null) ? opts.gap : 450;
    stop();
    seqStop = false;
    let i = 0;
    const next = () => {
      if (seqStop || i >= arr.length) return;
      const text = arr[i++];
      const ok = speak(text, {
        keep: true,
        rate: opts && opts.rate,
        onend: () => setTimeout(next, gap)
      });
      if (!ok) seqStop = true;
    };
    // 앞선 말을 취소한 직후에 바로 말하면 일부 브라우저에서 소리가 나지 않아 살짝 미룹니다.
    setTimeout(next, 120);
    return true;
  }

  function isSpeaking() { return supported && window.speechSynthesis.speaking; }

  return { supported, speak, speakList, stop, isSpeaking };
})();
