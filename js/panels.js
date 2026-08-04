/* =========================================================
   panels.js — 처음 안내 / 도움말 / 선생님용 설정 / 작품 보관함
   ========================================================= */

const Panels = (() => {
  const el = UI.el;

  /* ================= 처음 안내 ================= */
  let obIndex = 0;
  const obSlides = document.getElementById('ob-slides');
  const obDots   = document.getElementById('ob-dots');
  const obNext   = document.getElementById('ob-next');
  const obSkip   = document.getElementById('ob-skip');

  function drawOnboarding() {
    const s = CFG.ONBOARDING[obIndex];
    obSlides.innerHTML = '';
    obSlides.appendChild(el('div', { class: 'ob-slide' }, [
      el('div', { class: 'ob-slide__emoji', 'aria-hidden': 'true', text: s.emoji }),
      el('h2', { class: 'ob-slide__title', id: 'ob-title', text: s.title }),
      el('p', { class: 'ob-slide__text', text: s.text })
    ]));
    obDots.innerHTML = '';
    CFG.ONBOARDING.forEach((_, i) =>
      obDots.appendChild(el('i', { class: i === obIndex ? 'on' : '', 'aria-hidden': 'true' })));
    obNext.textContent = obIndex === CFG.ONBOARDING.length - 1 ? '시작하기' : '다음';
    obSkip.hidden = obIndex === CFG.ONBOARDING.length - 1;
    UI.announce(`${obIndex + 1}번째 안내. ${s.title}`);
  }

  function openOnboarding() {
    obIndex = 0;
    drawOnboarding();
    UI.openOverlay('onboarding');
  }

  function finishOnboarding() {
    Store.markOnboardingDone();
    UI.closeOverlay('onboarding');
  }

  obNext.addEventListener('click', () => {
    Store.beep('tap');
    if (obIndex < CFG.ONBOARDING.length - 1) { obIndex++; drawOnboarding(); }
    else finishOnboarding();
  });
  obSkip.addEventListener('click', () => { Store.beep('back'); finishOnboarding(); });

  /* ================= 도움말 ================= */
  let helpKey = 'home';
  function setHelp(key) { helpKey = key; }

  function openHelp() {
    const body = document.getElementById('help-body');
    body.innerHTML = '';
    body.appendChild(el('p', { style: 'font-size:1.05em; line-height:1.8;', text: CFG.HELP[helpKey] || CFG.HELP.home }));
    body.appendChild(el('div', { class: 'notice notice--info' }, [
      el('span', { class: 'notice__icon', 'aria-hidden': 'true', text: '🙂' }),
      el('span', { text: '틀린 답은 없어요. 왼쪽 위 “뒤로”를 누르면 앞으로 돌아갈 수 있어요.' })
    ]));
    if (Speech.supported) {
      body.appendChild(UI.btn('🔊 읽어주기', {
        kind: 'mint',
        onClick: () => Speech.speak(CFG.HELP[helpKey] || CFG.HELP.home)
      }));
    }
    UI.openOverlay('help');
  }

  document.getElementById('btn-help').addEventListener('click', () => { Store.beep('tap'); openHelp(); });
  document.getElementById('help-close').addEventListener('click', () => { Speech.stop(); UI.closeOverlay('help'); });
  document.getElementById('help-replay').addEventListener('click', () => {
    Speech.stop();
    UI.closeOverlay('help');
    setTimeout(openOnboarding, 200);
  });

  /* ================= 선생님용 설정 =================
     학생이 실수로 열지 않도록 "길게 누르기"로 엽니다.
     (키보드로는 설정 단추에 포커스한 뒤 Enter로 바로 열립니다.) */
  const gear = document.getElementById('btn-settings');
  let holdTimer = null;

  function beginHold() {
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { openSettings(); }, 1100);
  }
  function cancelHold() { clearTimeout(holdTimer); }

  gear.addEventListener('pointerdown', beginHold);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => gear.addEventListener(ev, cancelHold));
  gear.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); openSettings(); }
  });
  gear.addEventListener('click', e => e.preventDefault());

  function row(labelText, hintText, control) {
    return el('div', { class: 'switch-row' }, [
      el('div', { class: 'switch-row__text' }, [
        el('strong', { text: labelText }),
        hintText ? el('small', { text: hintText }) : null
      ]),
      control
    ]);
  }

  function toggle(checked, onChange, label) {
    const t = el('button', {
      type: 'button', class: 'toggle', role: 'switch',
      'aria-checked': checked ? 'true' : 'false',
      'aria-label': label
    });
    t.addEventListener('click', () => {
      const now = t.getAttribute('aria-checked') !== 'true';
      t.setAttribute('aria-checked', now ? 'true' : 'false');
      onChange(now);
    });
    return t;
  }

  function segmented(options, current, onPick, groupLabel) {
    const wrap = el('div', { class: 'seg', role: 'group', 'aria-label': groupLabel });
    options.forEach(o => {
      const b = el('button', {
        type: 'button', text: o.label,
        'aria-pressed': String(o.value) === String(current) ? 'true' : 'false'
      });
      b.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        onPick(o.value);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function openSettings(opts) {
    const o = opts || {};
    const body = document.getElementById('settings-body');
    body.innerHTML = '';

    /* --- API 키 --- */
    const keyInput = el('input', {
      class: 'input', type: 'password', value: Store.get('apiKey') || '',
      placeholder: 'AIza… 로 시작하는 키',
      'aria-label': 'Gemini API 키'
    });
    const keyState = el('p', { class: 'field__hint', text: Store.get('apiKey') ? '키가 저장되어 있어요.' : '아직 키가 없어요.' });
    const showKey = el('button', { type: 'button', class: 'btn btn--ghost', text: '보기' });
    showKey.addEventListener('click', () => {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
      showKey.textContent = keyInput.type === 'password' ? '보기' : '가리기';
    });

    body.appendChild(el('div', { class: 'setting-group' }, [
      el('h3', { text: '🔑 API 키' }),
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', text: 'Gemini API 키' }),
        keyInput,
        el('div', { class: 'actions', style: 'justify-content:flex-start; margin-top:12px;' }, [
          UI.btn('저장하기', { kind: 'primary', onClick: () => {
            Store.set('apiKey', keyInput.value.trim());
            keyState.textContent = keyInput.value.trim() ? '키가 저장되어 있어요. (이 브라우저에만 저장돼요)' : '키를 지웠어요.';
            UI.announce('API 키를 저장했어요.');
          }}),
          showKey,
          UI.btn('지우기', { kind: 'danger', onClick: () => {
            keyInput.value = '';
            Store.set('apiKey', '');
            keyState.textContent = '키를 지웠어요.';
          }})
        ]),
        keyState,
        el('p', { class: 'field__hint', text: '키는 이 기기의 브라우저 저장소에만 저장되고 다른 곳으로 보내지 않아요. 공용 태블릿이라면 수업이 끝난 뒤 지워 주세요.' })
      ])
    ]));

    /* --- 영상 사용 횟수 --- */
    const limitVal = el('strong', { text: `하루 ${Store.get('videoDailyLimit')}회` });
    const limitRange = el('input', {
      class: 'range', type: 'range', min: '0', max: '10', step: '1',
      value: String(Store.get('videoDailyLimit')),
      'aria-label': '영상 하루 사용 횟수'
    });
    const usageText = el('p', { class: 'field__hint' });
    function refreshUsage() {
      const u = Store.videoUsage();
      usageText.textContent = `오늘 사용: ${u.count}회 · 남은 횟수: ${Store.videoRemaining()}회 (날짜가 바뀌면 저절로 초기화돼요)`;
    }
    refreshUsage();
    limitRange.addEventListener('input', () => {
      const v = Number(limitRange.value);
      Store.set('videoDailyLimit', v);
      limitVal.textContent = v === 0 ? '영상 기능 잠금 (0회)' : `하루 ${v}회`;
      refreshUsage();
    });

    body.appendChild(el('div', { class: 'setting-group' }, [
      el('h3', { text: '🎬 영상 사용 횟수' }),
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label' }, [limitVal]),
        limitRange,
        usageText,
        el('div', { class: 'actions', style: 'justify-content:flex-start; margin-top:10px;' }, [
          UI.btn('오늘 사용 횟수 초기화', { kind: 'mint', onClick: () => {
            Store.resetVideoUsage();
            refreshUsage();
            UI.announce('영상 사용 횟수를 초기화했어요.');
          }})
        ]),
        el('p', { class: 'field__hint', text: '0으로 두면 영상 만들기 카드가 잠깁니다. 이 제한은 비용을 아끼기 위한 장치이지 보안 장치가 아니에요. 브라우저 저장소를 지우면 초기화됩니다.' })
      ])
    ]));

    /* --- 기능 켜기/끄기 --- */
    const featGroup = el('div', { class: 'setting-group' }, [el('h3', { text: '🧩 사용할 기능' })]);
    CFG.MODES.forEach(m => {
      featGroup.appendChild(row(
        `${m.emoji} ${m.label}`,
        m.id === 'video' ? '가장 비싼 기능이에요. 예산이 빠듯하면 꺼 두세요.' : m.desc,
        toggle(Store.all().features[m.id], v => Store.setFeature(m.id, v), `${m.label} 사용`)
      ));
    });
    body.appendChild(featGroup);

    /* --- 학생 화면 --- */
    body.appendChild(el('div', { class: 'setting-group' }, [
      el('h3', { text: '🧒 학생 화면' }),
      row('선택지 개수', '학생 수준에 맞춰 줄일 수 있어요.',
        segmented([{label:'2개',value:2},{label:'3개',value:3},{label:'4개',value:4}],
          Store.get('choiceCount'), v => Store.set('choiceCount', Number(v)), '선택지 개수')),
      row('글자 크기', null,
        segmented([{label:'작게',value:'s'},{label:'보통',value:'m'},{label:'크게',value:'l'},{label:'아주 크게',value:'xl'}],
          Store.get('fontSize'), v => Store.set('fontSize', v), '글자 크기')),
      row('효과음', '버튼을 누를 때 짧은 소리가 나요. 기본은 꺼짐이에요.',
        toggle(Store.get('soundEffects'), v => Store.set('soundEffects', v), '효과음'))
    ]));

    /* --- 읽어주기 속도 --- */
    const rateVal = el('strong', { text: `속도 ${Number(Store.get('speechRate')).toFixed(1)}배` });
    const rateRange = el('input', {
      class: 'range', type: 'range', min: '0.5', max: '1.5', step: '0.1',
      value: String(Store.get('speechRate')), 'aria-label': '음성 읽어주기 속도'
    });
    rateRange.addEventListener('input', () => {
      const v = Number(rateRange.value);
      Store.set('speechRate', v);
      rateVal.textContent = `속도 ${v.toFixed(1)}배`;
    });

    body.appendChild(el('div', { class: 'setting-group' }, [
      el('h3', { text: '🔊 이야기 읽어주기' }),
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label' }, [rateVal]),
        rateRange,
        el('div', { class: 'actions', style: 'justify-content:flex-start;' }, [
          UI.btn('소리 들어보기', { kind: 'mint', onClick: () => Speech.speak('안녕하세요. 이렇게 읽어 줄게요.') })
        ]),
        el('p', { class: 'field__hint', text: Speech.supported
          ? '브라우저에 들어 있는 목소리를 사용해요. 인터넷이 없어도 동작하고 비용이 들지 않아요.'
          : '이 브라우저는 읽어주기를 지원하지 않아요. 크롬이나 사파리를 사용해 보세요.' })
      ])
    ]));

    /* --- 스위치 스캐닝 --- */
    const scanVal = el('strong', { text: `${Number(Store.get('scanSpeed')).toFixed(1)}초마다 이동` });
    const scanRange = el('input', {
      class: 'range', type: 'range', min: '1.5', max: '5', step: '0.5',
      value: String(Store.get('scanSpeed')), 'aria-label': '스캐닝 속도'
    });
    scanRange.addEventListener('input', () => {
      const v = Number(scanRange.value);
      Store.set('scanSpeed', v);
      scanVal.textContent = `${v.toFixed(1)}초마다 이동`;
      Scanning.refresh();
    });

    body.appendChild(el('div', { class: 'setting-group' }, [
      el('h3', { text: '🕹 스위치 스캐닝' }),
      row('스캐닝 모드', '선택지에 순서대로 불이 들어오고 스페이스바로 선택해요. 기본은 꺼짐이에요.',
        toggle(Store.get('scanning'), v => { Store.set('scanning', v); Scanning.refresh(); }, '스위치 스캐닝 모드')),
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label' }, [scanVal]),
        scanRange
      ])
    ]));

    /* --- 선생님용 도움말 --- */
    body.appendChild(teacherDocs());

    /* --- 보관함 --- */
    body.appendChild(el('div', { class: 'setting-group' }, [
      el('h3', { text: '🗂 작품 보관함' }),
      el('div', { class: 'actions', style: 'justify-content:flex-start;' }, [
        UI.btn('보관함 열기', { kind: 'sky', onClick: () => { UI.closeOverlay('settings'); setTimeout(openGallery, 200); } }),
        UI.btn('보관함 모두 지우기', { kind: 'danger', onClick: async () => {
          if (!confirm('보관함의 작품을 모두 지울까요? 되돌릴 수 없어요.')) return;
          await DB.clear();
          UI.announce('보관함을 비웠어요.');
        }})
      ])
    ]));

    UI.openOverlay('settings');

    // 홈 화면의 "API 키 넣기"로 들어온 경우 키 입력칸으로 바로 안내합니다.
    if (o.focusKey) {
      setTimeout(() => {
        keyInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
        keyInput.focus();
      }, 200);
    }
  }

  function openApiKeySetup() { openSettings({ focusKey: true }); }

  function teacherDocs() {
    const wrap = el('div', {});

    wrap.appendChild(el('details', { class: 'teacher-doc' }, [
      el('summary', { text: '📘 API 키 발급 방법' }),
      el('ol', {}, [
        el('li', { text: 'Google AI Studio (aistudio.google.com) 에 구글 계정으로 로그인합니다.' }),
        el('li', { text: '왼쪽 메뉴에서 "Get API key" (API 키 가져오기)를 누릅니다.' }),
        el('li', { text: '"Create API key"로 키를 만들고 복사합니다.' }),
        el('li', { text: '위의 "Gemini API 키" 칸에 붙여넣고 저장하기를 누릅니다.' }),
        el('li', { text: '영상·노래 기능은 유료 결제가 연결된 프로젝트에서만 동작할 수 있습니다.' })
      ]),
      el('p', { text: '※ 키는 학생에게 보이지 않는 곳에서 입력해 주세요. 공용 기기라면 수업 후 "지우기"를 눌러 삭제하는 것을 권합니다.' })
    ]));

    wrap.appendChild(el('details', { class: 'teacher-doc' }, [
      el('summary', { text: '💰 기능별 비용 차이 (대략)' }),
      el('ul', {}, [
        el('li', { text: '글자(선택지·이야기·이름 제안): 가장 저렴합니다. 한 차시 내내 써도 부담이 적습니다.' }),
        el('li', { text: '그림 만들기 / 내 그림 바꾸기: 보통입니다. 한 장에 몇 원~수십 원 수준.' }),
        el('li', { text: '노래 만들기: 그림보다 비쌉니다.' }),
        el('li', { text: '영상 만들기: 가장 비쌉니다. 한 편에 그림 수십 장 값이 들 수 있어 하루 횟수 제한을 두었습니다.' }),
        el('li', { text: '읽어주기: 무료입니다. 브라우저 기능만 사용합니다.' })
      ]),
      el('p', { text: '정확한 요금은 구글 요금표를 확인해 주세요. 예산이 빠듯하면 위 "사용할 기능"에서 영상만 꺼 두는 방법을 권합니다.' })
    ]));

    wrap.appendChild(el('details', { class: 'teacher-doc' }, [
      el('summary', { text: '🚦 "지금은 쉬어야 해요" (429) 가 뜰 때' }),
      el('p', { text: '키가 잘못된 것이 아니라, 정해진 요청 한도를 넘었다는 뜻입니다. (키가 잘못되면 429가 아니라 400·403이 뜹니다.)' }),
      el('ul', {}, [
        el('li', { text: '무료 등급은 분당·하루 요청 수가 적습니다. 1~2분 뒤에 다시 시도해 보세요. 앱도 자동으로 2번까지 기다렸다 다시 시도합니다.' }),
        el('li', { text: '그림·노래·영상 모델은 결제가 연결된 프로젝트에서만 넉넉히 쓸 수 있습니다. Google AI Studio에서 결제 연결 여부를 확인해 주세요.' }),
        el('li', { text: '한 반이 같은 키를 동시에 쓰면 한도에 금방 닿습니다. 모둠별로 시간차를 두거나 키를 나눠 주세요.' }),
        el('li', { text: '선택지 개수를 줄이고 "다른 것 보여주세요"를 적게 쓰면 요청 수가 줄어듭니다.' }),
        el('li', { text: '오류 화면 아래 "선생님께 — 자세한 내용 보기"를 펼치면 실제 응답 내용을 볼 수 있습니다.' })
      ])
    ]));

    wrap.appendChild(el('details', { class: 'teacher-doc' }, [
      el('summary', { text: '🕹 스위치 스캐닝 사용법' }),
      el('ul', {}, [
        el('li', { text: '스캐닝 모드를 켜면 화면의 선택지에 순서대로 보라색 테두리가 들어옵니다.' }),
        el('li', { text: '원하는 항목에 불이 들어왔을 때 스페이스바를 누르면 선택됩니다.' }),
        el('li', { text: '대부분의 스위치 인터페이스는 스페이스바 신호로 설정할 수 있습니다.' }),
        el('li', { text: '학생의 반응 속도에 맞춰 이동 속도를 1.5~5초 사이에서 조절해 주세요.' }),
        el('li', { text: '글자를 입력하는 칸을 선택하면 스캐닝이 12초간 멈춰 입력할 시간을 줍니다.' }),
        el('li', { text: '스캐닝을 쓰지 않는 학생은 Tab · 화살표 · Enter 로도 모든 조작이 가능합니다.' })
      ])
    ]));

    wrap.appendChild(el('details', { class: 'teacher-doc' }, [
      el('summary', { text: '🔒 개인정보 주의사항' }),
      el('ul', {}, [
        el('li', { text: '학생 얼굴 사진이나 목소리는 올리지 않도록 지도해 주세요. 직접 그린 그림만 사용합니다.' }),
        el('li', { text: '주인공 이름은 실명 대신 별명을 쓰도록 안내해 주세요.' }),
        el('li', { text: '학생이 고른 내용·이야기·작품은 이 기기의 브라우저에만 저장됩니다(별도 서버 없음).' }),
        el('li', { text: '다만 작품을 만들 때 고른 내용과 첨부한 그림은 구글의 생성 서버로 전송됩니다. 민감한 그림은 올리지 마세요.' }),
        el('li', { text: '공용 태블릿은 수업 후 "보관함 모두 지우기"와 "API 키 지우기"를 실행해 주세요.' })
      ])
    ]));

    wrap.appendChild(el('details', { class: 'teacher-doc' }, [
      el('summary', { text: '⚠️ 안전·건강 관련' }),
      el('ul', {}, [
        el('li', { text: '이 앱에는 초당 3회 이상 깜빡이는 효과가 없습니다(광과민성 발작 예방).' }),
        el('li', { text: '기기의 "동작 줄이기" 설정을 켜면 애니메이션이 더 줄어듭니다.' }),
        el('li', { text: 'AI가 만든 그림 설명은 정답이 아니라 하나의 의견입니다. 학생의 의도를 먼저 물어봐 주세요.' })
      ])
    ]));

    return wrap;
  }

  document.getElementById('set-close').addEventListener('click', () => UI.closeOverlay('settings'));

  /* ================= 작품 보관함 ================= */
  const galBody = document.getElementById('gallery-body');
  let objectUrls = [];

  function releaseUrls() {
    objectUrls.forEach(u => URL.revokeObjectURL(u));
    objectUrls = [];
  }

  async function openGallery() {
    galBody.innerHTML = '';
    galBody.appendChild(el('p', { class: 'subtitle', text: '불러오는 중이에요…' }));
    UI.openOverlay('gallery');
    let works = [];
    try { works = await DB.list(); } catch (_) {}
    releaseUrls();
    galBody.innerHTML = '';

    if (!works.length) {
      galBody.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'empty__emoji', 'aria-hidden': 'true', text: '🌱' }),
        el('p', { text: '아직 저장한 작품이 없어요.' }),
        el('p', { text: '작품을 만들고 “보관함에 담기”를 눌러 보세요.' })
      ]));
      return;
    }

    const list = el('div', { class: 'gal-list' });
    works.forEach(w => {
      const mode = CFG.MODES.find(m => m.id === w.mode) || { emoji: '🎁', label: '작품' };
      const first = w.blobs && w.blobs[0];
      let preview;
      if (first && /^image\//.test(first.type)) {
        const url = URL.createObjectURL(first); objectUrls.push(url);
        preview = el('img', { src: url, alt: `${w.title} 미리보기` });
      } else if (first && /^video\//.test(first.type)) {
        const url = URL.createObjectURL(first); objectUrls.push(url);
        preview = el('video', { src: url, controls: true, playsinline: true, 'aria-label': `${w.title} 영상` });
      } else {
        preview = el('div', { class: 'gal-item__kind', 'aria-hidden': 'true', text: mode.emoji });
      }

      const item = el('div', { class: 'gal-item' }, [
        preview,
        el('p', { class: 'gal-item__name', text: w.title || '이름 없는 작품' }),
        el('p', { class: 'gal-item__date', text: `${mode.label} · ${w.dateText || ''}` }),
        el('div', { class: 'gal-item__btns' }, [
          UI.btn('저장', { kind: 'sky', ariaLabel: `${w.title} 기기에 저장하기`, onClick: () => {
            (w.blobs || []).forEach((b, i) => {
              const ext = b.type.includes('png') ? 'png' : b.type.includes('jpeg') ? 'jpg'
                        : b.type.includes('mp4') ? 'mp4' : b.type.includes('wav') ? 'wav'
                        : b.type.includes('mpeg') ? 'mp3' : 'bin';
              UI.download(b, `${(w.title || '작품').replace(/[\\/:*?"<>|]/g, '')}${(w.blobs.length > 1 ? '-' + (i + 1) : '')}.${ext}`);
            });
          }}),
          UI.btn('지우기', { kind: 'danger', ariaLabel: `${w.title} 지우기`, onClick: async () => {
            if (!confirm(`"${w.title}" 작품을 지울까요?`)) return;
            await DB.remove(w.id);
            openGallery();
          }})
        ])
      ]);

      if (w.story) item.appendChild(el('p', { class: 'gal-item__date', style: 'margin-top:8px', text: w.story }));
      list.appendChild(item);
    });
    galBody.appendChild(list);
  }

  document.getElementById('gal-close').addEventListener('click', () => { releaseUrls(); UI.closeOverlay('gallery'); });

  return { openOnboarding, openHelp, setHelp, openSettings, openApiKeySetup, openGallery };
})();
