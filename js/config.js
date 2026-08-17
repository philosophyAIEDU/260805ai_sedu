/* =========================================================
   config.js — 모델 이름, 기본 설정, 질문/기본 선택지 목록
   (API 키는 여기에 넣지 않습니다. 선생님용 설정에서 입력해 브라우저에만 저장)
   ========================================================= */

const CFG = {
  API_BASE: 'https://generativelanguage.googleapis.com/v1beta',

  MODELS: {
    text:  'gemini-3.1-flash-lite',
    image: 'gemini-3.1-flash-lite-image',
    music: 'lyria-3-clip-preview',
    video: 'veo-3.1-lite-generate-preview'
    // 음성 읽어주기는 API를 쓰지 않고 브라우저 speechSynthesis 사용
  },

  /* ---------- 모델을 못 찾았을 때(404) 대신 써 볼 이름 ----------
     계정·지역에 따라 쓸 수 있는 모델이 다릅니다. 위 MODELS 의 이름이 404가 나면
     이 목록을 위에서부터 살펴보고, 이 키로 실제 쓸 수 있는 것으로 자동으로 바꿔 씁니다.
     (모델 목록 조회는 생성 요청이 아니라서 비용이 들지 않습니다.) */
  MODEL_FALLBACKS: {
    text:  ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    image: ['gemini-3.1-flash-lite-image', 'gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
    music: ['lyria-3-clip-preview', 'lyria-3-pro-preview', 'lyria-002'],
    video: ['veo-3.1-lite-generate-preview', 'veo-3.1-generate-preview',
            'veo-3.0-fast-generate-001', 'veo-3.0-generate-001', 'veo-2.0-generate-001']
  },

  DEFAULT_SETTINGS: {
    apiKey: '',
    videoDailyLimit: 3,      // 0~10 (0이면 영상 기능 잠김)
    features: { image: true, song: true, video: true, edit: true, book: true, story: true },
    choiceCount: 4,          // 2 / 3 / 4
    bookMaxPages: 6,         // 그림책을 최대 몇 장까지 이어 만들 수 있는지 (2~8)
    fontSize: 'm',           // s / m / l / xl
    soundEffects: false,     // 기본 꺼짐
    speechRate: 0.9,         // 0.5 ~ 1.5
    scanning: false,         // 스위치 스캐닝 기본 꺼짐
    scanSpeed: 2.5           // 1.5 ~ 5초
  },

  /* ---------- 만들 것 고르기 ---------- */
  MODES: [
    { id: 'image', emoji: '🎨', label: '그림 만들기',    desc: '내 이야기로 그림을 만들어요',            theme: 'peach'  },
    { id: 'song',  emoji: '🎵', label: '노래 만들기',    desc: '내 이야기로 노래를 만들어요',            theme: 'mint'   },
    { id: 'video', emoji: '🎬', label: '영상 만들기',    desc: '내 이야기로 짧은 영상을 만들어요',        theme: 'sky'    },
    { id: 'edit',  emoji: '🖍️', label: '내 그림 바꾸기', desc: '내가 그린 그림에 색을 칠하거나 배경을 바꿔요', theme: 'butter' },
    { id: 'book',  emoji: '📖', label: '그림책 만들기',  desc: '첫 장면을 넣고 다음 이야기를 내가 이어요', theme: 'lilac'  },
    // 글자 모델만 있으면 되는 기능 — 무료 API 키로도 잘 동작합니다.
    { id: 'story', emoji: '📝', label: '이야기 만들기',  desc: '고른 것으로 이야기를 만들고 읽어줘요',    theme: 'rose'   }
  ],

  /* ---------- 첫 화면에서 갈 수 있는 다른 앱 ----------
     여기에 추가하면 홈 화면 아래쪽에 카드로 나타납니다. */
  LINKS: [
    { emoji: '🎼', label: 'AI 감각 창작 수업', desc: '다른 창작 수업 앱으로 가요',
      url: 'https://hkstudent.netlify.app/' }
  ],

  /* ---------- 주제 ---------- */
  TOPICS: [
    { id: 'space', emoji: '🪐', label: '우주', desc: '별과 행성이 반짝이는 곳', theme: 'lilac' },
    { id: 'sea',   emoji: '🐳', label: '바다', desc: '물고기가 헤엄치는 곳',   theme: 'sky'   },
    { id: 'mount', emoji: '⛰️', label: '산',   desc: '나무와 바위가 있는 곳',   theme: 'mint'  },
    { id: 'sky',   emoji: '🌈', label: '하늘', desc: '구름이 떠다니는 곳',     theme: 'peach' }
  ],

  /* ---------- 질문 목록 ----------
     make: 그림/영상/그림책 · song: 노래 · edit: 내 그림 바꾸기 */
  QUESTIONS: {
    make: [
      { id: 'hero',  title: '주인공은 누구였으면 좋겠나요?', ask: '이야기의 주인공',        theme: 'peach' },
      { id: 'act',   title: '주인공은 무엇을 하고 있나요?',   ask: '주인공이 하는 행동',      theme: 'mint'  },
      { id: 'mood',  title: '기분은 어떤가요?',              ask: '주인공의 기분',          theme: 'butter'},
      { id: 'color', title: '어떤 색이 좋을까요?',            ask: '그림에 쓸 색의 느낌',     theme: 'lilac' }
    ],
    song: [
      { id: 'mood',   title: '어떤 느낌의 노래가 좋을까요?', ask: '노래의 분위기',   theme: 'peach' },
      { id: 'tempo',  title: '얼마나 빠른 노래가 좋을까요?', ask: '노래의 빠르기',   theme: 'mint'  },
      { id: 'inst',   title: '어떤 악기 소리가 좋을까요?',   ask: '노래에 쓸 악기',   theme: 'sky'   },
      { id: 'where',  title: '어디에서 듣고 싶은 노래인가요?', ask: '노래를 듣는 장소', theme: 'lilac' }
    ],
    edit: [
      { id: 'change', title: '무엇을 바꿔 볼까요?', ask: '그림을 바꾸는 방법', theme: 'butter' }
    ]
  },

  /* ---------- 기본 선택지 (API 실패·오프라인용) ----------
     선택지는 평소 gemini-3.1-flash-lite가 매번 새로 만들고,
     실패하면 아래 목록으로 자동 대체됩니다. */
  FALLBACK: {
    hero: {
      space: [ {label:'고양이',emoji:'🐱'}, {label:'로봇',emoji:'🤖'}, {label:'아이',emoji:'🧒'}, {label:'별님',emoji:'⭐'},
               {label:'우주선',emoji:'🚀'}, {label:'토끼',emoji:'🐰'} ],
      sea:   [ {label:'돌고래',emoji:'🐬'}, {label:'거북이',emoji:'🐢'}, {label:'아이',emoji:'🧒'}, {label:'물고기',emoji:'🐠'},
               {label:'문어',emoji:'🐙'}, {label:'인어',emoji:'🧜'} ],
      mount: [ {label:'곰',emoji:'🐻'}, {label:'다람쥐',emoji:'🐿️'}, {label:'아이',emoji:'🧒'}, {label:'새',emoji:'🐦'},
               {label:'여우',emoji:'🦊'}, {label:'나무',emoji:'🌳'} ],
      sky:   [ {label:'용',emoji:'🐉'}, {label:'새',emoji:'🕊️'}, {label:'아이',emoji:'🧒'}, {label:'구름',emoji:'☁️'},
               {label:'나비',emoji:'🦋'}, {label:'풍선',emoji:'🎈'} ]
    },
    act: {
      space: [ {label:'날아간다',emoji:'🚀'}, {label:'별을 본다',emoji:'🔭'}, {label:'춤춘다',emoji:'💃'}, {label:'잠잔다',emoji:'😴'} ],
      sea:   [ {label:'헤엄친다',emoji:'🏊'}, {label:'논다',emoji:'🫧'}, {label:'춤춘다',emoji:'💃'}, {label:'잠잔다',emoji:'😴'} ],
      mount: [ {label:'걸어간다',emoji:'🥾'}, {label:'열매를 딴다',emoji:'🍎'}, {label:'춤춘다',emoji:'💃'}, {label:'잠잔다',emoji:'😴'} ],
      sky:   [ {label:'날아간다',emoji:'🕊️'}, {label:'구름을 탄다',emoji:'☁️'}, {label:'춤춘다',emoji:'💃'}, {label:'노래한다',emoji:'🎤'} ]
    },
    mood: {
      _any: [ {label:'신난다',emoji:'😄'}, {label:'편안하다',emoji:'😊'}, {label:'궁금하다',emoji:'🤔'}, {label:'씩씩하다',emoji:'💪'},
              {label:'행복하다',emoji:'🥰'}, {label:'포근하다',emoji:'🧸'} ]
    },
    color: {
      _any: [ {label:'따뜻한 색',emoji:'🧡'}, {label:'시원한 색',emoji:'💙'}, {label:'알록달록',emoji:'🌈'}, {label:'부드러운 색',emoji:'🤍'},
              {label:'반짝이는 색',emoji:'✨'}, {label:'초록빛',emoji:'💚'} ]
    },
    /* 노래용 */
    songmood: { _any: [ {label:'즐거운',emoji:'😄'}, {label:'포근한',emoji:'🧸'}, {label:'신비로운',emoji:'✨'}, {label:'씩씩한',emoji:'💪'} ] },
    tempo:    { _any: [ {label:'아주 느리게',emoji:'🐢'}, {label:'천천히',emoji:'🚶'}, {label:'조금 빠르게',emoji:'🐇'}, {label:'신나게 빠르게',emoji:'🎉'} ] },
    inst:     { _any: [ {label:'피아노',emoji:'🎹'}, {label:'기타',emoji:'🎸'}, {label:'실로폰',emoji:'🎼'}, {label:'북소리',emoji:'🥁'},
                        {label:'플루트',emoji:'🪈'}, {label:'하프',emoji:'🎻'} ] },
    where:    { _any: [ {label:'집에서',emoji:'🏠'}, {label:'교실에서',emoji:'🏫'}, {label:'잠들기 전에',emoji:'🌙'}, {label:'놀이터에서',emoji:'🛝'} ] },
    /* 그림 바꾸기용 — 고정 목록 사용 */
    change:   { _any: [ {label:'색칠하기',emoji:'🖍️'}, {label:'배경 넣기',emoji:'🏞️'}, {label:'반짝이게',emoji:'✨'}, {label:'만화처럼',emoji:'💥'} ] },
    /* 그림책에서 "다음에 무슨 일이 일어날까요?" 줄거리 카드 (API 실패·오프라인용) */
    next:     { _any: [ {label:'친구를 만나요',emoji:'🤝'}, {label:'선물을 찾아요',emoji:'🎁'}, {label:'같이 놀아요',emoji:'🪁'},
                        {label:'맛있는 걸 먹어요',emoji:'🍎'}, {label:'노래를 불러요',emoji:'🎤'}, {label:'춤을 춰요',emoji:'💃'},
                        {label:'더 멀리 가 봐요',emoji:'🧭'}, {label:'숨은 길을 찾아요',emoji:'🗺️'},
                        {label:'예쁜 것을 봐요',emoji:'🌸'}, {label:'집으로 돌아가요',emoji:'🏠'},
                        {label:'포근하게 쉬어요',emoji:'🧸'}, {label:'푹 자요',emoji:'😴'} ] }
  },

  /* ---------- 처음 실행 안내 ---------- */
  ONBOARDING: [
    { emoji: '🎨', title: '내 이야기로 작품을 만들어요',
      text: '고르기만 하면 그림, 노래, 영상, 그림책이 만들어져요.\n글을 많이 쓰지 않아도 괜찮아요.' },
    { emoji: '👆', title: '카드를 눌러서 골라요',
      text: '한 화면에 질문이 하나씩 나와요.\n마음에 드는 카드를 누르면 다음으로 넘어가요.' },
    { emoji: '📖', title: '그림책은 내가 이어 만들어요',
      text: '첫 장면을 넣고, 다음에 무슨 일이 일어날지 내가 골라요.\n같은 주인공이 끝까지 나와요.' },
    { emoji: '↩️', title: '언제든 다시 고를 수 있어요',
      text: '틀린 답은 없어요.\n왼쪽 위 “뒤로”를 누르면 앞으로 돌아가요.' },
    { emoji: '🔊', title: '만든 이야기를 읽어줘요',
      text: '작품이 완성되면 이야기를 소리로 들려줘요.\n저장해서 보관함에 모아 둘 수도 있어요.' }
  ],

  /* ---------- 화면별 도움말 ---------- */
  HELP: {
    home:        '만들고 싶은 것을 골라요. 카드 오른쪽 위 🔊 를 누르면 무엇인지 읽어 줘요.',
    topic:       '이야기가 펼쳐질 곳을 골라요. 카드의 🔊 를 누르면 “우주”, “바다” 같은 낱말을 읽어 주고, 아래 “하나씩 읽어주기”를 누르면 차례로 읽어 줘요.',
    question:    '질문을 읽고 마음에 드는 카드를 하나 눌러요. 🔊 를 누르면 읽어 줘요. 틀린 답은 없어요.',
    attach:      '내가 그린 그림을 사진으로 찍거나 파일로 올려요. 안 올려도 괜찮아요.',
    first:       '그림책의 첫 장면을 정해요. 내가 그린 그림을 올려서 첫 장면으로 쓸 수도 있고, 고른 것으로 AI가 그려 줄 수도 있어요.',
    book:        '지금까지 만든 장면이 위에 보여요. 아래 카드 중 하나를 누르면 그 이야기로 다음 장면이 만들어져요. 주인공은 그대로예요. 다 만들었으면 “여기까지! 책 완성하기”를 눌러요.',
    attachEdit:  '바꾸고 싶은 내 그림을 올려 주세요. 이 기능은 그림이 꼭 필요해요.',
    name:        '주인공 이름을 지어 줄 수 있어요. 안 써도 괜찮아요.',
    confirm:     '고른 것들을 확인해요. 바꾸고 싶은 줄을 누르면 그것만 다시 고를 수 있어요.',
    making:      '작품을 만드는 중이에요. 조금만 기다려 주세요.',
    result:      '작품이 완성됐어요. “기기에 내려받기”를 누르면 어디에 저장됐는지 화면에 알려 줘요. “보관함에 담기”를 누르면 이 앱 안에 모아 둘 수 있어요. 그림책은 장면을 누르면 크게 볼 수 있어요.'
  }
};
