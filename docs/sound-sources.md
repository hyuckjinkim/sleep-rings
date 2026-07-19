# 사운드 소스 조사 & 조달 계획

> 조사: sound-pipeline 에이전트, 2026-07-20. **다운로드는 아직 실행하지 않음 — 조사·설계 문서.**
> 전제: `docs/research/sleep-orbit-benchmark.md` §3 (17개 카테고리, 100+ 사운드) 기준. 클론 v1 목표 = 카테고리당 2~4개, 총 40~60개 음원.
> 원칙: **라이선스가 명확히 확인되지 않은 소스는 후보에서 제외**한다. "아마 CC0일 것"은 채택 기준이 아니다.

## 1. 소스별 조사 결과

### 1.1 Pixabay (sound-effects) — ⚠️ 자동화 불가, 수동 개별 다운로드만 가능

- **라이선스:** Pixabay License. 출처 표기 불필요, 상업적 사용 가능. 콘텐츠 자체의 상업적 사용 조건은 안전함.
- **API:** Pixabay 공식 API v2는 이미지/영상만 다룬다. **사운드 이펙트 전용 공개 API 엔드포인트가 없다** — 웹사이트 검색 페이지(`pixabay.com/sound-effects/search/...`)에서만 브라우징 가능.
- **치명적 제약 — 이용약관:** Pixabay ToS는 "데이터 마이닝, 추출, 스크래핑 및 자동 데이터 수집/추출 프로그램·로봇 사용을 승인되지 않은 모든 목적에 대해 엄격히 금지"하며, "대량·시스템적 복제(bulk, large-scale or systematic copying)는 명시적 허가 없이 엄격히 금지"라고 명시한다. API 문서에도 "시스템적 대량 다운로드는 허용되지 않는다(Systematic mass downloads are not allowed)"고 재차 명시.
- **결론:** 라이선스 자체는 안전하지만 **스크립트 기반 자동 다운로드는 ToS 위반**. 사람이 브라우저에서 개별적으로 "Free Download" 버튼을 눌러 소량(예: 카테고리당 1~2개) 받는 것은 허용 범위로 보이나, 이는 자동화 파이프라인에 포함시킬 수 없다. **1차 조달 소스에서 제외**, 필요 시 보조 소스로 사람이 수동 확보.
- 확인 페이지: [pixabay.com/service/terms/](https://pixabay.com/service/terms/), [pixabay.com/service/about/api/](https://pixabay.com/service/about/api/)

### 1.2 Freesound.org — ✅ 1차 조달 소스 (조건부)

- **CC0 필터:** 검색 URL에 `f=license:"Creative Commons 0"` 쿼리를 붙이면 CC0 라이선스만 필터링됨. 예: `https://freesound.org/search/?q=rain&f=license%3A%22Creative+Commons+0%22`
- **API 키:** [freesound.org/apiv2/apply](https://freesound.org/apiv2/apply)에서 무료·즉시 발급(토큰 인증).
- **다운로드 방식 2가지:**
  - **원본 파일(최대 품질):** OAuth2 로그인 플로우 필요 (최초 1회 사용자 인증 → refresh token으로 이후 자동화 가능)
  - **프리뷰 파일(HQ mp3/ogg, 보통 128~192kbps):** **API 토큰만으로 다운로드 가능, OAuth2 불필요.** 모바일 앰비언스 사운드에는 이 품질로 충분 — 자동화 난이도를 크게 낮추는 핵심 발견.
- **레이트 리밋:** 분당 60회, 일 2,000회 (표준 검색/조회 기준).
- **⚠️ 법적 주의 — API 이용약관과 콘텐츠 라이선스는 별개다:**
  - 개별 사운드의 CC0 라이선스는 콘텐츠 자체에 대한 것 — 상업적 재사용에 제약 없음(원칙적으로 앱에 그대로 넣어도 무방).
  - 그러나 **Freesound API 서비스 이용약관**(`freesound.org/help/tos_api/`)은 "API의 상업적 이용 조건은 UPF(운영기관, Universitat Pompeu Fabra)와 개별 협의(case by case)가 필요하다"고 명시하며, 표준 무료 API 사용은 비상업적 목적을 전제로 설명되어 있다.
  - **권고:** API는 **검색·후보 발굴(read-only, 저볼륨)** 용도로만 사용하고, 실제 앱에 번들링할 최종 파일(~40~60개, 소량)은 **웹사이트에서 사람이 수동으로 다운로드**하는 것을 기본 경로로 삼는다. 이렇게 하면 API 상업 이용 조항의 회색지대를 피하면서도 CC0 콘텐츠 자체의 자유로운 상업적 사용은 그대로 누린다. 스크립트로 API를 통해 실제 앱 번들용 대량 자동 다운로드를 돌리는 것은 이번 조사 기준으로는 **권장하지 않음**(협의 없이는 애매).
- 참고: [freesound.org/docs/api/overview.html](https://freesound.org/docs/api/overview.html), [freesound.org/docs/api/authentication.html](https://freesound.org/docs/api/authentication.html), [freesound.org/help/tos_api/](https://freesound.org/help/tos_api/)

### 1.3 BBC Sound Effects (bbcrewind.co.uk) — ❌ 제외

- BBC 저작물이며 **RemArc Licence**로 공개 — "개인·교육·연구 목적"만 허용. **상업적 이용은 Pro Sound Effects를 통한 유료 라이선싱 필요.**
- 무료로 배포되는 클론 앱이라도 앱스토어 공개 배포는 "개인적 이용"의 범위를 넘어선다고 보는 것이 안전 → **전면 제외.**
- 확인: [sound-effects.bbcrewind.co.uk/licensing](https://sound-effects.bbcrewind.co.uk/licensing), [blog.prosoundeffects.com](https://blog.prosoundeffects.com/how-to-license-bbc-sound-effects-to-use-in-your-commercial-productions)

### 1.4 archive.org (Internet Archive) — ⚠️ 보조 소스, 개별 검증 필수

- **다운로드:** 인증 불필요, `https://archive.org/download/{identifier}/{filename}` 패턴으로 직접 URL 접근 가능 → 스크립트 자동화 용이.
- **라이선스 신뢰도 문제:** archive.org는 업로더가 CC 라이선스를 자율 선택하는 구조이며, **"Internet Archive는 아이템의 저작권 상태를 보증하지 않으며, 이용자가 자기 책임 하에 사용해야 한다"**고 이용약관에 명시. 즉 "CC0"로 표기되어 있어도 업로더가 실제 권리자가 아닐 위험이 존재.
- **실사례로 확인된 위험:** 조사 중 발견한 `naturesounds-soundtheraphy`, `ocean-sea-sounds` 컬렉션(업로더: Naturthusiast)은 라이선스가 CC0로 표기되어 있으나, 트랙명이 "Sound Therapy - Sea Storm", "Those Relaxing Sounds of Waves..." 등 **제3자 릴렉세이션 콘텐츠 재업로드로 의심되는 이름**이다. 업로더가 원 녹음자인지 불명확.
- **권고:** archive.org는 (a) 설명에 "내가 직접 녹음했다(field recording by me)"는 진술이 있거나, (b) 업로더가 다수의 자작 필드 레코딩을 꾸준히 올리는 정황이 있는 경우에만 채택. 브랜드성/편집물 느낌이 나는 타이틀은 배제. **최종 채택 전 사람이 청취 확인 + 업로더 이력 확인 필수.**
- 확인: [help.archive.org/help/rights/](https://help.archive.org/help/rights/), [wiki.creativecommons.org/wiki/Case_Studies/Internet_Archive](https://wiki.creativecommons.org/wiki/Case_Studies/Internet_Archive)

### 1.5 citizen-dj.labs.loc.gov (미국 의회도서관) — ❌ 카테고리 부적합으로 제외

- 라이선스는 확실히 안전(퍼블릭 도메인, 상업적 사용 무제한)하나, 콘텐츠가 **재즈·블루스·구연·요들 등 음악/구술 아카이브 샘플**이라 수면 앰비언스 카테고리(자연음·화이트노이즈류)와 맞지 않음. music/instruments 카테고리에도 앰비언트풍이 아니라 부적합. **채택하지 않음.**

### 1.6 기타 확인 소스

| 소스 | 라이선스 | 자동화 | 판정 |
|---|---|---|---|
| **Mixkit** | Sound Effects Free License — 상업적 사용 가능, 출처 표기 불필요(권장만), 회원가입 불필요. 단 "동일/경쟁 서비스 구축 금지", "스톡 미디어로 재판매 금지" 조항 있음(우리 사용 목적엔 무해) | 공식 API 없음 — 사람이 개별 다운로드 | ✅ 보조 소스로 채택 가능(수동) |
| **Zapsplat** | 무료 회원은 **반드시 앱 내 크레딧에 "Sound effects obtained from zapsplat.com" 표기 필요**(Gold 유료 계정만 표기 면제). 로그인 세션 기반이라 다운로드 자동화 불가 | 불가(로그인 필요) | ❌ 제외 — 로그인 필요 + 강제 크레딧이 "IAP 없음/전부 무료" 클론 방침과 마찰, 자동화 어려움 |
| **Kenney.nl** | 오디오 에셋(Digital Audio/UI Audio/Impact Sounds/RPG Audio) 전부 CC0 확인 | zip 일괄 다운로드 가능 | ❌ 관련성 낮음 — "Nature Kit"은 **오디오가 아니라 3D 모델 팩**이었음(확인 완료, 착오 주의). 나머지 팩은 UI/임팩트 SFX 위주라 수면 앰비언스에 맞지 않음 |
| **BigSoundBank** | 사이트 자체 라이선스(무료, 상업적 사용 가능 명시) 확인됨 | 개별 다운로드 | ⚪ 미탐색 — 필요 시 카테고리 보강용 후보로 후속 조사 |

## 2. 카테고리 → 조달 매핑

| 카테고리 | 조달 방식 | 소스 후보 | 비고 |
|---|---|---|---|
| Water | CC0 다운로드 | Freesound | 확보 완료(§3) |
| Rain | CC0 다운로드 | Freesound, archive.org(검증 조건부) | 확보 완료(§3) |
| Animals | CC0 다운로드 | Freesound (새소리 확보, 곤충류로 확장 가능) | 부분 확보 |
| Whispers | **v1 제외** | — | 사람 목소리 콘텐츠. 상업적 사용 가능한 CC0 속삭임 음성이 사실상 없고, 부적절한 콘텐츠 혼입 위험 → 실제 녹음/성우 섭외 필요 |
| Ocean | CC0 다운로드 | Freesound, archive.org(검증 조건부) | 확보 완료(§3) |
| Nature | CC0 다운로드 | Freesound | 확보 완료(§3, 숲/시냇물 계열) |
| Music/Instruments | CC0 다운로드 | Freesound (하프 계열 확보) | 확보 완료(§3) |
| Haircut(가위 ASMR) | CC0 다운로드 | Freesound | 확보 완료(§3) — 폴리(foley) 사운드라 음성 녹음 이슈 없음 |
| Positive Affirmations | **v1 제외** | — | 음성 녹음/TTS 필요. CC0 확언 음성 사실상 없음 |
| Lucid Dreaming | **v1 제외** | — | 반복 재생되는 "reality-check" 속삭임 문구 — 음성 녹음/TTS 필요, whispers와 동일 사유 |
| Camping | CC0 다운로드 | Freesound (캠프파이어, 귀뚜라미/밤벌레) | 확보 완료(§3) |
| Binaural Beats | **합성**(다운로드 불필요) | Web Audio 오실레이터(좌우 채널 주파수差) | 오디오 엔진(P1)에서 생성, 조달 대상 아님 |
| Background Noises | CC0 다운로드(보강 필요) | Freesound (선풍기 험 확보) | 카테고리 정의가 넓음 — 팬/공조 험 외에 카페 등은 city life와 중복 가능, 최소 1~2종으로 충분 |
| City Life | CC0 다운로드 | Freesound (교통/거리 앰비언스) | 확보 완료(§3) |
| Wind Chimes | CC0 다운로드 | Freesound | 확보 완료(§3) |
| Monks' Chanting | **대체 조달** | Freesound (Tibetan singing bowl / 명상 싱잉볼) | 실제 승려 목소리 챈팅 원본은 저작권·문화적 민감성 리스크가 있어 배제. **싱잉볼(법기) 사운드로 대체**하거나 카테고리명을 "Meditation Bells"로 조정 권고 |
| White/Pink/Brown/Green Noise | **합성**(다운로드 불필요) | 수학적 노이즈 생성(오디오 엔진) | 조달 대상 아님 |

**요약:** 17개 카테고리 중 **11개는 CC0 다운로드로 실확보(부분/완료)**, **2개는 합성**(노이즈, 바이노럴 비트), **2개는 v1 제외**(whispers, positive affirmations — lucid dreaming 포함 시 3개), **1개는 대체 조달**(monks chanting → singing bowl), **1개는 보강 필요**(background noises).

## 3. 카테고리별 확보 후보 음원 (실제 검색 확인, Freesound 기준)

> 전부 `freesound.org` 검색에서 `license:"Creative Commons 0"` 필터로 확인된 실제 결과. URL은 해당 검색 쿼리 페이지 기준(개별 사운드 페이지 URL은 다운로드 실행 시 해당 사운드를 클릭해 확정).

### Rain
검색: `https://freesound.org/search/?q=rain&f=license%3A%22Creative+Commons+0%22`
- "Heavy Rain" — EricsSoundschmiede
- "Ambience-summer rain 07-090718.wav" — ra_gun
- "Rain Hitting Window [1]" — SoundDesignForYou
- "Rain with distant traffic" — olsonbock623

### Ocean
- Freesound: 위 rain과 동일 방식으로 "ocean waves" 검색 필요(다음 라운드에서 직접 확보 권고)
- archive.org `ocean-sea-sounds`(⚠️ 업로더 검증 조건부): "Gentle Ocean", "Waves Gently Rocking Boat - 1/2" — 필드 레코딩 느낌의 타이틀이라 상대적으로 신뢰도 높음. "Sound Therapy - Sea Storm" 계열은 배제 권고.

### Water / Nature (숲·시냇물)
검색: `https://freesound.org/search/?q=forest+stream+water&f=license%3A%22Creative+Commons+0%22`
- "water_forest_stream_00_l.wav", "water_forest_stream_03_l.wav", "water_forest_stream_08_l.wav" — teadrinker (**루프용으로 제작된 시리즈, 우선 채택 추천**)
- "small stream forest" — Yuval (벨기에 아르덴 숲)
- "Small Falling Water Onto Stones.wav" — lolamadeus

### Camping (캠프파이어 + 밤벌레)
검색: `https://freesound.org/search/?q=campfire&f=license%3A%22Creative+Commons+0%22`
- "Campfire Close Crackling Sticks.mp3" — FunWithSound
- "Fire Crackling - Cozy Campfire & Fireplace SFX" — LilMati
- "Campfire (24 bit 44.1 kHz)" — cagankaya

검색: `https://freesound.org/search/?q=crickets+night+insects&f=license%3A%22Creative+Commons+0%22`
- "Night Crickets Ambience on Rural Property" — OwlStorm
- "Crickets At Night - Raw sound" — Defelozedd94

### City Life
검색: `https://freesound.org/search/?q=city+traffic+ambience&f=license%3A%22Creative+Commons+0%22`
- "Barcelona city light traffic from terrace" — Juno24
- "AMB CITY DAY MILD TRAFFIC ELECTRIC SAW IN BACKGROUND" — tferrino
- "Ambience inner city traffic.wav" — dnlburnett

### Wind Chimes (보너스 확보)
검색: `https://freesound.org/search/?q=wind+chimes&f=license%3A%22Creative+Commons+0%22`
- "Wind chimes 1" — giddster
- "Garden Wind Chimes" — HighPeakEmma
- "Wind Chimes (No Background Noise)" — mooncubedesign

### Animals (보너스 확보 — 새소리)
검색: `https://freesound.org/search/?q=birds+singing&f=license%3A%22Creative+Commons+0%22`
- "Birds Singing in a Park" — synth2
- "Open window and birds singing in the morning.wav" — Geri92

### Music/Instruments (보너스 확보 — 하프)
검색: `https://freesound.org/search/?q=harp+ambient&f=license%3A%22Creative+Commons+0%22`
- "Harp Melody Lovely Resonance 2.wav" — luckylittleraven
- "Harp Whimsical Riff.wav" — luckylittleraven

### Haircut/가위 ASMR (보너스 확보)
검색: `https://freesound.org/search/?q=scissors+cutting+hair&f=license%3A%22Creative+Commons+0%22`
- "snipping 01.wav" — lyndseymel ("헤어드레서 가위로 머리 주변에서 근접 녹음, 빗질/기타 소음 없음")
- "Scissors cutting" — lucho_pancho

### Monks' Chanting 대체 — Singing Bowl (보너스 확보)
검색: `https://freesound.org/search/?q=tibetan+singing+bowl&f=license%3A%22Creative+Commons+0%22`
- "Tibetan Singing Bowl" — FlashTrauma
- "Singing Bowl, long without reverb" — hollandm

### Background Noises (보너스 확보 — 실내 험)
검색: `https://freesound.org/search/?q=fan+hum+white+noise+background&f=license%3A%22Creative+Commons+0%22`
- "Large Floor Fan - Steady Deep Hum - 2 Minutes" — FansAreCoolAndRelaxing16

> **후속(Task #8, 2026-07-20 실행 완료):** ocean 카테고리 Freesound 직접 검색 완료(§3 반영), archive.org 후보 4건 개별 검증 — 전부 탈락(원저작자 불명 컴필레이션 또는 실제 라이선스 CC-BY-NC). whispers/affirmations/lucid dreaming 대체안(TTS 등)은 여전히 범위 밖.

## 4. 다운로드 자동화 설계 · 구현

> **구현 완료.** 아래는 최종 구조 — 경로가 최초 설계(`scripts/sound-pipeline/`)에서 `scripts/sounds/`로 조정됐다.

### 4.1 Manifest JSON 스키마 (구현됨: `scripts/sounds/manifest.json`)

```jsonc
{
  "id": "rain-heavy-01",                // 앱 내부 사운드 ID, kebab-case
  "category": "rain",                   // 17개 카테고리 슬러그 중 하나
  "title": "Heavy Rain",                // 원제
  "source": "manual",                   // manual(Freesound 등 사람이 받음) | archive.org(자동) | synthesized(파일 불필요)
  "sourceUrl": "https://freesound.org/people/EricsSoundschmiede/sounds/666624/",
  "license": "CC0-1.0",
  "author": "EricsSoundschmiede",
  "downloadUrl": null,                  // 자동 다운로드 시 채움
  "dateAcquired": null,                 // YYYY-MM-DD, 다운로드 실행일에 채움
  "notes": ""
}
```

실제 manifest는 25개 Freesound 항목(source: "manual") + 노이즈 4종·바이노럴 비트(source: "synthesized", 메타 기록만) + archive.org 검증 결과 메모(`_archiveOrgVerification` — 통과 항목 0건)를 담고 있다.

### 4.2 Node 다운로드 스크립트 (구현됨)

```
scripts/sounds/
├── manifest.json    # 위 스키마 실 데이터
├── download.mjs     # archive.org 자동 다운로드(체크섬+재시도) — manual/synthesized는 스킵+안내
├── process.mjs       # ffmpeg 후처리 → public/sounds/{category}/{id}.m4a
└── raw/              # 다운로드 스테이징(.gitignore 처리됨)
```

`download.mjs` 실행 결과(2026-07-20): 자동 다운로드 성공 0 / 실패 0 / 수동 대기 25 / 합성 대상 5. archive.org 항목이 manifest에 없어(§1.4 검증 결과 0건 통과) 자동 다운로드할 대상 자체가 없었음 — 코드는 `archiveIdentifier`/`archiveFilename` 필드가 있는 항목을 인증 없이 직접 fetch하도록 구현되어 있어 향후 검증 통과 항목이 생기면 바로 동작한다.

Freesound 25건의 실제 다운로드 절차·URL·저장 경로는 `docs/sound-manual-downloads.md`에 정리했다(사용자 수동 단계).

### 4.3 오디오 후처리 (ffmpeg)

1. **라우드니스 정규화** (트랙 간 음량 일관성, EBU R128):
   `ffmpeg -i raw.wav -af loudnorm=I=-23:TP=-2:LRA=7 -ar 44100 normalized.wav`
2. **루프 포인트:** v1은 자동 루프점 탐지 알고리즘 대신, 시작/끝 50~100ms 크로스페이드로 클릭/팝 노이즈만 제거하는 것을 기본값으로 함(충분히 자연스러운 무한 반복에는 부족할 수 있음 — 완전 심리스 루프는 P1 오디오 엔진에서 Web Audio `loopStart/loopEnd` 튜닝으로 후속 보완).
   `ffmpeg -i normalized.wav -af "afade=t=in:d=0.05,afade=t=out:st={dur-0.05}:d=0.05" looped.wav`
3. **포맷 변환 — ⚠️ 플랫폼 호환성 주의:** Capacitor iOS는 WKWebView(Safari 엔진)를 사용하며 **Web Audio `decodeAudioData`가 Ogg Vorbis를 지원하지 않는다.** 크로스플랫폼 호환을 위해 **OGG가 아니라 AAC(.m4a) 또는 MP3**로 변환해야 함.
   `ffmpeg -i looped.wav -c:a aac -b:a 96k -movflags +faststart out.m4a`
4. 최종 산출물: `public/sounds/{category}/{id}.m4a`

이 로직은 `scripts/sounds/process.mjs`에 구현됨. **⚠️ 블로커(2026-07-20 확인): 이 개발 환경에 ffmpeg가 설치되어 있지 않음**(`which ffmpeg` → not found). 지시에 따라 자동 설치는 시도하지 않았음 — `process.mjs`는 ffmpeg 부재를 감지하면 설치 안내만 출력하고 종료한다(exit 1). ffmpeg 설치(`sudo apt-get install ffmpeg` 등) 후 재실행하면 후처리가 진행됨. raw 원본 파일이 아직 하나도 없어(Freesound 수동 다운로드 대기 중) 어차피 이번 실행에서는 처리할 대상도 없었음.

### 4.4 용량 예산 (앱 번들 목표 <80MB)

- 사운드 40~60개 × 96kbps AAC, 루프 길이 15~40초 → 파일당 대략 **0.2~0.5MB**
- 예시: 50개 × 평균 0.35MB ≈ **17.5MB** — 넉넉한 여유. 필요 시 루프 길이를 길게(최대 60~90초) 잡아도 50개 기준 40MB 내외로 여유 있음.
- 노이즈 4종 + 바이노럴 비트는 런타임 합성이라 **번들 용량 0**.
- 결론: 오디오 에셋만으로는 80MB 예산에 크게 못 미침 — 여유분은 앱 코드/아이콘/폰트/i18n 리소스에 배정 가능.

## 5. `docs/sound-licenses.md` 라이선스 대장 포맷 정의

실제 다운로드 실행(P3) 시점에 아래 표 포맷으로 `docs/sound-licenses.md`를 채워나간다. 파일 헤더/컬럼 정의만 아래에 템플릿으로 준비해 둠 (별도 파일 `docs/sound-licenses.md`에 스켈레톤 생성 완료).

| 컬럼 | 설명 |
|---|---|
| 파일명 | 앱 번들 내 실제 파일 경로 (예: `sounds/rain/rain-window-01.m4a`) |
| 원제 | 소스 사이트의 원래 사운드 제목 |
| 소스 URL | 원본 페이지 URL (개별 사운드 상세 페이지, 검색 페이지 아님) |
| 라이선스 | CC0-1.0 / CC-BY-4.0(작성자명 명시) / Pixabay License / Mixkit Free License 등 정확한 라이선스명 |
| 저작자 | 업로더/녹음자 유저명 |
| 취득일 | YYYY-MM-DD, 실제 다운로드 실행일 |
| 비고 | 후처리 내역(정규화/루프/포맷변환) 또는 검증 메모(예: archive.org 업로더 검증 완료) |

## 6. 종합 요약 (main 보고용)

- **실제 확보 가능 카테고리:** 17개 중 11개 CC0 다운로드로 실제 후보 확보(완료/부분), 2개는 합성 대상이라 다운로드 불필요, 1개(monks chanting)는 싱잉볼로 대체 조달 가능 → **사실상 14개 카테고리가 v1에서 조달 가능.**
- **v1 제외 확정:** whispers, positive affirmations, lucid dreaming — 3개 카테고리는 음성 콘텐츠라 CC0 소스가 사실상 없음, 실제 녹음 또는 TTS 합성 별도 검토 필요.
- **블로커:**
  1. Pixabay는 라이선스는 안전하나 ToS가 스크립트 자동화를 명시적으로 금지 — API도 없음. 자동화 파이프라인에서 제외.
  2. Freesound API 자체의 상업적 이용 조항이 회색지대 — 검색/발견은 API로, 실제 앱 번들 파일은 사람이 웹사이트에서 수동 다운로드하는 것을 기본 경로로 권고.
  3. archive.org는 라이선스가 업로더 자기신고라 신뢰도 낮음 — 채택 전 개별 검증(청취+업로더 이력) 필수, 브랜드성 타이틀은 배제.
  4. BBC Sound Effects는 상업적 배포 앱에 쓸 수 없어 전면 제외.
  5. API 키 자체는 Freesound만 필요(무료 즉시발급), Pixabay/BBC/Zapsplat은 API 키 유무와 무관하게 애초에 자동화 경로가 없거나 부적합.
- **추천 조달 경로:** Freesound를 1차 소스로 삼되 **API는 검색/큐레이션 전용, 실 파일은 수동 다운로드**. 부족분은 Mixkit(수동)으로 보강. archive.org는 검증된 소수 항목만 보조로. Pixabay/BBC/Zapsplat/citizen-dj/Kenney는 이번 v1 파이프라인에서 제외.
