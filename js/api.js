/* =========================================================
   api.js — Gemini API 호출 모음
   · 텍스트/선택지/이야기/이름 제안/그림 설명 : gemini-3.1-flash-lite
   · 그림 만들기·바꾸기                      : gemini-3.1-flash-lite-image
   · 노래                                    : lyria-3-clip-preview (generateContent)
   · 영상                                    : veo-3.1-lite-generate-preview
   · 음성 읽어주기는 API를 쓰지 않습니다(브라우저 speechSynthesis, speech.js).
   API 키는 코드에 넣지 않고 선생님용 설정에서 입력한 값을 브라우저에서만 읽어 씁니다.
   ========================================================= */

const API = (() => {

  /* 이미지·영상 모델에 항상 덧붙이는 안전 지시어 */
  const SAFE_STYLE =
    'Soft warm pastel colors, gentle rounded shapes, bright and friendly children\'s picture-book illustration, ' +
    'cheerful and calm mood, no text, no scary or violent or sad elements, age-appropriate for young children, ' +
    'even soft lighting without harsh contrast or strobing.';

  /* 영상 모델은 negativePrompt·personGeneration 같은 별도 항목을 받지 않아,
     피해야 할 것도 프롬프트 안에 함께 적어 보냅니다. */
  const AVOID_TEXT =
    ' Avoid anything scary, violent, sad or dark, no weapons, no blood, no horror, ' +
    'no real people and no realistic human faces, no text or watermark.';

  function key() { return (Store.get('apiKey') || '').trim(); }
  function hasKey() { return key().length > 0; }

  class ApiError extends Error {
    constructor(message, kind) { super(message); this.kind = kind || 'api'; }
  }

  /* 마지막 오류의 자세한 내용 — 결과 화면의 "선생님께" 칸에서 보여 줍니다.
     학생에게는 쉬운 말만 보이고, 원인 파악에 필요한 원문은 여기에 담아 둡니다. */
  let lastError = null;
  function getLastError() { return lastError; }

  /* 기다리는 동안 화면에 안내 문구를 바꿔 주는 콜백 (app.js가 등록) */
  let statusHandler = null;
  function setStatusHandler(fn) { statusHandler = fn || null; }
  function say(msg) { if (statusHandler) { try { statusHandler(msg); } catch (_) {} } }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* 429 응답에 담겨 오는 "이만큼 뒤에 다시 시도하세요" 값 읽기 */
  function retryDelaySec(errJson) {
    const details = (errJson && errJson.error && errJson.error.details) || [];
    for (const d of details) {
      const t = d['@type'] || '';
      if (t.indexOf('RetryInfo') !== -1 && d.retryDelay) {
        const m = String(d.retryDelay).match(/^([\d.]+)s$/);
        if (m) return Math.ceil(parseFloat(m[1]));
      }
    }
    return null;
  }

  /* 429 응답에서 "어떤 한도"에 걸렸는지 읽기 — 분당 한도인지 하루 한도인지 구분합니다.
     분당 한도는 잠깐 기다리면 풀리지만, 하루 한도는 기다려도 오늘은 풀리지 않습니다. */
  function quotaInfoOf(errJson) {
    const details = (errJson && errJson.error && errJson.error.details) || [];
    const out = { perDay: false, perMinute: false, freeTier: false, items: [] };
    for (const d of details) {
      if (String(d['@type'] || '').indexOf('QuotaFailure') === -1) continue;
      (d.violations || []).forEach(v => {
        const id = String(v.quotaId || v.quotaMetric || '');
        if (!id) return;
        out.items.push(id + (v.quotaValue ? ` (한도 ${v.quotaValue})` : ''));
        if (/PerDay/i.test(id)) out.perDay = true;
        if (/PerMinute/i.test(id)) out.perMinute = true;
        if (/free_?tier/i.test(id)) out.freeTier = true;
      });
    }
    return out;
  }

  /* 지출 한도(spend cap)를 넘긴 429 — 사용량이 아니라 설정 문제라 기다려도 풀리지 않습니다.
     선생님이 AI Studio에서 한도를 올려 주어야 합니다. */
  function isSpendCap(errJson, detail) {
    const msg = detail || (errJson && errJson.error && errJson.error.message) || '';
    return /spend(ing)?[ _-]?cap/i.test(msg);
  }

  /* 기다려도 풀리지 않는 한도에 걸린 대상을 잠깐 기억해 둡니다.
     계속 요청을 보내 봤자 실패하고 기다리기만 하기 때문입니다.
     키는 모델 이름, 프로젝트 전체에 걸리는 지출 한도는 '*' 를 씁니다.
     (한도는 하루가 지나거나 선생님이 올리면 풀리므로 10분 뒤에는 다시 시도해 봅니다.) */
  const HOLD_OFF_MS = 10 * 60 * 1000;
  const holdOff = {};
  function heldOff(model) {
    const h = holdOff['*'] || holdOff[model];
    return (h && (Date.now() - h.at) < HOLD_OFF_MS) ? h : null;
  }
  function isDayLimited(model) { return !!heldOff(aliasOf(model)); }

  /* =========================================================
     모델을 못 찾았을 때(404) 대신 쓸 모델 찾기
     계정·지역에 따라 쓸 수 있는 모델 이름이 달라서, 설정에 적힌 이름이 없으면
     이 키로 실제 쓸 수 있는 같은 종류의 모델로 자동으로 바꿔 씁니다.
     (모델 목록 조회는 생성 요청이 아니라 비용이 들지 않습니다.)
     ========================================================= */
  const MODELS_CACHE_MS = 10 * 60 * 1000;
  let modelsCache = null;                 // { at, names }
  const modelAlias = {};                  // 설정에 적힌 이름 → 이 키에서 실제로 쓰는 이름

  function aliasOf(model) { return modelAlias[model] || model; }
  function getAliases() { return Object.assign({}, modelAlias); }

  async function availableModels() {
    if (modelsCache && (Date.now() - modelsCache.at) < MODELS_CACHE_MS) return modelsCache.names;
    const names = await listModels();
    modelsCache = { at: Date.now(), names };
    return names;
  }

  function roleOf(model) {
    return Object.keys(CFG.MODELS).find(k => CFG.MODELS[k] === model) || null;
  }

  /* 같은 종류로 볼 수 있는 모델인지 — 앞부분(계열)이 같고, 쓰임새가 맞아야 합니다.
     (글자 모델 자리에 그림 모델이 들어가는 일이 없도록 걸러 냅니다.) */
  function sameKind(role, name, model) {
    const family = String(model).split('-')[0];        // gemini / lyria / veo …
    if (name.indexOf(family) !== 0) return false;
    if (role === 'image') return /image/.test(name);
    if (role === 'text')  return !/(image|embedding|aqa|tts|audio|live|video)/.test(name);
    return true;
  }

  /* 앞에서부터 몇 글자가 같은지 — 원래 쓰려던 이름과 가장 비슷한 것을 먼저 고릅니다. */
  function commonPrefixLen(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
  }

  async function findAlternative(model) {
    const role = roleOf(model);
    let names;
    try { names = await availableModels(); } catch (_) { return { pick: null, candidates: [] }; }

    // 1) 설정에 적어 둔 대체 목록(CFG.MODEL_FALLBACKS)을 위에서부터
    const listed = ((CFG.MODEL_FALLBACKS || {})[role] || []).filter(n => n !== model && names.indexOf(n) !== -1);

    // 2) 목록에 없으면 이 키로 쓸 수 있는 같은 종류의 모델 중 이름이 가장 비슷한 것
    const kin = names
      .filter(n => n !== model && sameKind(role, n, model))
      .sort((a, b) => commonPrefixLen(b, model) - commonPrefixLen(a, model));

    const candidates = listed.concat(kin.filter(n => listed.indexOf(n) === -1));
    return { pick: candidates[0] || null, candidates: candidates.slice(0, 8) };
  }

  /* 사용량 초과(429)·일시적 오류(500·503)는 잠깐 기다렸다 스스로 다시 시도합니다.
     다만 이보다 오래 기다려야 한다면 학생을 기다리게 하지 않고 바로 알려 줍니다. */
  const RETRY_WAITS = [8, 20];   // 초
  const MAX_WAIT_SEC = 40;

  const DAY_LIMIT_MSG = '오늘 만들 수 있는 만큼 다 만들었어요. 내일 다시 만들어요.';
  const SPEND_CAP_MSG = '지금은 만들 수 없어요. 선생님께 알려 주세요.';

  /* "이 항목(또는 이 값)은 지원하지 않는다"는 400 응답에서 항목 이름을 뽑아냅니다.
     같은 뜻이라도 모델마다 문구가 달라서 몇 가지 형태를 함께 봅니다.
       · `negativePrompt` isn't supported by this model.
       · dont_allow for personGeneration is currently not supported.
       · personGeneration is not supported. */
  const UNSUPPORTED_PATTERNS = [
    /for\s+[`'"]?([A-Za-z_][A-Za-z0-9_]*)[`'"]?\s+is\s+(?:currently\s+)?not supported/i,
    /[`'"]?([A-Za-z_][A-Za-z0-9_]*)[`'"]?\s+is\s?n['’]?t supported/i,
    /[`'"]?([A-Za-z_][A-Za-z0-9_]*)[`'"]?\s+is\s+(?:currently\s+)?not supported/i
  ];
  function unsupportedField(detail) {
    for (const re of UNSUPPORTED_PATTERNS) {
      const m = (detail || '').match(re);
      if (m) return m[1];
    }
    return null;
  }

  /* 보낼 내용에서 이름이 name 인 항목 하나를 찾아 지웁니다.
     (parameters / generationConfig / instances 안까지 살펴봅니다.) */
  function dropField(body, name) {
    const spots = [body, body.parameters, body.generationConfig].concat(body.instances || []);
    for (const spot of spots) {
      if (spot && typeof spot === 'object' && Object.prototype.hasOwnProperty.call(spot, name)) {
        delete spot[name];
        return true;
      }
    }
    return false;
  }

  async function callModel(model, method, body, timeoutMs, opts) {
    if (!hasKey()) throw new ApiError('API 키가 아직 없어요. 선생님용 설정에서 넣어 주세요.', 'nokey');
    const maxRetries = (opts && opts.retries != null) ? opts.retries : RETRY_WAITS.length;

    // 앞서 이 모델 이름이 없어서 다른 이름으로 바꿔 쓰기로 했다면 그 이름으로 보냅니다.
    let active = aliasOf(model);

    // 방금 한도에 걸린 대상이면 헛되이 기다리지 않고 바로 알려 줍니다.
    // (결제·한도를 새로 손본 뒤 확인할 때처럼 꼭 보내야 하면 force로 건너뜁니다.)
    const held = !(opts && opts.force) && heldOff(active);
    if (held) {
      const cap = held.kind === 'quota-cap';
      lastError = { status: 429, model: active, method,
                    message: cap ? '지출 한도를 넘겨서 요청을 보내지 않았어요.' : '하루 사용량을 다 써서 요청을 보내지 않았어요.',
                    spendCap: cap,
                    quota: { perDay: !cap, perMinute: false, freeTier: false, items: [] } };
      throw new ApiError(cap ? SPEND_CAP_MSG : DAY_LIMIT_MSG, held.kind);
    }

    let dropped = 0;               // 모델이 받지 않아 빼 버린 항목 수
    let switched = false;          // 404 때문에 다른 모델 이름으로 바꿔 봤는지
    let switchInfo = null;         // 바꿔 쓴 사정 (선생님용 안내에 그대로 보여 줍니다)
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs || 60000);
      let res;
      try {
        res = await fetch(`${CFG.API_BASE}/models/${active}:${method}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() },
          body: JSON.stringify(body),
          signal: ctrl.signal
        });
      } catch (e) {
        clearTimeout(timer);
        lastError = { status: 0, message: String((e && e.message) || e), model: active, method };
        throw new ApiError('인터넷 연결을 확인해 주세요.', 'network');
      }
      clearTimeout(timer);

      if (res.ok) { delete holdOff[active]; delete holdOff['*']; return res.json(); }

      let json = null, detail = '';
      try { json = await res.json(); detail = (json.error && json.error.message) || ''; } catch (_) {}
      const quota = res.status === 429 ? quotaInfoOf(json) : null;
      const spendCap = res.status === 429 && isSpendCap(json, detail);
      const asked = retryDelaySec(json);
      lastError = { status: res.status, message: detail || `HTTP ${res.status}`, model: active, method, quota, spendCap, retryAfter: asked };
      if (switchInfo) Object.assign(lastError, switchInfo);   // 모델 이름을 바꿔 쓴 사정도 함께 남깁니다

      // 지출 한도를 넘긴 경우 — 선생님이 한도를 올려야 하므로 기다리지 않습니다.
      // 프로젝트 전체에 걸리므로 다른 모델도 함께 쉬게 합니다.
      if (spendCap) {
        holdOff['*'] = { at: Date.now(), kind: 'quota-cap' };
        throw new ApiError(SPEND_CAP_MSG, 'quota-cap');
      }

      // 하루 한도를 다 쓴 경우 — 기다려도 오늘은 풀리지 않으므로 바로 알려 줍니다.
      if (res.status === 429 && quota && quota.perDay) {
        holdOff[active] = { at: Date.now(), kind: 'quota-day' };
        throw new ApiError(DAY_LIMIT_MSG, 'quota-day');
      }

      // 모델 이름을 못 찾은 경우(404) — 이 키로 쓸 수 있는 같은 종류의 모델로 한 번 바꿔 봅니다.
      // (모델 이름은 계정·지역·시기에 따라 다르기 때문입니다.)
      if (res.status === 404 && !switched) {
        switched = true;
        // 모델 목록을 받아 오는 동안 lastError 가 바뀔 수 있으니, 이 404의 기록을 붙잡아 둡니다.
        const notFound = lastError;
        const alt = await findAlternative(active);
        switchInfo = { tried: active, available: alt.candidates, usedInstead: alt.pick || null };
        lastError = Object.assign(notFound, switchInfo);
        if (alt.pick) {
          modelAlias[model] = alt.pick;
          active = alt.pick;
          attempt--;               // 이름을 바꿔 다시 보내는 것은 재시도 횟수로 세지 않습니다.
          continue;
        }
      }

      // "이 항목은 이 모델에서 지원하지 않는다"고 알려 주면 그 항목만 빼고 곧바로 다시 보냅니다.
      // 모델이 바뀌면서 받지 않게 된 항목 하나 때문에 기능 전체가 멈추지 않도록 하는 안전장치입니다.
      if (res.status === 400 && dropped < 3) {
        const field = unsupportedField(detail);
        if (field && dropField(body, field)) {
          dropped++;
          attempt--;               // 이 재요청은 사용량 초과 재시도 횟수로 세지 않습니다.
          continue;
        }
      }

      const retriable = res.status === 429 || res.status === 500 || res.status === 503;
      const wait = asked || RETRY_WAITS[Math.min(attempt, RETRY_WAITS.length - 1)];
      if (retriable && attempt < maxRetries && wait <= MAX_WAIT_SEC) {
        say(`조금만 더 기다려 주세요… (${wait}초 뒤에 다시 해 볼게요)`);
        await sleep(wait * 1000);
        say(null);
        continue;
      }

      if (res.status === 400 && /API key/i.test(detail)) throw new ApiError('API 키가 올바르지 않아요.', 'nokey');
      if (res.status === 401 || res.status === 403) throw new ApiError('API 키를 확인해 주세요.', 'nokey');
      if (res.status === 429) throw new ApiError('지금은 쉬어야 해요. 조금 뒤에 다시 해 볼까요?', 'rate');
      if (res.status === 404) throw new ApiError('이 기능은 지금 쓸 수 없어요.', 'model');
      throw new ApiError(detail || `요청이 잘 되지 않았어요. (${res.status})`, 'api');
    }
  }

  /* =========================================================
     키 확인하기 — 이 키로 어떤 기능을 쓸 수 있는지 알아봅니다.
     · 모델 목록 조회(GET)는 생성 요청이 아니라서 비용이 들지 않습니다.
     · 글자 모델만 아주 짧은 실제 호출로 한도까지 확인합니다.
     ========================================================= */
  async function listModels() {
    if (!hasKey()) throw new ApiError('API 키가 아직 없어요.', 'nokey');
    const names = [];
    let pageToken = '';
    for (let page = 0; page < 5; page++) {
      const url = `${CFG.API_BASE}/models?pageSize=200${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
      const res = await fetch(url, { headers: { 'x-goog-api-key': key() } });
      if (!res.ok) {
        let detail = '';
        try { const j = await res.json(); detail = (j.error && j.error.message) || ''; } catch (_) {}
        lastError = { status: res.status, message: detail || `HTTP ${res.status}`, model: '(models.list)', method: 'GET' };
        throw new ApiError(detail || `모델 목록을 가져오지 못했어요. (${res.status})`, res.status === 403 ? 'nokey' : 'api');
      }
      const j = await res.json();
      (j.models || []).forEach(m => names.push(String(m.name || '').replace(/^models\//, '')));
      pageToken = j.nextPageToken || '';
      if (!pageToken) break;
    }
    return names;
  }

  async function checkKey() {
    const out = { models: [], available: {}, willUse: {}, text: { ok: false, message: '' } };
    out.models = await listModels();
    modelsCache = { at: Date.now(), names: out.models };   // 방금 받아 온 목록을 그대로 씁니다

    const has = name => out.models.some(m => m === name || m.indexOf(name) === 0);
    Object.keys(CFG.MODELS).forEach(k => {
      const wanted = CFG.MODELS[k];
      if (has(wanted)) { out.available[k] = true; out.willUse[k] = wanted; return; }
      // 설정에 적힌 이름이 없으면, 실제로 쓸 수 있는 같은 종류의 모델을 찾아 둡니다.
      const listed = ((CFG.MODEL_FALLBACKS || {})[k] || []).filter(n => n !== wanted && out.models.indexOf(n) !== -1);
      const kin = out.models
        .filter(n => n !== wanted && sameKind(k, n, wanted))
        .sort((a, b) => commonPrefixLen(b, wanted) - commonPrefixLen(a, wanted));
      const pick = listed[0] || kin[0] || null;
      out.available[k] = !!pick;
      out.willUse[k] = pick;
      if (pick) modelAlias[wanted] = pick;
    });

    // 글자 모델은 짧은 호출로 실제 한도까지 확인 (재시도 없이 한 번만)
    // 결제를 새로 연결한 뒤 바로 확인할 수 있도록, 한도 기억은 무시하고 실제로 보내 봅니다.
    try {
      const t = await askText('"네" 라고만 답해 줘.', { temperature: 0, maxOutputTokens: 10, retries: 0, force: true });
      out.text = { ok: true, message: (t || '').slice(0, 20) };
    } catch (e) {
      out.text = { ok: false, message: (e && e.message) || '실패', kind: (e && e.kind) || 'api',
                   status: lastError ? lastError.status : 0,
                   quota: lastError ? lastError.quota : null,
                   spendCap: !!(lastError && lastError.spendCap) };
    }
    return out;
  }

  /* ---------- 응답 도우미 ---------- */
  function textOf(json) {
    const parts = json && json.candidates && json.candidates[0] &&
                  json.candidates[0].content && json.candidates[0].content.parts;
    if (!parts) return '';
    return parts.filter(p => typeof p.text === 'string').map(p => p.text).join('').trim();
  }

  function inlineImageOf(json) {
    const parts = (json && json.candidates && json.candidates[0] &&
                   json.candidates[0].content && json.candidates[0].content.parts) || [];
    for (const p of parts) {
      const d = p.inlineData || p.inline_data;
      if (d && d.data) return { data: d.data, mimeType: d.mimeType || d.mime_type || 'image/png' };
    }
    return null;
  }

  function parseJson(raw) {
    if (!raw) return null;
    let t = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const s = t.indexOf('['), e = t.lastIndexOf(']');
    const so = t.indexOf('{'), eo = t.lastIndexOf('}');
    try { return JSON.parse(t); } catch (_) {}
    if (s !== -1 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch (_) {} }
    if (so !== -1 && eo > so) { try { return JSON.parse(t.slice(so, eo + 1)); } catch (_) {} }
    return null;
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const buf = new Uint8Array(len);
    for (let i = 0; i < len; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }

  function b64ToBlob(b64, mime) {
    return new Blob([b64ToBytes(b64)], { type: mime || 'application/octet-stream' });
  }

  /* 응답에서 소리 조각 찾기 (노래 모델은 inlineData로 오디오를 돌려줍니다) */
  function inlineAudioOf(json) {
    const cands = (json && json.candidates) || [];
    for (const c of cands) {
      const parts = (c.content && c.content.parts) || [];
      for (const p of parts) {
        const d = p.inlineData || p.inline_data;
        const mime = d && (d.mimeType || d.mime_type || '');
        if (d && d.data && /^audio\//i.test(mime)) return { data: d.data, mimeType: mime };
      }
    }
    return null;
  }

  /* 다듬지 않은 소리(PCM)를 브라우저가 바로 재생할 수 있는 WAV로 감쌉니다.
     모델에 따라 audio/L16;codec=pcm;rate=48000 처럼 껍데기 없는 소리를 주기도 하는데,
     그대로는 <audio> 로 들을 수도, 저장해서 열 수도 없기 때문입니다. */
  function pcmToWav(bytes, rate, channels, bits) {
    const sampleRate = rate || 24000, ch = channels || 1, bitsPer = bits || 16;
    const blockAlign = ch * bitsPer / 8;
    const buf = new ArrayBuffer(44 + bytes.length);
    const view = new DataView(buf);
    const ascii = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    ascii(0, 'RIFF');
    view.setUint32(4, 36 + bytes.length, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    view.setUint32(16, 16, true);              // fmt 조각 길이
    view.setUint16(20, 1, true);               // 1 = PCM
    view.setUint16(22, ch, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPer, true);
    ascii(36, 'data');
    view.setUint32(40, bytes.length, true);
    new Uint8Array(buf, 44).set(bytes);
    return new Blob([buf], { type: 'audio/wav' });
  }

  /* 받아 온 소리를 재생·저장할 수 있는 형태로 만듭니다. */
  function audioBlobOf(b64, mime) {
    const m = String(mime || '').toLowerCase();
    if (/l16|pcm/.test(m)) {
      const rate = Number((m.match(/rate=(\d+)/) || [])[1]) || 24000;
      const ch   = Number((m.match(/channels=(\d+)/) || [])[1]) || 1;
      return pcmToWav(b64ToBytes(b64), rate, ch, 16);
    }
    return b64ToBlob(b64, mime || 'audio/wav');
  }

  /* ---------- 짧은 텍스트 요청 ---------- */
  async function askText(prompt, opts) {
    const o = opts || {};
    const json = await callModel(CFG.MODELS.text, 'generateContent', {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: o.temperature != null ? o.temperature : 1.1,
        maxOutputTokens: o.maxOutputTokens || 700,
        responseMimeType: o.json ? 'application/json' : 'text/plain'
      }
    }, 30000, { retries: o.retries != null ? o.retries : 0, force: !!o.force });
    return textOf(json);
  }

  /* =========================================================
     1) 선택지 자동 생성 — 매번 조금씩 다른 선택지
     실패하면 호출한 쪽에서 CFG.FALLBACK 목록으로 자동 대체합니다.
     ========================================================= */
  async function makeChoices(spec, ctx, count) {
    const n = count || 4;
    const topic = ctx.topic ? ctx.topic.label : '';
    const before = Object.keys(ctx.answers || {})
      .map(k => ctx.answers[k] && ctx.answers[k].label)
      .filter(Boolean).join(', ');

    const prompt =
`너는 특수학교(초등~중등) 학생을 위한 창작 앱의 선택지를 만드는 도우미야.
지금 질문: "${spec.title}" (${spec.ask})
이야기 주제: ${topic || '자유'}
학생이 앞에서 고른 것: ${before || '없음'}

규칙:
- 아주 쉬운 한국어 낱말로 ${n}개. 각 항목은 1~5글자 정도의 짧은 말.
- 밝고 따뜻하고 즐거운 것만. 무섭거나 폭력적이거나 슬픈 것은 절대 넣지 마.
- 서로 뚜렷하게 다른 것으로. 흔한 것 하나쯤은 섞어도 좋아.
- 각 항목에 어울리는 이모지 딱 1개.
- 오늘은 새로운 조합으로 만들어 줘. (무작위 씨앗 ${Math.floor(Math.random() * 100000)})

아래 JSON 배열만 출력해. 다른 말은 쓰지 마.
[{"label":"낱말","emoji":"🙂"}, ...]`;

    const raw = await askText(prompt, { json: true, temperature: 1.35, maxOutputTokens: 400 });
    const arr = parseJson(raw);
    if (!Array.isArray(arr)) throw new ApiError('선택지를 만들지 못했어요.', 'parse');
    const out = arr
      .filter(x => x && typeof x.label === 'string' && x.label.trim())
      .map(x => ({ label: String(x.label).trim().slice(0, 12), emoji: (String(x.emoji || '⭐').match(/\p{Extended_Pictographic}/u) || ['⭐'])[0] }))
      .slice(0, n);
    if (out.length < 2) throw new ApiError('선택지를 만들지 못했어요.', 'parse');
    return out;
  }

  /* =========================================================
     2) 이야기 문장 만들기 — 결과 화면에 보여주고 음성으로 읽어 줌
     ========================================================= */
  async function makeStory(ctx) {
    const picked = describePicks(ctx);
    const prompt =
`특수학교 학생이 고른 내용으로 아주 짧고 따뜻한 이야기를 만들어 줘.

고른 것: ${picked}
${ctx.heroName ? '주인공 이름: ' + ctx.heroName : ''}

규칙:
- 2~3문장, 각 문장은 짧고 쉽게. 초등 저학년도 읽을 수 있는 낱말만.
- 밝고 다정한 내용. 무섭거나 슬픈 내용 금지.
- 소리 내어 읽기 좋은 문장으로. 이야기 문장만 출력하고 다른 설명은 쓰지 마.`;
    const t = await askText(prompt, { temperature: 1.0, maxOutputTokens: 300 });
    return (t || '').trim();
  }

  /* =========================================================
     3) 작품 이름 제안 3개
     ========================================================= */
  async function suggestTitles(ctx) {
    const prompt =
`아래 내용으로 만든 어린이 작품의 제목을 3개 제안해 줘.

내용: ${describePicks(ctx)}
${ctx.story ? '이야기: ' + ctx.story : ''}

규칙: 아주 쉬운 한국어, 각 3~10글자, 밝고 다정한 느낌.
JSON 배열만 출력: ["제목1","제목2","제목3"]`;
    const raw = await askText(prompt, { json: true, temperature: 1.2, maxOutputTokens: 200 });
    const arr = parseJson(raw);
    if (!Array.isArray(arr)) throw new ApiError('이름을 만들지 못했어요.', 'parse');
    return arr.filter(x => typeof x === 'string').map(s => s.trim().slice(0, 20)).slice(0, 3);
  }

  /* =========================================================
     4) 내 그림 설명받기 (정답이 아니라 하나의 의견)
     ========================================================= */
  async function describeDrawing(att) {
    const json = await callModel(CFG.MODELS.text, 'generateContent', {
      contents: [{ role: 'user', parts: [
        { text:
`이 그림을 보고 어린 학생에게 다정하게 이야기해 줘.
- 2문장으로 짧게. 아주 쉬운 낱말만.
- "이건 ~처럼 보여요" 같은 말투로. 단정하지 말고 부드럽게.
- 잘 그렸는지 평가하지 말고, 보이는 것만 따뜻하게 말해 줘.
- 설명 문장만 출력해.` },
        { inline_data: { mime_type: att.mimeType, data: att.base64 } }
      ] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 200 }
    }, 40000, { retries: 0 });
    return textOf(json);
  }

  /* =========================================================
     5) 프롬프트 다듬기 — 한국어 선택 → 모델이 잘 알아듣는 형태 + 안전 지시어
     ========================================================= */
  function localPrompt(ctx) {
    const picks = describePicks(ctx);
    return `A children's illustration about: ${picks}. ${SAFE_STYLE}`;
  }

  async function refinePrompt(ctx) {
    try {
      const t = await askText(
`아래 한국어 내용을 이미지 생성 모델에 넣을 영어 프롬프트 한 문장으로 바꿔 줘.
내용: ${describePicks(ctx)}
${ctx.heroName ? '주인공 이름: ' + ctx.heroName : ''}
규칙: 영어 한 문장, 40단어 이내, 장면 묘사 중심. 설명이나 따옴표 없이 문장만 출력.`,
        { temperature: 0.8, maxOutputTokens: 160 });
      const one = (t || '').replace(/\s+/g, ' ').trim();
      if (one.length < 10) return localPrompt(ctx);
      return `${one} ${SAFE_STYLE}`;
    } catch (_) {
      return localPrompt(ctx);   // 실패해도 앱이 멈추지 않게
    }
  }

  function describePicks(ctx) {
    const bits = [];
    if (ctx.topic) bits.push(`장소: ${ctx.topic.label}`);
    (ctx.questionOrder || []).forEach(qid => {
      const a = ctx.answers[qid];
      const spec = (ctx.questions || []).find(q => q.id === qid);
      if (a) bits.push(`${spec ? spec.ask : qid}: ${a.label}`);
    });
    if (ctx.heroName) bits.push(`주인공 이름: ${ctx.heroName}`);
    return bits.join(', ');
  }

  /* =========================================================
     6) 그림 만들기 / 내 그림 바꾸기
     ========================================================= */
  async function generateImage(prompt, att) {
    const parts = [{ text: prompt }];
    if (att) parts.push({ inline_data: { mime_type: att.mimeType, data: att.base64 } });

    const json = await callModel(CFG.MODELS.image, 'generateContent', {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 1.0 }
    }, 150000);

    const img = inlineImageOf(json);
    if (!img) throw new ApiError('그림을 만들지 못했어요. 다시 해 볼까요?', 'empty');
    return b64ToBlob(img.data, img.mimeType);
  }

  const EDIT_INSTRUCTION = {
    '색칠하기':   'Keep the exact same drawing, shapes and lines from the attached child\'s drawing, and fill it in with soft warm colors. Do not add new objects.',
    '배경 넣기':  'Keep the attached child\'s drawing exactly as the main subject, and add a gentle, simple background scene behind it.',
    '반짝이게':   'Keep the attached child\'s drawing as it is, and add soft sparkles and a warm gentle glow around it.',
    '만화처럼':   'Redraw the attached child\'s drawing in a friendly, simple cartoon style, keeping the same subject, pose and idea.'
  };

  async function editImage(att, changeLabel, ctx) {
    const instr = EDIT_INSTRUCTION[changeLabel] ||
      'Gently improve the attached child\'s drawing while keeping the original idea.';
    const extra = ctx && ctx.topic ? ` The scene can gently suggest ${ctx.topic.label}.` : '';
    return generateImage(`${instr}${extra} ${SAFE_STYLE}`, att);
  }

  /* =========================================================
     7) 노래 만들기 (lyria-3-clip-preview)
     이 노래 모델은 generateContent 로 부르고, 소리는 inlineData 로 돌아옵니다.
     (predict 로 부르면 "predict 는 지원하지 않는다"는 뜻의 404가 납니다.)
     예전 방식(predict)만 되는 모델로 바뀔 때를 대비해 그쪽도 한 번 더 시도합니다.
     ========================================================= */
  async function generateMusic(ctx) {
    const bits = [];
    (ctx.questionOrder || []).forEach(qid => {
      const a = ctx.answers[qid];
      if (a) bits.push(a.label);
    });
    const koPrompt = `${ctx.topic ? ctx.topic.label + ' 느낌, ' : ''}${bits.join(', ')}`;
    let prompt;
    try {
      const t = await askText(
`아래 한국어 내용을 음악 생성 모델용 영어 프롬프트 한 문장으로 바꿔 줘.
내용: ${koPrompt}
규칙: 영어 한 문장, 30단어 이내. 분위기·빠르기·악기를 담아. 문장만 출력.`,
        { temperature: 0.8, maxOutputTokens: 120 });
      prompt = (t || '').replace(/\s+/g, ' ').trim();
    } catch (_) { prompt = ''; }
    if (prompt.length < 8) prompt = `A gentle instrumental piece: ${bits.join(', ')}`;
    prompt += ' Warm, cheerful, calm instrumental music suitable for young children. ' +
              'No lyrics, no vocals. Avoid harsh, loud, scary, distorted or sad sounds.';

    try {
      const json = await callModel(CFG.MODELS.music, 'generateContent', {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['AUDIO', 'TEXT'] }
      }, 200000);
      const audio = inlineAudioOf(json);
      if (audio) return audioBlobOf(audio.data, audio.mimeType);
      throw new ApiError('노래를 만들지 못했어요. 다시 해 볼까요?', 'empty');
    } catch (e) {
      // 모델을 못 찾은 경우에만 예전 방식(predict)으로 한 번 더 해 봅니다.
      if (!e || e.kind !== 'model') throw e;
    }

    const json = await callModel(CFG.MODELS.music, 'predict', {
      instances: [{ prompt, negative_prompt: 'harsh, loud, scary, distorted, sad' }],
      parameters: { sample_count: 1 }
    }, 200000);

    const pred = (json.predictions && json.predictions[0]) || json.prediction || null;
    const b64 = pred && (pred.bytesBase64Encoded || pred.audioContent || pred.audio || pred.data);
    if (!b64) throw new ApiError('노래를 만들지 못했어요. 다시 해 볼까요?', 'empty');
    const mime = (pred && (pred.mimeType || pred.mime_type)) || 'audio/wav';
    return audioBlobOf(b64, mime);
  }

  /* =========================================================
     8) 영상 만들기 (veo, 오래 걸리는 작업 → 상태 확인 반복)
     ========================================================= */
  async function generateVideo(prompt, att, onTick) {
    // 이 영상 모델은 negativePrompt·personGeneration 항목을 받지 않습니다.
    // 그래서 사람이나 무서운 장면을 피하라는 내용도 프롬프트 안에 적어 보냅니다.
    const instance = { prompt: prompt + AVOID_TEXT };
    if (att) instance.image = { bytesBase64Encoded: att.base64, mimeType: att.mimeType };

    const start = await callModel(CFG.MODELS.video, 'predictLongRunning', {
      instances: [instance],
      parameters: { aspectRatio: '16:9', sampleCount: 1 }
    }, 60000);

    const opName = start.name;
    if (!opName) throw new ApiError('영상 만들기를 시작하지 못했어요.', 'empty');

    const deadline = Date.now() + 6 * 60 * 1000;   // 최대 6분 기다림
    let op = start;
    while (!op.done) {
      if (Date.now() > deadline) throw new ApiError('영상 만들기가 너무 오래 걸려요. 나중에 다시 해 볼까요?', 'timeout');
      await new Promise(r => setTimeout(r, 8000));
      if (onTick) onTick();
      const res = await fetch(`${CFG.API_BASE}/${opName}`, { headers: { 'x-goog-api-key': key() } });
      if (!res.ok) throw new ApiError('영상 상태를 확인하지 못했어요.', 'api');
      op = await res.json();
    }
    if (op.error) throw new ApiError(op.error.message || '영상을 만들지 못했어요.', 'api');

    const r = op.response || {};
    const samples = (r.generateVideoResponse && (r.generateVideoResponse.generatedSamples || r.generateVideoResponse.generated_samples)) ||
                    r.generatedSamples || r.videos || [];
    const first = samples[0] || null;
    const uri = first && ((first.video && (first.video.uri || first.video.url)) || first.uri || first.url);
    const inline = first && (first.bytesBase64Encoded || (first.video && first.video.bytesBase64Encoded));

    if (inline) return b64ToBlob(inline, 'video/mp4');
    if (!uri) throw new ApiError('영상을 만들지 못했어요. 다시 해 볼까요?', 'empty');

    const dl = await fetch(uri, { headers: { 'x-goog-api-key': key() } });
    if (!dl.ok) throw new ApiError('영상을 가져오지 못했어요.', 'api');
    return dl.blob();
  }

  /* =========================================================
     9) 그림책 만들기 — 장면 3~4개의 문장 + 그림
     ========================================================= */
  async function makeBookScenes(ctx, pageCount) {
    const n = pageCount || 3;
    const prompt =
`특수학교 학생이 고른 내용으로 ${n}장짜리 그림책을 만들 거야.

고른 것: ${describePicks(ctx)}

각 장면마다:
- "text": 한국어 한 문장. 아주 쉽고 짧게(15자 안팎). 밝고 따뜻하게.
- "image": 그 장면을 그리기 위한 영어 묘사 한 문장(30단어 이내).
처음-가운데-끝이 자연스럽게 이어지게 해 줘. 무섭거나 슬픈 내용 금지.

JSON 배열만 출력: [{"text":"...","image":"..."}, ...]`;
    const raw = await askText(prompt, { json: true, temperature: 1.1, maxOutputTokens: 900 });
    const arr = parseJson(raw);
    if (!Array.isArray(arr) || !arr.length) throw new ApiError('이야기를 만들지 못했어요.', 'parse');
    return arr.slice(0, n).map((s, i) => ({
      text: (s && s.text) ? String(s.text).trim() : `${i + 1}번째 장면이에요.`,
      image: (s && s.image) ? String(s.image).trim() : localPrompt(ctx)
    }));
  }

  return {
    hasKey, ApiError, askText, getLastError, setStatusHandler, checkKey, listModels, isDayLimited,
    getAliases,
    makeChoices, makeStory, suggestTitles, describeDrawing,
    refinePrompt, localPrompt, describePicks,
    generateImage, editImage, generateMusic, generateVideo,
    makeBookScenes, SAFE_STYLE
  };
})();
