/* =========================================================
   api.js — Gemini API 호출 모음
   · 텍스트/선택지/이야기/이름 제안/그림 설명 : gemini-3.1-flash-lite
   · 그림 만들기·바꾸기                      : gemini-3.1-flash-lite-image
   · 노래                                    : lyria-3-clip-preview
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

  const NEGATIVE = 'scary, violent, sad, dark, horror, weapon, blood, realistic photo of a real person, text, watermark';

  function key() { return (Store.get('apiKey') || '').trim(); }
  function hasKey() { return key().length > 0; }

  class ApiError extends Error {
    constructor(message, kind) { super(message); this.kind = kind || 'api'; }
  }

  async function callModel(model, method, body, timeoutMs) {
    if (!hasKey()) throw new ApiError('API 키가 아직 없어요. 선생님용 설정에서 넣어 주세요.', 'nokey');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 60000);
    let res;
    try {
      res = await fetch(`${CFG.API_BASE}/models/${model}:${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
    } catch (e) {
      clearTimeout(timer);
      throw new ApiError('인터넷 연결을 확인해 주세요.', 'network');
    }
    clearTimeout(timer);
    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = (j.error && j.error.message) || ''; } catch (_) {}
      if (res.status === 400 && /API key/i.test(detail)) throw new ApiError('API 키가 올바르지 않아요.', 'nokey');
      if (res.status === 401 || res.status === 403) throw new ApiError('API 키를 확인해 주세요.', 'nokey');
      if (res.status === 429) throw new ApiError('잠시 뒤에 다시 해 주세요. (사용량이 많아요)', 'rate');
      throw new ApiError(detail || `요청이 잘 되지 않았어요. (${res.status})`, 'api');
    }
    return res.json();
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

  function b64ToBlob(b64, mime) {
    const bin = atob(b64);
    const len = bin.length;
    const buf = new Uint8Array(len);
    for (let i = 0; i < len; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: mime || 'application/octet-stream' });
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
    }, 30000);
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
    }, 40000);
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
    prompt += ' Warm, cheerful, calm instrumental music suitable for young children. No lyrics, no vocals.';

    const json = await callModel(CFG.MODELS.music, 'predict', {
      instances: [{ prompt, negative_prompt: 'harsh, loud, scary, distorted, sad' }],
      parameters: { sample_count: 1 }
    }, 200000);

    const pred = (json.predictions && json.predictions[0]) || json.prediction || null;
    const b64 = pred && (pred.bytesBase64Encoded || pred.audioContent || pred.audio || pred.data);
    if (!b64) throw new ApiError('노래를 만들지 못했어요. 다시 해 볼까요?', 'empty');
    const mime = (pred && (pred.mimeType || pred.mime_type)) || 'audio/wav';
    return b64ToBlob(b64, mime);
  }

  /* =========================================================
     8) 영상 만들기 (veo, 오래 걸리는 작업 → 상태 확인 반복)
     ========================================================= */
  async function generateVideo(prompt, att, onTick) {
    const instance = { prompt };
    if (att) instance.image = { bytesBase64Encoded: att.base64, mimeType: att.mimeType };

    const start = await callModel(CFG.MODELS.video, 'predictLongRunning', {
      instances: [instance],
      parameters: { aspectRatio: '16:9', sampleCount: 1, personGeneration: 'dont_allow', negativePrompt: NEGATIVE }
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
    hasKey, ApiError, askText,
    makeChoices, makeStory, suggestTitles, describeDrawing,
    refinePrompt, localPrompt, describePicks,
    generateImage, editImage, generateMusic, generateVideo,
    makeBookScenes, SAFE_STYLE
  };
})();
