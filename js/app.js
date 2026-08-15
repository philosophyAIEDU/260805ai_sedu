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
      if (mode === 'song' || mode === 'story') steps.push({ kind: 'name', label: '주인공 이름 짓기' });
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
          speak: `${m.label}. ${m.desc}`,
          onDisabled: () => softMessage('오늘 영상은 다 만들었어요. 내일 또 만들어요!'),
          onClick: () => start(m.id)
        });
      }
      return UI.card({
        emoji: m.emoji, label: m.label, desc: m.desc, theme: m.theme,
        speak: `${m.label}. ${m.desc}`,
        onClick: () => start(m.id)
      });
    });

    /* 다른 앱으로 가는 카드 — 앱을 벗어난다는 것을 글과 화살표로 알려 줍니다. */
    const linkCards = (CFG.LINKS || []).map(link => {
      const a = el('a', {
        class: 'card card--link',
        href: link.url, target: '_blank', rel: 'noopener noreferrer',
        'aria-label': `${link.label}. ${link.desc}. 새 창에서 열려요.`
      }, [
        el('span', { class: 'card__emoji', 'aria-hidden': 'true', text: link.emoji }),
        el('span', { class: 'card__label', text: link.label }),
        el('span', { class: 'card__desc', text: link.desc }),
        el('span', { class: 'card__note', text: '새 창에서 열려요 ↗' })
      ]);
      a.addEventListener('click', () => Store.beep('tap'));
      return a;
    });
    const linkRow = linkCards.length ? el('div', { class: 'link-row' }, [
      el('p', { class: 'link-row__title', text: '다른 앱으로 가기' }),
      UI.grid(linkCards)
    ]) : null;

    if (!cards.length) {
      // 선생님이 기능을 모두 꺼 두면 학생 화면이 텅 비지 않도록 안내합니다.
      UI.render([
        UI.title('잠깐만요', ' '),
        el('div', { class: 'empty' }, [
          el('div', { class: 'empty__emoji', 'aria-hidden': 'true', text: '🌱' }),
          el('p', { text: '지금은 만들 수 있는 것이 없어요.' }),
          el('p', { text: '선생님, 설정에서 사용할 기능을 켜 주세요.' })
        ]),
        el('div', { class: 'actions' }, [
          UI.btn('⚙ 설정 열기', { kind: 'primary', onClick: () => Panels.openSettings() }),
          UI.btn('🗂 작품 보관함', { kind: 'sky', onClick: () => Panels.openGallery() })
        ]),
        linkRow
      ]);
      return;
    }

    UI.render([
      UI.title('무엇을 만들까요?', '누르면 만들기가 시작돼요. 언제든 뒤로 갈 수 있어요.'),
      UI.grid(cards),
      linkRow,
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

  /* 카드에 붙는 읽어주기 — 글자를 읽기 어려운 학생을 위해
     ① 카드마다 작은 🔊 단추, ② 아래에 "하나씩 읽어주기" 단추를 함께 둡니다. */
  function readAloudRow(title, labels) {
    if (!Speech.supported) return null;
    return el('div', { class: 'actions' }, [
      UI.btn('🔊 하나씩 읽어주기', {
        kind: 'mint',
        ariaLabel: '고를 것을 하나씩 읽어주기',
        onClick: () => Speech.speakList([title].concat(labels))
      }),
      UI.btn('⏹ 그만 듣기', { onClick: () => Speech.stop() })
    ]);
  }

  /* ================= 1) 주제 ================= */
  function screenTopic() {
    Panels.setHelp('topic');
    Speech.stop();
    const cards = CFG.TOPICS.map(t => UI.card({
      emoji: t.emoji, label: t.label, desc: t.desc, theme: t.theme,
      speak: `${t.label}. ${t.desc}`,
      chosen: ctx.topic && ctx.topic.id === t.id,
      onClick: () => {
        Speech.stop();
        if (!ctx.topic || ctx.topic.id !== t.id) ctx.choices = {};   // 주제가 바뀌면 선택지도 새로
        ctx.topic = t;
        advance();
      }
    }));
    UI.render([
      UI.title('어디에서 일어나는 이야기인가요?', '마음에 드는 곳을 눌러 보세요. 🔊 를 누르면 읽어 줘요.'),
      UI.grid(cards),
      readAloudRow('어디에서 일어나는 이야기인가요?', CFG.TOPICS.map(t => t.label))
    ]);
  }

  /* ================= 2) 질문 ================= */
  async function screenQuestion(spec) {
    Panels.setHelp('question');
    Speech.stop();
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
        speak: c.label,
        chosen: ctx.answers[spec.id] && ctx.answers[spec.id].label === c.label,
        onClick: () => { Speech.stop(); ctx.answers[spec.id] = c; advance(); }
      })));
    }

    UI.render([
      UI.title(spec.title, ready ? '하나를 골라 주세요. 🔊 를 누르면 읽어 줘요.' : ' '),
      body,
      ready ? readAloudRow(spec.title, choices.map(c => c.label)) : null,
      ready ? el('div', { class: 'actions' }, [
        UI.btn('🔁 다른 것 보여주세요', {
          onClick: async () => {
            Speech.stop();
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
          speak: '세 장. 짧고 빠르게 만들어요',
          chosen: ctx.pageCount === 3, onClick: () => { Speech.stop(); ctx.pageCount = 3; advance(); } }),
        UI.card({ emoji: '📘', label: '4장', desc: '조금 더 긴 이야기예요', theme: 'sky',
          speak: '네 장. 조금 더 긴 이야기예요',
          chosen: ctx.pageCount === 4, onClick: () => { Speech.stop(); ctx.pageCount = 4; advance(); } })
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
    book:  ['이야기를 짓고 있어요…', '첫 번째 그림을 그려요…', '다음 그림을 그려요…', '책을 묶고 있어요…'],
    story: ['고른 것을 모으고 있어요…', '이야기를 짓고 있어요…', '문장을 다듬고 있어요…', '거의 다 됐어요…']
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
      else if (ctx.mode === 'story') {
        // 글자 모델만 사용합니다(무료 키로도 잘 됩니다). 이야기는 아래에서 만들어요.
        ctx.result = { kind: 'story', blobs: [] };
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

    /* 하루 사용량을 다 쓴 경우 — 다시 눌러도 오늘은 되지 않으므로
       "다시 만들기" 대신 지금 할 수 있는 것을 안내합니다. */
    const dayLimit = (e && e.kind === 'quota-day');
    /* 지출 한도(spend cap)를 넘긴 경우 — 선생님이 한도를 올려야 풀립니다. */
    const spendCap = (e && e.kind === 'quota-cap');
    const canStory = dayLimit && ctx && ctx.mode !== 'story' &&
                     (Store.get('features') || {}).story !== false &&
                     !API.isDayLimited(CFG.MODELS.text);

    const title = spendCap ? '선생님을 불러 주세요' : dayLimit ? '오늘은 여기까지예요' : '조금 이따 다시 해 볼까요?';
    const emoji = spendCap ? '🔒' : dayLimit ? '🌙' : '🌤️';
    const head  = spendCap ? '지금은 만들 수 없어요.' : dayLimit ? '오늘 만들 수 있는 양을 다 썼어요.' : '아직 다 만들지 못했어요.';
    const sub   = spendCap ? '선생님이 설정을 고치면 다시 만들 수 있어요.' : dayLimit ? '내일 다시 만들 수 있어요.' : msg;

    UI.render([
      UI.title(title, ' '),
      el('div', { class: 'making' }, [
        el('div', { style: 'font-size:4em;', 'aria-hidden': 'true', text: emoji }),
        el('p', { class: 'making__msg', text: head }),
        el('p', { class: 'making__sub', text: sub })
      ]),
      canStory ? UI.notice('그림은 내일 다시 만들 수 있어요. 지금은 “이야기 만들기”를 해 볼까요?', 'info', '📝') : null,
      el('div', { class: 'actions' }, [
        UI.btn('처음으로', { onClick: goHome }),
        needKey ? UI.btn('🔑 API 키 넣기', { kind: 'sky', onClick: () => Panels.openApiKeySetup() }) : null,
        canStory ? UI.btn('📝 이야기 만들기', { kind: 'primary', onClick: () => start('story') }) : null,
        // 한도에 걸렸을 때도 막다른 길이 되지 않게 조용한 다시 시도를 남겨 둡니다.
        // (한도를 기억하는 동안에는 요청을 보내지 않으므로 사용량이 더 줄지 않아요.)
        UI.btn('다시 만들기', { kind: (dayLimit || spendCap) ? 'ghost' : 'primary', onClick: startMaking })
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
    if (status === 429 && info && info.spendCap) {
      /* 사용량이 아니라 "프로젝트 지출 한도" 설정에 걸린 경우입니다.
         잔액이 남아 있어도, 한도가 0이면 아무것도 만들어지지 않습니다. */
      tips.push('사용량이 아니라 프로젝트의 지출 한도(spend cap)에 걸렸습니다. 기다려도 풀리지 않으니 한도를 올려 주세요.');
      tips.push('· Google AI Studio → ai.studio/spend 에서 이 프로젝트의 월 지출 한도를 올려 주세요.');
      tips.push('· 유료로 막 전환한 프로젝트는 지출 한도가 0으로 되어 있는 경우가 있습니다. 선불 잔액이 남아 있어도 한도가 0이면 아무것도 만들어지지 않습니다.');
      tips.push('· 한도를 올린 뒤에는 화면을 새로고침하고 다시 만들어 주세요. (설정 → “이 키로 무엇을 쓸 수 있는지 확인하기”로 먼저 확인해 볼 수 있습니다)');
      tips.push('· 수업에서 쓸 만큼만 한도를 정해 두면 예상치 못한 지출을 막을 수 있습니다.');
    } else if (status === 429) {
      const q = (info && info.quota) || {};
      if (q.perDay) {
        tips.push('하루 사용량을 다 썼습니다(429). 기다려도 오늘은 풀리지 않아 다시 시도하지 않았습니다.');
        tips.push('· 하루 한도는 태평양 시간 자정(한국 시간 오후 4~5시경)에 초기화됩니다.');
        tips.push('· 오늘 더 써야 한다면 Google AI Studio에서 결제를 연결해 유료 등급으로 올려 주세요.');
        tips.push('· 결제를 방금 연결하셨다면 등급이 반영되기까지 몇 분 걸릴 수 있습니다. 설정 → “이 키로 무엇을 쓸 수 있는지 확인하기”로 지금 되는지 확인하고, 화면을 새로고침한 뒤 다시 만들어 주세요.');
      } else if (q.perMinute) {
        tips.push('분당 요청 한도를 넘었습니다(429). 1~2분 뒤에는 다시 됩니다.');
        tips.push('· 여러 학생이 동시에 만들기를 누르면 금방 걸립니다. 순서대로 만들게 해 주세요.');
      } else {
        tips.push('요청 한도를 넘었을 때 나오는 오류입니다(429). 아래를 확인해 주세요.');
        tips.push('· 무료 등급은 분당·하루 요청 수가 적습니다. 1~2분 뒤에 다시 시도해 보세요.');
      }
      if (q.freeTier) {
        tips.push('· 걸린 한도가 “무료 등급(FreeTier)”입니다. 결제를 하셨다면, 결제 계정이 연결된 프로젝트와 이 API 키가 만들어진 프로젝트가 서로 다를 수 있습니다. Google AI Studio → API keys 목록에서 키 옆의 프로젝트 이름을 확인해 주세요.');
      }
      if (q.freeTier || !q.items || !q.items.length) {
        tips.push('· 그림·노래·영상 모델은 무료 등급 한도가 매우 적거나 없습니다. 결제가 연결된 프로젝트에서 넉넉히 쓸 수 있습니다.');
        tips.push('· 무료 키만 있다면 글자 모델만 쓰는 “이야기 만들기”는 그대로 쓸 수 있습니다.');
      }
      tips.push('· 한 반이 같은 키를 함께 쓰면 한도에 빨리 닿습니다. 키를 나눠 주시면 좋습니다.');
      tips.push('· 설정 → “이 키로 무엇을 쓸 수 있는지 확인하기”와 Google AI Studio의 사용량/한도에서 남은 양을 볼 수 있습니다.');
      if (q.items && q.items.length) tips.push('· 걸린 한도: ' + q.items.join(', '));
      if (info && info.retryAfter) tips.push(`· 서버가 알려 준 재시도 권장 시간: ${info.retryAfter}초`);
    } else if (status === 404) {
      tips.push('모델을 찾지 못했습니다(404). 모델 이름이 없거나, 그 모델이 이 방식(예: predict)을 받지 않을 때 나옵니다.');
      if (info && info.usedInstead) {
        tips.push(`· 이 키로 쓸 수 있는 “${info.usedInstead}” 로 자동으로 바꿔 다시 시도했지만 그것도 되지 않았습니다.`);
      } else {
        tips.push('· 이 키로 쓸 수 있는 같은 종류의 모델을 자동으로 찾아봤지만 마땅한 것이 없었습니다.');
      }
      if (info && info.available && info.available.length) {
        tips.push('· 이 키로 보이는 비슷한 모델: ' + info.available.join(', '));
        tips.push('· 위 이름 중 하나를 js/config.js 의 CFG.MODELS 에 적어 주시면 그대로 사용합니다.');
      } else {
        tips.push('· 설정 → “이 키로 무엇을 쓸 수 있는지 확인하기”를 눌러 이 키로 쓸 수 있는 모델을 확인해 주세요.');
        tips.push('· 그림·노래·영상 모델은 결제가 연결된 프로젝트의 키에서만 보이는 경우가 많습니다.');
      }
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
    const isStory = r.kind === 'story';
    const urls = r.blobs.map(b => URL.createObjectURL(b));

    /* 이야기 만들기는 글자가 곧 결과물이라 파일을 그때그때 만듭니다. */
    function outputBlobs() {
      if (!isStory) return r.blobs;
      const text = (ctx.title ? ctx.title + '\n\n' : '') + (ctx.story || '') + '\n\n— ' + UI.todayText();
      return [new Blob([text], { type: 'text/plain;charset=utf-8' })];
    }

    /* --- 결과물 --- */
    let stageInner = null;
    if (isStory) {
      stageInner = null;   // 이야기는 아래 이야기 상자가 곧 결과물입니다.
    } else if (r.kind === 'image') {
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

    const storyBox = el('div', { class: 'story-box' + (isStory ? ' story-box--main' : '') }, [
      isStory ? el('div', { style: 'font-size:3em; text-align:center;', 'aria-hidden': 'true', text: '📝' }) : null,
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

    /* --- 저장 ---
       "저장했는데 어디에 있는지 모르겠다"는 말을 자주 듣습니다.
       그래서 저장한 뒤에 ① 파일 이름과 ② 이 기기에서 찾아갈 곳을 함께 알려 주고,
       태블릿에서는 사진첩·다른 앱으로 바로 보내는 길도 마련해 둡니다. */
    const saveMsg = el('div', { class: 'save-note', hidden: true });

    function showSaveNote(lines, emoji) {
      saveMsg.innerHTML = '';
      saveMsg.hidden = false;
      saveMsg.appendChild(el('span', { class: 'save-note__icon', 'aria-hidden': 'true', text: emoji || '📁' }));
      saveMsg.appendChild(el('div', {}, lines.filter(Boolean).map(t => el('p', { text: t }))));
      UI.announce(lines.filter(Boolean).join(' '));
    }

    function fileName(i, blobs) {
      const base = (ctx.title || '내작품').replace(/[\\/:*?"<>|]/g, '') || '내작품';
      const ext = isStory ? 'txt'
                : r.kind === 'video' ? 'mp4'
                : r.kind === 'audio' ? (r.blobs[0].type.includes('mpeg') ? 'mp3' : 'wav')
                : 'png';
      return blobs.length > 1 ? `${base}-${i + 1}.${ext}` : `${base}.${ext}`;
    }

    function fileNames(blobs) { return blobs.map((b, i) => fileName(i, blobs)); }

    /* 사진첩·다른 앱으로 보내기 — 태블릿에서 다운로드 폴더를 찾기 어려울 때 훨씬 편합니다. */
    const shareable = UI.canShareFiles(outputBlobs(), fileNames(outputBlobs()));
    const shareBtn = shareable ? UI.btn('📤 사진에 담기 · 보내기', {
      kind: 'mint',
      ariaLabel: '사진 앱이나 다른 앱으로 보내기',
      onClick: async () => {
        const blobs = outputBlobs();
        const names = fileNames(blobs);
        const ok = await UI.shareFiles(blobs, names, ctx.title || '내가 만든 작품');
        if (ok) {
          showSaveNote([
            '보냈어요!',
            r.kind === 'image' || r.kind === 'book'
              ? '“이미지 저장”을 고르면 사진 앱(갤러리)에 들어가요.'
              : '고른 앱에서 확인해 보세요.'
          ], '📤');
        }
      }
    }) : null;

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
            blobs: outputBlobs(),
            createdAt: Date.now(),
            dateText: UI.todayText()
          });
          ctx.savedId = id;
          showSaveNote([
            '보관함에 담았어요!',
            '이 앱의 “🗂 작품 보관함”에서 언제든 다시 볼 수 있어요. (기기 밖으로 나가지 않아요)'
          ], '🗂');
        } catch (_) {
          showSaveNote(['보관함에 담지 못했어요.', '기기 저장 공간을 확인해 주세요.'], '🙂');
        }
      }
    });

    UI.render([
      UI.title('다 만들었어요! 🎉', '이름을 붙이고 저장해 보세요.'),
      stageInner ? el('div', { class: 'result-stage' }, [stageInner]) : null,

      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', text: '🏷️ 작품 이름 붙이기' }),
        nameInput,
        el('div', { class: 'actions', style: 'justify-content:flex-start; margin-top:12px;' }, [suggestBtn]),
        chips
      ]),

      storyBox,

      el('div', { class: 'actions' }, [
        UI.btn('💾 기기에 내려받기', {
          kind: 'primary',
          ariaLabel: '작품을 이 기기에 파일로 내려받기',
          onClick: () => {
            const blobs = outputBlobs();
            const names = fileNames(blobs);
            blobs.forEach((b, i) => UI.download(b, names[i]));
            showSaveNote([
              names.length > 1
                ? `「${names[0]}」 등 ${names.length}개 파일로 저장했어요.`
                : `「${names[0]}」 이름으로 저장했어요.`,
              UI.saveHint(),
              shareable ? '사진 앱(갤러리)에 넣고 싶으면 아래 “📤 사진에 담기 · 보내기”를 눌러 보세요.' : null
            ], '📁');
          }
        }),
        shareBtn,
        keepBtn
      ]),
      saveMsg,
      (r.kind === 'image' || r.kind === 'book')
        ? el('p', { class: 'field__hint', style: 'text-align:center;',
                    text: '💡 그림을 길게 누르면 “이미지 저장”으로도 사진 앱에 담을 수 있어요.' })
        : null,
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
