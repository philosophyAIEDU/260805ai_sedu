/* =========================================================
   app.js — 화면 흐름
   홈 → 주제 → 질문들 → 개인화(그림 첨부/이름) → 확인 → 만드는 중 → 결과
   ========================================================= */

const App = (() => {
  const el = UI.el;

  /* 지금 만들고 있는 것 (모두 이 브라우저 안에만 있습니다) */
  let ctx = null;
  let flow = [];       // 단계 목록
  let pos = 0;         // 지금 단계
  let backToConfirm = false;   // 확인 화면에서 "다시 고르기"로 들어왔는지

  /* ================= 새로 시작 ================= */
  function newCtx(mode) {
    return {
      mode,
      topic: null,
      questions: [],
      questionOrder: [],
      answers: {},
      choices: {},        // 질문마다 만들어 둔 선택지 (뒤로 가도 그대로)
      attachment: null,
      heroName: '',
      pageCount: 3,
      story: '',
      title: '',
      result: null,
      savedId: null
    };
  }

  function buildFlow(mode) {
    const steps = [];
    if (mode === 'edit') {
      steps.push({ kind: 'attach', label: '내 그림 올리기' });
      CFG.QUESTIONS.edit.forEach(q => steps.push({ kind: 'question', spec: q, label: '바꿀 방법 고르기' }));
    } else {
      steps.push({ kind: 'topic', label: '주제 고르기' });
      const qs = mode === 'song' ? CFG.QUESTIONS.song : CFG.QUESTIONS.make;
      qs.forEach(q => steps.push({ kind: 'question', spec: q, label: shortLabel(q) }));
      if (mode === 'book') steps.push({ kind: 'pages', label: '몇 장으로 만들까요' });
      if (mode === 'song') steps.push({ kind: 'name', label: '주인공 이름 짓기' });
      else steps.push({ kind: 'attach', label: '내 그림 넣기' });
    }
    steps.push({ kind: 'confirm', label: '확인하기' });
    return steps;
  }

  function shortLabel(q) {
    return { hero: '주인공 고르기', act: '행동 고르기', mood: '기분 고르기', color: '색 고르기',
             tempo: '빠르기 고르기', inst: '악기 고르기', where: '장소 고르기', change: '바꿀 방법 고르기' }[q.id] || '고르기';
  }

  /* ================= 홈 ================= */
  function goHome() {
    Speech.stop();
    ctx = null;
    Panels.setHelp('home');
    UI.setBack(null);
    UI.setStep('무엇을 만들까요?');

    const remaining = Store.videoRemaining();
    const limit = Number(Store.get('videoDailyLimit')) || 0;
    const features = Store.all().features;

    const cards = CFG.MODES.filter(m => features[m.id]).map(m => {
      if (m.id === 'video') {
        const locked = limit === 0;
        const out = remaining <= 0;
        return UI.card({
          emoji: m.emoji,
          label: m.label,
          desc: m.desc,
          note: locked ? '오늘은 쉬어가요' : `오늘 남은 횟수: ${remaining}번`,
          theme: m.theme,
          disabled: locked || out,
          ariaLabel: `${m.label}. ${m.desc}. ${locked || out ? '오늘 영상은 다 만들었어요.' : '오늘 남은 횟수 ' + remaining + '번'}`,
          onDisabled: () => softMessage('오늘 영상은 다 만들었어요. 내일 또 만들어요!'),
          onClick: () => start(m.id)
        });
      }
      return UI.card({
        emoji: m.emoji, label: m.label, desc: m.desc, theme: m.theme,
        onClick: () => start(m.id)
      });
    });

    UI.render([
      UI.title('무엇을 만들까요?', '누르면 만들기가 시작돼요. 언제든 뒤로 갈 수 있어요.'),
      UI.grid(cards),
      el('div', { class: 'actions' }, [
        UI.btn('🗂 작품 보관함', { kind: 'sky', onClick: () => Panels.openGallery() }),
        UI.btn('❓ 사용법 다시 보기', { onClick: () => Panels.openOnboarding() })
      ]),
      API.hasKey() ? null : el('div', {}, [
        UI.notice('아직 준비가 덜 되었어요. 선생님, 먼저 Gemini API 키를 넣어 주세요. ' +
                  '(키가 없어도 고르기 연습은 할 수 있어요.)', 'info', '🧑‍🏫'),
        el('div', { class: 'actions', style: 'margin-top:0;' }, [
          UI.btn('🔑 API 키 넣기', { kind: 'primary', onClick: () => Panels.openApiKeySetup(),
                                    ariaLabel: 'Gemini API 키 입력 화면 열기' })
        ])
      ])
    ]);
  }

  function softMessage(text) {
    UI.announce(text);
    const box = el('div', { class: 'notice', style: 'max-width:640px; margin:18px auto;' }, [
      el('span', { class: 'notice__icon', 'aria-hidden': 'true', text: '🌙' }),
      el('span', { text: text })
    ]);
    const holder = UI.screenEl.querySelector('.grid');
    if (holder) holder.insertAdjacentElement('afterend', box);
    setTimeout(() => box.remove(), 6000);
  }

  function start(mode) {
    ctx = newCtx(mode);
    flow = buildFlow(mode);
    pos = 0;
    backToConfirm = false;
    ctx.questions = flow.filter(s => s.kind === 'question').map(s => s.spec);
    ctx.questionOrder = ctx.questions.map(q => q.id);
    go(0);
  }

  /* ================= 단계 이동 ================= */
  function go(next) {
    pos = Math.max(0, Math.min(flow.length - 1, next));
    const step = flow[pos];
    const total = flow.length;
    UI.setStep(step.label, pos + 1, total);
    UI.setBack(() => {
      if (backToConfirm) { backToConfirm = false; go(flow.length - 1); return; }
      if (pos === 0) goHome(); else go(pos - 1);
    });

    if (step.kind === 'topic')    return screenTopic();
    if (step.kind === 'question') return screenQuestion(step.spec);
    if (step.kind === 'pages')    return screenPages();
    if (step.kind === 'attach')   return screenAttach();
    if (step.kind === 'name')     return screenName();
    if (step.kind === 'confirm')  return screenConfirm();
  }

  function advance() {
    if (backToConfirm) { backToConfirm = false; go(flow.length - 1); return; }
    go(pos + 1);
  }

  /* ================= 1) 주제 ================= */
  function screenTopic() {
    Panels.setHelp('topic');
    const cards = CFG.TOPICS.map(t => UI.card({
      emoji: t.emoji, label: t.label, desc: t.desc, theme: t.theme,
      chosen: ctx.topic && ctx.topic.id === t.id,
      onClick: () => {
        if (!ctx.topic || ctx.topic.id !== t.id) ctx.choices = {};   // 주제가 바뀌면 선택지도 새로
        ctx.topic = t;
        advance();
      }
    }));
    UI.render([
      UI.title('어디에서 일어나는 이야기인가요?', '마음에 드는 곳을 눌러 보세요.'),
      UI.grid(cards)
    ]);
  }

  /* ================= 2) 질문 ================= */
  async function screenQuestion(spec) {
    Panels.setHelp('question');
    const count = Number(Store.get('choiceCount')) || 4;

    // 이미 만들어 둔 선택지가 있으면 그대로 씁니다(뒤로 갔다 와도 그대로).
    if (!ctx.choices[spec.id] || ctx.choices[spec.id].length < count) {
      renderQuestion(spec, null, false);
      const list = await loadChoices(spec, count);
      ctx.choices[spec.id] = list;
    }
    renderQuestion(spec, ctx.choices[spec.id].slice(0, count), true);
  }

  async function loadChoices(spec, count) {
    // 그림 바꾸기의 "무엇을 바꿀까요"는 정해진 4가지만 씁니다.
    if (spec.id === 'change') return CFG.FALLBACK.change._any.slice(0, 4);
    try {
      if (!API.hasKey()) throw new Error('nokey');
      return await API.makeChoices(spec, ctx, count);
    } catch (_) {
      return fallbackFor(spec, count);          // 오프라인·실패해도 앱이 멈추지 않아요
    }
  }

  function fallbackFor(spec, count) {
    const key = (ctx.mode === 'song' && spec.id === 'mood') ? 'songmood' : spec.id;
    const table = CFG.FALLBACK[key] || {};
    const topicId = ctx.topic ? ctx.topic.id : '_any';
    const pool = (table[topicId] || table._any || []).slice();
    // 매번 조금 다르게 보이도록 순서를 섞습니다.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  function renderQuestion(spec, choices, ready) {
    const themes = ['peach', 'mint', 'sky', 'lilac', 'butter', 'rose'];
    let body;
    if (!ready) {
      body = el('div', { class: 'making', style: 'padding:20px 0;' }, [
        el('div', { class: 'wave-jar' }, [
          el('div', { class: 'wave-jar__fill' }),
          el('div', { class: 'wave-jar__emoji', 'aria-hidden': 'true', text: '🤔' })
        ]),
        el('p', { class: 'making__msg', text: '고를 것을 준비하고 있어요…' })
      ]);
    } else {
      body = UI.grid(choices.map((c, i) => UI.card({
        emoji: c.emoji, label: c.label, theme: themes[i % themes.length],
        chosen: ctx.answers[spec.id] && ctx.answers[spec.id].label === c.label,
        onClick: () => { ctx.answers[spec.id] = c; advance(); }
      })));
    }

    UI.render([
      UI.title(spec.title, ready ? '하나를 골라 주세요. 틀린 답은 없어요.' : ' '),
      body,
      ready ? el('div', { class: 'actions' }, [
        UI.btn('🔁 다른 것 보여주세요', {
          onClick: async () => {
            delete ctx.choices[spec.id];
            screenQuestion(spec);
          }
        })
      ]) : null
    ]);
  }

  /* ================= 3) 그림책 장수 ================= */
  function screenPages() {
    Panels.setHelp('question');
    UI.render([
      UI.title('그림책을 몇 장으로 만들까요?', '장수가 많으면 조금 더 오래 걸려요.'),
      UI.grid([
        UI.card({ emoji: '📗', label: '3장', desc: '짧고 빠르게 만들어요', theme: 'mint',
          chosen: ctx.pageCount === 3, onClick: () => { ctx.pageCount = 3; advance(); } }),
        UI.card({ emoji: '📘', label: '4장', desc: '조금 더 긴 이야기예요', theme: 'sky',
          chosen: ctx.pageCount === 4, onClick: () => { ctx.pageCount = 4; advance(); } })
      ])
    ]);
  }

  /* ================= 4) 그림 첨부 ================= */
  function screenAttach() {
    const required = ctx.mode === 'edit';
    Panels.setHelp(required ? 'attachEdit' : 'attach');

    const fileInput = el('input', {
      type: 'file', accept: 'image/*', style: 'display:none',
      'aria-label': '그림 파일 고르기'
    });
    const cameraInput = el('input', {
      type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none',
      'aria-label': '그림 사진 찍기'
    });

    const preview = el('div', { class: 'attach-box' });
    const opinionBox = el('div', {});

    function drawPreview() {
      preview.innerHTML = '';
      opinionBox.innerHTML = '';
      if (ctx.attachment) {
        preview.appendChild(el('img', { class: 'attach-preview', src: ctx.attachment.dataUrl, alt: '내가 올린 그림' }));
        preview.appendChild(el('p', { text: '이 그림으로 만들게요.' }));
        preview.appendChild(el('div', { class: 'actions', style: 'margin-top:6px;' }, [
          UI.btn('다른 그림으로 바꾸기', { onClick: () => fileInput.click() }),
          UI.btn('🔍 이 그림 설명 들어보기', { kind: 'mint', onClick: describe })
        ]));
      } else {
        preview.appendChild(el('div', { style: 'font-size:3em;', 'aria-hidden': 'true', text: '🖼️' }));
        preview.appendChild(el('p', { text: required ? '바꾸고 싶은 내 그림을 올려 주세요.' : '내가 그린 그림을 넣으면 그 그림이 주인공이 돼요.' }));
        preview.appendChild(el('div', { class: 'actions', style: 'margin-top:6px;' }, [
          UI.btn('📷 사진 찍기', { kind: 'primary', onClick: () => cameraInput.click() }),
          UI.btn('📁 파일에서 고르기', { kind: 'sky', onClick: () => fileInput.click() })
        ]));
      }
    }

    async function handleFile(input) {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        ctx.attachment = await UI.fileToAttachment(file);
        UI.announce('그림을 올렸어요.');
        drawPreview();
        renderAll();
      } catch (e) {
        opinionBox.innerHTML = '';
        opinionBox.appendChild(UI.notice(e.message || '그림을 읽지 못했어요. 다른 그림으로 해 볼까요?', null, '🙂'));
      }
      input.value = '';
    }

    fileInput.addEventListener('change', () => handleFile(fileInput));
    cameraInput.addEventListener('change', () => handleFile(cameraInput));

    async function describe() {
      if (!ctx.attachment) return;
      opinionBox.innerHTML = '';
      opinionBox.appendChild(UI.notice('그림을 보고 있어요…', 'info', '👀'));
      let text = '';
      try {
        text = await API.describeDrawing(ctx.attachment);
      } catch (e) {
        text = '';
      }
      opinionBox.innerHTML = '';
      if (!text) {
        opinionBox.appendChild(UI.notice('지금은 설명을 들을 수 없어요. 괜찮아요, 그냥 계속 만들어도 돼요.', null, '🙂'));
        return;
      }
      opinionBox.appendChild(el('div', { class: 'story-box' }, [
        el('p', { text: text }),
        el('p', { style: 'font-size:.8em; color:var(--ink-faint); margin-top:10px;',
                  text: '※ 이건 정답이 아니라 컴퓨터의 생각이에요. 내가 그린 뜻과 다를 수 있어요. 내 생각이 맞아요!' }),
        Speech.supported ? UI.btn('🔊 읽어주기', { kind: 'mint', onClick: () => Speech.speak(text) }) : null
      ]));
      UI.announce('그림 설명이 나왔어요.');
    }

    function renderAll() {
      const canNext = !required || !!ctx.attachment;
      UI.render([
        UI.title(required ? '바꾸고 싶은 그림을 올려 주세요' : '내가 그린 그림을 넣을까요?',
                 required ? '그림이 꼭 필요해요.' : '넣지 않아도 괜찮아요. 건너뛰기를 눌러도 돼요.'),
        UI.notice('학생 얼굴 사진이나 목소리는 올리지 마세요. 직접 그린 그림만 사용해요.', 'privacy', '🔒'),
        preview,
        fileInput, cameraInput,
        opinionBox,
        el('div', { class: 'actions' }, [
          required ? null : UI.btn('건너뛰기', { onClick: () => { ctx.attachment = null; advance(); } }),
          UI.btn('다음', {
            kind: 'primary',
            onClick: () => {
              if (!canNext) { UI.announce('그림을 먼저 올려 주세요.'); return; }
              advance();
            },
            ariaLabel: canNext ? '다음으로' : '그림을 올려야 다음으로 갈 수 있어요'
          })
        ])
      ]);
      drawPreview();
    }

    renderAll();
    drawPreview();
  }

  /* ================= 5) 주인공 이름 (노래) ================= */
  function screenName() {
    Panels.setHelp('name');
    const input = el('input', {
      class: 'input', type: 'text', maxlength: '12',
      value: ctx.heroName || '', placeholder: '예: 방울이',
      'aria-label': '주인공 이름'
    });
    UI.render([
      UI.title('주인공 이름을 지어 줄까요?', '안 써도 괜찮아요.'),
      el('div', { class: 'field', style: 'max-width:520px; margin:0 auto;' }, [
        el('label', { class: 'field__label', text: '주인공 이름' }),
        input,
        el('p', { class: 'field__hint', text: '별명을 써도 좋아요. 진짜 이름은 안 써도 돼요.' })
      ]),
      UI.notice('내가 쓴 이름은 이 기기 안에만 저장돼요.', 'privacy', '🔒'),
      el('div', { class: 'actions' }, [
        UI.btn('건너뛰기', { onClick: () => { ctx.heroName = ''; advance(); } }),
        UI.btn('다음', { kind: 'primary', onClick: () => { ctx.heroName = input.value.trim().slice(0, 12); advance(); } })
      ])
    ]);
  }

  /* ================= 6) 확인 ================= */
  function screenConfirm() {
    Panels.setHelp('confirm');
    const rows = [];

    function rowFor(o) {
      const b = el('button', {
        type: 'button', class: 'summary-item',
        'aria-label': `${o.q}: ${o.a}. 누르면 다시 고를 수 있어요.`
      }, [
        o.thumb ? el('img', { class: 'summary-item__thumb', src: o.thumb, alt: '내가 올린 그림' })
                : el('span', { class: 'summary-item__emoji', 'aria-hidden': 'true', text: o.emoji || '⭐' }),
        el('span', { class: 'summary-item__body' }, [
          el('span', { class: 'summary-item__q', text: o.q }),
          el('span', { class: 'summary-item__a', text: o.a })
        ]),
        el('span', { class: 'summary-item__edit', text: '다시 고르기 ›' })
      ]);
      b.addEventListener('click', () => { Store.beep('tap'); backToConfirm = true; go(o.step); });
      return b;
    }

    flow.forEach((step, i) => {
      if (step.kind === 'topic' && ctx.topic) {
        rows.push(rowFor({ q: '이야기가 펼쳐질 곳', a: ctx.topic.label, emoji: ctx.topic.emoji, step: i }));
      }
      if (step.kind === 'question') {
        const a = ctx.answers[step.spec.id];
        if (a) rows.push(rowFor({ q: step.spec.ask, a: a.label, emoji: a.emoji, step: i }));
      }
      if (step.kind === 'pages') {
        rows.push(rowFor({ q: '그림책 장수', a: `${ctx.pageCount}장`, emoji: '📖', step: i }));
      }
      if (step.kind === 'name') {
        rows.push(rowFor({ q: '주인공 이름', a: ctx.heroName || '(안 지었어요)', emoji: '🏷️', step: i }));
      }
      if (step.kind === 'attach') {
        rows.push(rowFor({
          q: '내가 올린 그림', a: ctx.attachment ? '올렸어요' : '(안 올렸어요)',
          emoji: '🖼️', thumb: ctx.attachment ? ctx.attachment.dataUrl : null, step: i
        }));
      }
    });

    const mode = CFG.MODES.find(m => m.id === ctx.mode);
    UI.render([
      UI.title('이렇게 만들까요?', '바꾸고 싶은 줄을 누르면 그것만 다시 고를 수 있어요.'),
      el('div', { class: 'summary-list' }, rows),
      ctx.mode === 'video'
        ? UI.notice(`영상은 만드는 데 시간이 걸려요. 다 만들면 오늘 남은 횟수가 ${Math.max(0, Store.videoRemaining() - 1)}번이 돼요.`, 'info', '🎬')
        : null,
      el('div', { class: 'actions' }, [
        UI.btn('처음으로', { onClick: goHome }),
        UI.btn(`${mode.emoji} 이렇게 만들래요`, { kind: 'primary', onClick: startMaking })
      ])
    ]);
  }

  /* ================= 7) 만드는 중 ================= */
  const MAKING_MSGS = {
    image: ['색을 고르고 있어요…', '그림을 그리고 있어요…', '조금만 더 기다려 주세요…', '거의 다 됐어요…'],
    edit:  ['그림을 보고 있어요…', '색을 칠하고 있어요…', '조금만 더 기다려 주세요…', '거의 다 됐어요…'],
    song:  ['악기를 준비하고 있어요…', '멜로디를 만들고 있어요…', '노래를 다듬고 있어요…', '거의 다 됐어요…'],
    video: ['장면을 생각하고 있어요…', '영상을 찍고 있어요…', '영상은 시간이 조금 걸려요…', '조금만 더 기다려 주세요…'],
    book:  ['이야기를 짓고 있어요…', '첫 번째 그림을 그려요…', '다음 그림을 그려요…', '책을 묶고 있어요…']
  };

  let makingTimer = null;

  function screenMaking() {
    Panels.setHelp('making');
    UI.setBack(null);
    UI.setStep('만드는 중이에요');
    const msgs = MAKING_MSGS[ctx.mode] || MAKING_MSGS.image;
    const msgEl = el('p', { class: 'making__msg', text: msgs[0], 'aria-live': 'polite' });
    const dots = el('div', { class: 'progress-dots' },
      msgs.map((_, i) => el('i', { class: i === 0 ? 'on' : '', 'aria-hidden': 'true' })));

    UI.render([
      el('div', { class: 'making' }, [
        el('div', { class: 'wave-jar' }, [
          el('div', { class: 'wave-jar__fill' }),
          el('div', { class: 'wave-jar__emoji', 'aria-hidden': 'true',
                      text: (CFG.MODES.find(m => m.id === ctx.mode) || {}).emoji || '✨' })
        ]),
        msgEl,
        el('p', { class: 'making__sub', text: '기다리는 동안 화면을 그대로 두어 주세요.' }),
        dots
      ])
    ]);

    let i = 0;
    clearInterval(makingTimer);
    makingTimer = setInterval(() => {
      i = Math.min(msgs.length - 1, i + 1);
      msgEl.textContent = msgs[i];
      dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k <= i));
    }, ctx.mode === 'video' ? 12000 : 6000);

    // 사용량이 많아 잠깐 기다렸다 다시 시도할 때 그 사정을 화면에 알려 줍니다.
    API.setStatusHandler(msg => { msgEl.textContent = msg || msgs[i]; });
  }

  function stopMaking() {
    clearInterval(makingTimer);
    makingTimer = null;
    API.setStatusHandler(null);
  }

  async function startMaking() {
    screenMaking();
    try {
      if (!API.hasKey()) throw new API.ApiError('API 키가 아직 없어요. 선생님께 부탁해 주세요.', 'nokey');

      if (ctx.mode === 'image') {
        const prompt = await API.refinePrompt(ctx);
        const blob = await API.generateImage(prompt, ctx.attachment);
        ctx.result = { kind: 'image', blobs: [blob] };
      }
      else if (ctx.mode === 'edit') {
        const blob = await API.editImage(ctx.attachment, (ctx.answers.change || {}).label, ctx);
        ctx.result = { kind: 'image', blobs: [blob] };
      }
      else if (ctx.mode === 'song') {
        const blob = await API.generateMusic(ctx);
        ctx.result = { kind: 'audio', blobs: [blob] };
      }
      else if (ctx.mode === 'video') {
        const prompt = await API.refinePrompt(ctx);
        const blob = await API.generateVideo(prompt, ctx.attachment);
        Store.useVideoOnce();                       // 성공했을 때만 횟수를 씁니다
        ctx.result = { kind: 'video', blobs: [blob] };
      }
      else if (ctx.mode === 'book') {
        const scenes = await API.makeBookScenes(ctx, ctx.pageCount);
        const blobs = [];
        for (const s of scenes) {
          blobs.push(await API.generateImage(`${s.image} ${API.SAFE_STYLE}`, ctx.attachment));
        }
        ctx.result = { kind: 'book', blobs, texts: scenes.map(s => s.text) };
      }

      // 이야기 문장 (실패해도 앱이 멈추지 않도록 직접 만든 문장으로 대체)
      if (ctx.result.kind === 'book') {
        ctx.story = ctx.result.texts.join(' ');
      } else {
        try { ctx.story = await API.makeStory(ctx); } catch (_) { ctx.story = ''; }
        if (!ctx.story) ctx.story = localStory();
      }

      stopMaking();
      Store.beep('done');
      screenResult();
    } catch (e) {
      stopMaking();
      screenError(e);
    }
  }

  function localStory() {
    const a = ctx.answers;
    const who = (a.hero && a.hero.label) || ctx.heroName || '주인공';
    const act = (a.act && a.act.label) || '놀고 있어요';
    const mood = (a.mood && a.mood.label) || '즐거워요';
    const place = ctx.topic ? ctx.topic.label : '이곳';
    if (ctx.mode === 'song') {
      return `${place}에서 들리는 노래예요. ${mood} 느낌이 가득해요.`;
    }
    if (ctx.mode === 'edit') {
      const c = (a.change && a.change.label) || '바꾸기';
      return `내가 그린 그림을 ${c} 했어요. 참 멋져요.`;
    }
    return `${place}에 ${who}가 있어요. ${who}는 ${act}. 기분이 ${mood}.`;
  }

  /* ================= 오류 (부드럽게) ================= */
  function screenError(e) {
    UI.setBack(() => go(flow.length - 1));
    UI.setStep('잠깐만요');
    const msg = (e && e.message) || '지금은 만들 수 없었어요.';
    const needKey = (e && e.kind === 'nokey') || !API.hasKey();
    UI.render([
      UI.title('조금 이따 다시 해 볼까요?', ' '),
      el('div', { class: 'making' }, [
        el('div', { style: 'font-size:4em;', 'aria-hidden': 'true', text: '🌤️' }),
        el('p', { class: 'making__msg', text: '아직 다 만들지 못했어요.' }),
        el('p', { class: 'making__sub', text: msg })
      ]),
      el('div', { class: 'actions' }, [
        UI.btn('처음으로', { onClick: goHome }),
        needKey ? UI.btn('🔑 API 키 넣기', { kind: 'sky', onClick: () => Panels.openApiKeySetup() }) : null,
        UI.btn('다시 만들기', { kind: 'primary', onClick: startMaking })
      ]),
      teacherErrorDetail(e)
    ]);
  }

  /* 학생에게는 쉬운 말만 보이고, 원인 파악에 필요한 내용은 접어 둡니다. */
  function teacherErrorDetail(e) {
    const info = API.getLastError();
    if (!info && !e) return null;
    const status = info ? info.status : 0;

    const tips = [];
    if (status === 429) {
      tips.push('요청 한도를 넘었을 때 나오는 오류입니다(429). 아래를 확인해 주세요.');
      tips.push('· 무료 등급은 분당·하루 요청 수가 적습니다. 1~2분 뒤에 다시 시도해 보세요.');
      tips.push('· 그림·노래·영상 모델은 결제가 연결된 프로젝트에서만 넉넉히 쓸 수 있습니다.');
      tips.push('· 한 반이 같은 키를 함께 쓰면 한도에 빨리 닿습니다. 순서대로 만들게 하거나 키를 나눠 주세요.');
      tips.push('· Google AI Studio → API key → 사용량/한도에서 남은 양을 확인할 수 있습니다.');
    } else if (status === 404) {
      tips.push('모델을 찾지 못했습니다(404). 이 계정에서 아직 쓸 수 없는 모델일 수 있습니다.');
      tips.push('· js/config.js 의 CFG.MODELS 에서 모델 이름을 확인해 주세요.');
    } else if (status === 401 || status === 403) {
      tips.push('키 권한 문제입니다. 설정에서 API 키를 다시 넣어 주세요.');
    } else if (status === 0) {
      tips.push('네트워크 연결이 끊겼거나 학교 방화벽에 막혔을 수 있습니다.');
    }

    return el('details', { class: 'teacher-doc', style: 'max-width:680px; margin:24px auto 0;' }, [
      el('summary', { text: '🧑‍🏫 선생님께 — 자세한 내용 보기' }),
      info ? el('p', { style: 'font-family:monospace; font-size:.78em; word-break:break-all; white-space:pre-wrap;',
                       text: `${info.model} · ${info.method} · HTTP ${info.status}\n${info.message}` }) : null,
      tips.length ? el('ul', {}, tips.map(t => el('li', { text: t }))) : null
    ]);
  }

  /* ================= 8) 결과 ================= */
  function screenResult() {
    Panels.setHelp('result');
    UI.setStep('다 만들었어요!');
    UI.setBack(() => go(flow.length - 1));

    const r = ctx.result;
    const urls = r.blobs.map(b => URL.createObjectURL(b));

    /* --- 결과물 --- */
    let stageInner;
    if (r.kind === 'image') {
      stageInner = el('img', { src: urls[0], alt: ctx.title || '내가 만든 그림' });
    } else if (r.kind === 'video') {
      stageInner = el('video', { src: urls[0], controls: true, playsinline: true, loop: true,
                                 'aria-label': '내가 만든 영상' });
    } else if (r.kind === 'audio') {
      stageInner = el('div', {}, [
        el('div', { style: 'font-size:4.5em;', 'aria-hidden': 'true', text: '🎵' }),
        el('audio', { src: urls[0], controls: true, 'aria-label': '내가 만든 노래' })
      ]);
    } else {
      stageInner = el('div', { class: 'book-pages' }, urls.map((u, i) =>
        el('div', { class: 'book-page' }, [
          el('img', { src: u, alt: `${i + 1}번째 장면` }),
          el('p', { text: (r.texts && r.texts[i]) || '' })
        ])));
    }

    /* --- 이름 붙이기 --- */
    const nameInput = el('input', {
      class: 'input', type: 'text', maxlength: '20',
      value: ctx.title || '', placeholder: '작품 이름을 써 보세요',
      'aria-label': '작품 이름'
    });
    nameInput.addEventListener('input', () => { ctx.title = nameInput.value.trim(); });

    const chips = el('div', { class: 'name-chips' });
    const suggestBtn = UI.btn('✨ 이름 3개 추천받기', {
      kind: 'sky',
      onClick: async () => {
        chips.innerHTML = '';
        chips.appendChild(el('p', { class: 'field__hint', text: '이름을 생각하고 있어요…' }));
        let names = [];
        try { names = await API.suggestTitles(ctx); } catch (_) {}
        chips.innerHTML = '';
        if (!names.length) {
          chips.appendChild(el('p', { class: 'field__hint', text: '지금은 추천이 어려워요. 내가 직접 지어 볼까요?' }));
          return;
        }
        names.forEach(n => {
          const c = el('button', { type: 'button', class: 'chip', text: n, 'aria-label': `작품 이름 ${n} 고르기` });
          c.addEventListener('click', () => {
            chips.querySelectorAll('.chip').forEach(x => x.classList.remove('is-chosen'));
            c.classList.add('is-chosen');
            nameInput.value = n;
            ctx.title = n;
            UI.announce(`작품 이름을 ${n} 으로 정했어요.`);
          });
          chips.appendChild(c);
        });
      }
    });

    /* --- 이야기 읽어주기 --- */
    const rate = el('input', {
      class: 'range', type: 'range', min: '0.5', max: '1.5', step: '0.1',
      value: String(Store.get('speechRate')), 'aria-label': '읽어주는 속도'
    });
    const rateText = el('span', { text: `${Number(Store.get('speechRate')).toFixed(1)}배` });
    rate.addEventListener('input', () => {
      Store.set('speechRate', Number(rate.value));
      rateText.textContent = `${Number(rate.value).toFixed(1)}배`;
    });

    const storyBox = el('div', { class: 'story-box' }, [
      el('p', { text: ctx.story || '' }),
      Speech.supported ? el('div', { class: 'actions', style: 'margin-top:14px;' }, [
        UI.btn('🔊 이야기 읽어주기', { kind: 'mint', onClick: () => Speech.speak(ctx.story) }),
        UI.btn('⏹ 그만 듣기', { onClick: () => Speech.stop() })
      ]) : UI.notice('이 브라우저는 읽어주기를 지원하지 않아요.', null, '🙂'),
      Speech.supported ? el('div', { class: 'field' }, [
        el('label', { class: 'field__label' }, [document.createTextNode('읽어주는 속도 — '), rateText]),
        rate
      ]) : null
    ]);

    /* --- 저장 --- */
    const saveMsg = el('p', { class: 'field__hint', style: 'text-align:center;' });

    function fileName(i) {
      const base = (ctx.title || '내작품').replace(/[\\/:*?"<>|]/g, '') || '내작품';
      const ext = r.kind === 'video' ? 'mp4' : r.kind === 'audio' ? (r.blobs[0].type.includes('mpeg') ? 'mp3' : 'wav') : 'png';
      return r.blobs.length > 1 ? `${base}-${i + 1}.${ext}` : `${base}.${ext}`;
    }

    const keepBtn = UI.btn('🗂 보관함에 담기', {
      kind: 'sky',
      onClick: async () => {
        try {
          if (ctx.savedId) { saveMsg.textContent = '이미 보관함에 담겨 있어요.'; return; }
          const id = await DB.add({
            mode: ctx.mode,
            title: ctx.title || '이름 없는 작품',
            story: ctx.story || '',
            texts: r.texts || [],
            blobs: r.blobs,
            createdAt: Date.now(),
            dateText: UI.todayText()
          });
          ctx.savedId = id;
          saveMsg.textContent = '보관함에 담았어요! 나중에 다시 볼 수 있어요.';
          UI.announce('보관함에 담았어요.');
        } catch (_) {
          saveMsg.textContent = '보관함에 담지 못했어요. 기기 저장 공간을 확인해 주세요.';
        }
      }
    });

    UI.render([
      UI.title('다 만들었어요! 🎉', '이름을 붙이고 저장해 보세요.'),
      el('div', { class: 'result-stage' }, [stageInner]),

      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', text: '🏷️ 작품 이름 붙이기' }),
        nameInput,
        el('div', { class: 'actions', style: 'justify-content:flex-start; margin-top:12px;' }, [suggestBtn]),
        chips
      ]),

      storyBox,

      el('div', { class: 'actions' }, [
        UI.btn('💾 기기에 저장하기', { kind: 'primary', onClick: () => r.blobs.forEach((b, i) => UI.download(b, fileName(i))) }),
        keepBtn
      ]),
      saveMsg,
      el('div', { class: 'actions' }, [
        UI.btn('🔁 다시 만들기', { onClick: () => { Speech.stop(); ctx.savedId = null; startMaking(); } }),
        UI.btn('🏠 처음으로', { onClick: () => { Speech.stop(); goHome(); } })
      ])
    ]);
  }

  /* ================= 시작 ================= */
  function init() {
    Store.applyFontSize();
    goHome();
    if (!Store.onboardingDone()) setTimeout(() => Panels.openOnboarding(), 400);
    Scanning.refresh();
  }

  return { init, goHome };
})();

window.addEventListener('DOMContentLoaded', () => App.init());
