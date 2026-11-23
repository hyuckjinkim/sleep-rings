# Changelog

`npm run release`(commit-and-tag-version)가 커밋 이력(Conventional Commits)으로 갱신한다.
0.5.0 이하는 수동 릴리즈 기록(구 RELEASE_MANIFEST.json)을 옮긴 것으로, '참고'에 빌드 검증·후속 작업 메모가 있다.

## [0.7.0](https://github.com/hyuckjinkim/sleep-rings/compare/v0.6.0...v0.7.0) (2026-11-23)

### 기능

* **audio:** max volume cap and nursery setting ([d6d30b3](https://github.com/hyuckjinkim/sleep-rings/commit/d6d30b37749230b39df57bad81ea8d382b73418a))
* **mixer:** default to collapsing header, pin title + settings above it ([9fce34a](https://github.com/hyuckjinkim/sleep-rings/commit/9fce34a1295358cfafc45c68c15ccb810714c708))
* **mixer:** gentle per-sound volume variation (paid) ([0b4ba52](https://github.com/hyuckjinkim/sleep-rings/commit/0b4ba522524970e91ffcf389322fd3f8670f94c5))
* **mixer:** noise tone control for synthesized noise colors (paid) ([96f71a9](https://github.com/hyuckjinkim/sleep-rings/commit/96f71a981a26264c24a5500bf97cabfea7753b0b))
* **mixer:** share a mix as a link, open shared links on web and native ([4f49a4e](https://github.com/hyuckjinkim/sleep-rings/commit/4f49a4ee8c3759884d3f5c9ed3fd29b59703e75c))
* **mixer:** 플로팅 전환을 순간이동에서 대칭 모프로 — 빈 자리는 도크 슬롯으로 ([a6660da](https://github.com/hyuckjinkim/sleep-rings/commit/a6660dab778fa3e2206347d3f4f1a9de5f1f1d7c))
* **mixer:** 화면 구성 4종(바텀시트·접는 헤더·미니 바·플로팅)을 설정에서 비교 ([645b863](https://github.com/hyuckjinkim/sleep-rings/commit/645b863973f840d71067a9fd49934b861fe66df9))
* **mobile:** "play last mix" launcher shortcut ([ff07bed](https://github.com/hyuckjinkim/sleep-rings/commit/ff07bed804993ac3560c5e554962818652818c88))
* **mobile:** Android "play last mix" home-screen widget and Quick Settings tile ([acea687](https://github.com/hyuckjinkim/sleep-rings/commit/acea6874abd6f83bbe17c129f5b17342aecd88bc))
* **mobile:** iOS "play last mix" home-screen widget ([8d43034](https://github.com/hyuckjinkim/sleep-rings/commit/8d43034181239d2b4cb39672c2d1487d2c1a7541))
* **mobile:** Now Playing shows the mix name, artist and app icon ([1cb6deb](https://github.com/hyuckjinkim/sleep-rings/commit/1cb6debdca811fc969005ac2a6a000dde251bf53))
* **mobile:** Siri "Play SleepRings" / "Play last mix" via App Intents ([00ad378](https://github.com/hyuckjinkim/sleep-rings/commit/00ad378de85af4ecb8c4a523f988897744bfd2ee))
* **settings:** 언어 선택을 한국어·English 두 버튼으로, 선택 저장·기기 언어 감지 ([09c2ffb](https://github.com/hyuckjinkim/sleep-rings/commit/09c2ffbbb4eacddb093e39ad2368a729816b03d0))
* **sleep:** Android wake alarm that rings with the app closed ([2db6700](https://github.com/hyuckjinkim/sleep-rings/commit/2db67001ba2d7a2e0a0fff7d94dbf77b0271a811))
* **sleep:** backup notification for the wake alarm and bedtime start ([51a15b1](https://github.com/hyuckjinkim/sleep-rings/commit/51a15b11dc21c5301a1e09a202790cc8d5dba4e7))
* **sleep:** fade-in wake alarm while the app is running ([a95a025](https://github.com/hyuckjinkim/sleep-rings/commit/a95a025cd6587787444e06addc9573d4c09a4b66))
* **sleep:** iOS 26 wake alarm that rings with the app closed (AlarmKit) ([81cd77f](https://github.com/hyuckjinkim/sleep-rings/commit/81cd77ff56782386ec3f67da764a7e983f88cfb8))
* **sleep:** scheduled bedtime start while the app stays open ([32a4aaa](https://github.com/hyuckjinkim/sleep-rings/commit/32a4aaa34cec00eee7c7d9979f79ebb8ffd39f95))
* **sleep:** start fade-in, fade-out length setting and custom h:m timer ([0177b3b](https://github.com/hyuckjinkim/sleep-rings/commit/0177b3b8baad835c0d8348b13e8ba7c4c80b1b39))
* **theme:** 라이트/다크 모드, 배경색을 3단계로 통일, 설정에 테마·화면 구성 선택 ([ac79691](https://github.com/hyuckjinkim/sleep-rings/commit/ac796912f3ce486290800b5ee38a1bc098bff354))
* **web:** offline PWA with a hand-written service worker ([68601f6](https://github.com/hyuckjinkim/sleep-rings/commit/68601f643194f30fb491ee1251869e5ec717f137))

### 수정

* **audio:** cap the summed output, fade the intro stage, cache tone dB ([974623d](https://github.com/hyuckjinkim/sleep-rings/commit/974623d00c747706332cc859230afffa39237e1a))
* **audio:** don't suspend after an alarm dismiss while a file sound loads ([399dd8c](https://github.com/hyuckjinkim/sleep-rings/commit/399dd8caf7c9fedc413116e94f7f2bcd078faad9))
* **audio:** reject failed sound fetches and bake a true loop crossfade ([2c4a764](https://github.com/hyuckjinkim/sleep-rings/commit/2c4a76487a4debdcfee129a97f0959394e41694f))
* **audio:** run sleep fade on the audio clock via a dedicated night gain ([a2a05b2](https://github.com/hyuckjinkim/sleep-rings/commit/a2a05b278d23dc579eeff461a7f692263b1aec78))
* **deps:** bump Capacitor to 8.4.3 for GHSA-rvm3-566m-v7fv ([16f1dbc](https://github.com/hyuckjinkim/sleep-rings/commit/16f1dbc8f2a1203559463c8213f666509a52b611))
* **ios:** trust the AlarmKit prompt's answer, and describe the URL scheme exactly ([4bfd16b](https://github.com/hyuckjinkim/sleep-rings/commit/4bfd16b5cff8f5eddf079e1530d799b5c01f7e6f))
* **library:** drop sleep/brainwave claims from binaural sound names ([da607fe](https://github.com/hyuckjinkim/sleep-rings/commit/da607fee9b3bfdad3c095249c2f82c6c261abcdd))
* **lint:** React Compiler·react-refresh 경고 13건 정리하고 규칙을 에러로 되돌림 ([add0675](https://github.com/hyuckjinkim/sleep-rings/commit/add0675712432a1878fcd550b5e1c562990546c0))
* **mixer:** reopen a share link later, and open one pasted into a tab ([0e11bdc](https://github.com/hyuckjinkim/sleep-rings/commit/0e11bdc98124308a0c93c3d627129c541474a1e3))
* **mixer:** restore the saved mix once per app, not on every mount ([1e21bed](https://github.com/hyuckjinkim/sleep-rings/commit/1e21bed0ab5afbfb2761429762100f41e5212c2f))
* **mobile:** clear a leftover keep-alive service at boot ([e062fcc](https://github.com/hyuckjinkim/sleep-rings/commit/e062fccd3f60d939ea17272c6c35ec6ce65d5a9a))
* **mobile:** remove plugin listeners even when cleanup beats registration ([e1880dd](https://github.com/hyuckjinkim/sleep-rings/commit/e1880ddaec7528ff4fb63dfc82eeba48a4beb47c))
* **mobile:** start the Android keep-alive service with playback, not on background ([aacaaac](https://github.com/hyuckjinkim/sleep-rings/commit/aacaaac101c8f2981b053b789bbb653fbc9ad3b4))
* **sleep:** fire backup notifications after the in-app start, not on it ([d777cd1](https://github.com/hyuckjinkim/sleep-rings/commit/d777cd1bb5fc69cae1a30cce71ae3190207a4629))
* **sleep:** give the iOS alarm-access button a name of its own ([6fa4861](https://github.com/hyuckjinkim/sleep-rings/commit/6fa4861df76913c5eab461220617ecc204484465))
* **sleep:** mark the mix stopped when cancelling an alarm already ringing ([1cb71e2](https://github.com/hyuckjinkim/sleep-rings/commit/1cb71e29dbad73a5034598f08e559ff47eec7a79))
* **sleep:** native wake alarm never rings silently, rejects bad input ([ac04d3e](https://github.com/hyuckjinkim/sleep-rings/commit/ac04d3ef0ce06984b2a4f24cc8709661d991cbc3))
* **sleep:** never drop a wake alarm on relaunch, downgrade or a suspended clock ([ed3f887](https://github.com/hyuckjinkim/sleep-rings/commit/ed3f887819dbbf4c3bf085fdd9882108026c67c3))
* **sleep:** never end up with no alarm, and keep it across a relaunch ([cc55bc8](https://github.com/hyuckjinkim/sleep-rings/commit/cc55bc8a4cc50b8181964c7b54036d6cbb8e012c))
* **sleep:** restart stopped orbs when leaving the post-timer state ([9df6e24](https://github.com/hyuckjinkim/sleep-rings/commit/9df6e2479204f3690d5bf5a76e2e2a46fe9f95d5))
* **sleep:** show the notifications-off note instead of the backup promise ([b865221](https://github.com/hyuckjinkim/sleep-rings/commit/b865221f941267131104a33b20a6f12bdc0f7bbe))
* **sounds:** make the sound pipeline emit exactly the catalog's file paths ([0ea4731](https://github.com/hyuckjinkim/sleep-rings/commit/0ea4731f9bae461cc70392fb1c0d4d5ea82d3f82))
* **web:** cache only HTML as the shell, never fail on a cache write ([5873511](https://github.com/hyuckjinkim/sleep-rings/commit/5873511d93fb3339b027d2ac69189db8ae87fb02))
* **web:** keep the worker alive until a background cache write lands ([4485701](https://github.com/hyuckjinkim/sleep-rings/commit/44857018d99dd008a517b4368557d310d60639d8))
* **web:** match cached assets ignoring Vary so the app loads offline ([675c90c](https://github.com/hyuckjinkim/sleep-rings/commit/675c90c68343b9d6a3b95c888cb3b3fe4ebbdf73))
* **web:** precache every asset chunk at install so offline works fully ([840911b](https://github.com/hyuckjinkim/sleep-rings/commit/840911b4986f78781ce36cf575ddf356e4de3242))

### 구조

* **mixer:** keep UNTITLED_MIX_NAME out of the store ([9b04da7](https://github.com/hyuckjinkim/sleep-rings/commit/9b04da7bb5a0bed456ba0494a140cedf4d6a0895))
* 두 단어 모듈 파일 이름을 kebab-case → camelCase 로 ([5e6bbd1](https://github.com/hyuckjinkim/sleep-rings/commit/5e6bbd18ed1a46dbc7f7e1e743fc198d19820595))

### 문서

* README 추가 — 앱 소개, 실행·테스트·모바일 빌드·릴리즈 방법 ([6d8604f](https://github.com/hyuckjinkim/sleep-rings/commit/6d8604f26af072ee5f6a39186bb613f61e2d4381))
* README에 화면 캡처 4장 추가(assets/screenshots), 플로팅·언어 설명 갱신 ([8c9e710](https://github.com/hyuckjinkim/sleep-rings/commit/8c9e7102f8e014efd4b23a091f2a9f4b4eb435b7))
* **research:** feature candidates and staged roadmap ([e13d95f](https://github.com/hyuckjinkim/sleep-rings/commit/e13d95fc0085c8f7c2b5c1ce8aeb86a3431e4f73))
* visual-theme 두 문서와 roadmap-v030 머리에 상태 표시 ([0b89cfd](https://github.com/hyuckjinkim/sleep-rings/commit/0b89cfdaa3a495fbd2c77d990f256ffa479b5ace))

## [0.6.0](https://github.com/hyuckjinkim/sleep-rings/compare/v0.5.0...v0.6.0) (2026-11-17)

### 기능

* **mixer:** 오빗 필드 플로팅 미니 창·일자형 보기, 드래그 칩 가림 수정 ([8b9ae5b](https://github.com/hyuckjinkim/sleep-rings/commit/8b9ae5babe971ad31ef9440eed5d0802b5fb03de))

## 0.5.0 (2026-08-20)

사운드 전면 고급화 — 25종 라우드니스 통일(화이트 +13.6dB 편차 해소)·주기성 제거·루프 이음새 등파워 크로스페이드. 버퍼 캐시 메모리 상한 도입. 실기 렌더 관찰 기반 UI/UX 수정 6건(오브 식별·겹침, 토스트 가림, 설정 구매 진입점, 대비 AA, 토글 시맨틱). 마이너 범프 이유: 모든 사운드의 음색이 바뀌고 설정에 구매 진입 화면이 새로 생김

* test(audio): 48kHz 검증 강화 — 클램프 발동 탐지, birds 20시드 (59ec6d7)
* fix(mobile/policy): 재생 중 아닐 때 FGS·미디어세션 오선언 차단, 광고 SDK 지연 초기화(유료 사용자 ATT 미노출), iOS 세로 고정 (062ea8b)
* fix(design): 슬라이더 트랙 다크 테마 명시, 설정 화면 버튼 스타일 보완 (948c3f5)
* fix(a11y): 다이얼로그 포커스 트랩·Escape 실동작, 핀치 중 삭제존 배너 고착 수정 (b59ded4)
* docs/chore: 미사용 i18n 키 제거, 문서 화석 정정, QA 임시 스크립트 제거 (f7d4c9c)
* fix(audio): 사운드 고급화 — 라우드니스 통일·주기성 제거·루프 이음새 크로스페이드, 버퍼 캐시 메모리 상한 (6646acc)
* fix(ui): 실기 렌더 관찰로 잡은 QA 6건 — 오브 식별·겹침, 토스트 가림, 구매 진입점, 대비, 토글 시맨틱 (4e87812)

### 참고

* 릴리즈 커밋: e3bcfed
* 루프 이음새: 이전 구현이 버퍼 양끝을 0으로 페이드해 클릭 대신 매 루프 -20dB(white/rain)~-32dB(wind) 드롭아웃을 만들고 있었다. 버퍼 길이는 구멍의 깊이가 아니라 빈도만 바꾼다 — 등파워 크로스페이드로 교체. 검증: 22색 전부 wrap 델타가 자기 버퍼 최대 델타 이하, 레벨 편차 크로스페이드 -3.97dB vs 옛 방식 -9.58dB(동일 지표)
* TRAIN_CLICK_GAIN을 0.2에서 원래 0.65로 되돌렸다. 클램프는 클릭 게인이 아니라 되돌려진 중간 상태(generateBrownNoise 일시 RMS 정규화)의 부작용이었고, 현재 코드에선 0.65에서 48kHz 0/60·44.1kHz 0/20. 기차의 정체성인 덜컹거림을 10dB 깎을 이유가 없었다
* 메모리: 버퍼가 dispose()에서만 해제돼 무한 누적됐고, 주기성 제거로 버퍼가 40~72초가 되며 22색 전량 91MB에 도달한다(밤새 상주 = 안드로이드 LMK·iOS jetsam 대상). 재생 중이 아닌 버퍼를 유휴 예산 24MB 기준 LRU 해제 — 상한 = 재생 중 버퍼 + 24MB, 재생 중 버퍼는 미해제라 소리 무영향
* AAB 10.09MB -> 9.63MB (-0.46MB)
* ⚠️ 오너 필수: 10,000원 티어 상품 등록. 새소리·귀뚜라미·싱잉볼이 이 티어에 묶여 있어 2,000·5,000원만 등록하면 구매 시트는 뜨지만 매칭 상품이 없어 영구 구매 실패한다(3종 등록 또는 티어 하향 택1). 티어 라벨의 '(준비 중)' 표기는 이번에 제거했다
* 설정 화면에서 구매 시트 진입이 새로 가능해졌으나, RevenueCat API 키가 없으면(현재 웹/미설정 빌드) '결제 연동 준비 중' 안내로 대체된다 — 키 주입 시 같은 시트가 구매·복원 버튼으로 바뀐다
* 검증: 유닛 26파일 전 그린(파일별 실행), E2E 12/12(CI=1), tsc 0, AAB/APK 서명 검증 통과(CN=SleepRings), versionCode 7/versionName 0.5.0 산출물 확인

## 0.4.1 (2026-08-17)

opus 리뷰 HIGH 4건 반영 — ① 초기화 대기 중 요청한 배너가 설정 화면을 떠난 뒤 믹서 위에 뜨던 경로 차단(최신 의도만 반영) ② 부팅 시 엔타이틀먼트 재조회(구독 만료·환불 반영) ③ 설정 화면에 구매 복원 추가(App Store 3.1.1 요건) ④ 신규 사운드 6종에 48kHz 프로덕션 레이트 RMS·피크 검증 상설화

* fix(v0.4.1): 리뷰 HIGH 4건 — 배너 pending 취소 경로, 부팅 시 엔타이틀먼트 동기화, 설정 화면 구매 복원, 48kHz RMS 검증 (ff08a67)

### 참고

* 릴리즈 커밋: ff08a67
* 리뷰의 birds RMS 드리프트(0.0598~0.12) 주장은 재현되지 않음 — 배포 조건 10초·1초 구간 각 30회 측정 전부 0.1200, 밴드 이탈 0건. 재현 안 되는 측정으로 정규화를 바꾸는 대신 48kHz 검증을 테스트에 상설화해 실제 드리프트 발생 시 잡히게 함
* train·singing-bowl은 클램프 상시 발동(peak 정확히 1.0, RMS 목표 대비 -0.7dB) — 안전 동작이나 라우드니스 일관성 관점의 개선 여지로 기록
* 검증: 유닛 noise 55·app/plan 41·기타 파일별 전 그린, E2E 12/12(CI=1), tsc 0

## 0.4.0 (2026-08-17)

오너 결정 3건 이행 — ① 믹서와 분리된 설정 화면을 만들고 배너를 그 화면에만 배선(재생 화면 배치는 AdMob 우발적 클릭 정책 위반) ② RevenueCat 결제 연동(구매·복원, API 키 없으면 로컬 목 자동 폴백) ③ 프리미엄 합성 사운드 6종으로 10,000원 티어에 실질 콘텐츠 확보. 사운드 25종, 무료 15/25=60.0%

* feat(v0.4.0): 설정 화면·정책 안전 배너 배치, RevenueCat 결제 연동, 프리미엄 합성 사운드 6종 (f702405)

### 참고

* 릴리즈 커밋: f702405
* AAB 7.55MB → 10.09MB (+2.5MB, RevenueCat SDK). v0.2.0 3.65MB 대비 2.8배 — 수익화 SDK 2종이 아직 실수익을 내지 않는 상태이므로, 광고단위·상품 등록 전까지는 순수 용량 비용. 출시 시점에 재평가 권장
* 배너는 설정 화면에서만 노출. 믹서(재생 화면)에는 절대 배치 금지 — 정책 리스크
* 결제는 API 키 주입(src/plan/purchase-config.ts) 전까지 목으로 동작. 스토어 제출 전 RevenueCat 상품 등록 필수
* 검증: E2E 12/12(CI=1), 유닛 파일별 전 그린(noise 49·sound-engine 34·purchase 16·ads-lifecycle 2·Settings 5·Palette 13), tsc 0, AAB 서명 검증 통과

## 0.3.1 (2026-08-16)

opus 리뷰 지적 반영 패치 — 배너 배선 제거(단일 화면 구조상 조작 컨트롤 위에 겹쳐 AdMob 정책 위반 소지, 게다가 initAds pending으로 실제로 뜨지도 않았음), 첫 제스처의 노이즈 16색 선렌더 제거(≈35MB·메인스레드 블로킹 → load() 지연 캐시에 위임), 프리셋 캡 무통보 삭제를 안내 문구로, 리스팅·개인정보정책을 실제 출하 상태(광고 미표시·12종 무료)에 일치

* fix(release): 배너 배선 제거·노이즈 선렌더 제거·프리셋 캡 안내·문구 정합·binaural 집계 단언·버전 동기화 (de6089a)

### 참고

* 릴리즈 커밋: de6089a
* 광고는 코드(src/ads)·네이티브 설정 모두 유지하되 미배선 — 재생 화면이 아닌 전용 화면(라이브러리/설정)이 생기는 릴리즈에서 배선할 것
* 구독 게이트는 유지(무료 12/19). 단 구매 경로가 아직 없으므로 스토어 제출 전 RevenueCat 상품 등록·어댑터 연동 필수
* 검증: 유닛 12파일 103건, E2E 10/10(CI=1 신규 서버), tsc 0, build OK

## 0.3.0 (2026-08-16)

수익화·기능 확장 마이너 — 배너 광고(AdMob), 구독 티어 4종(무료 12/19=63% 개방), 합성 사운드 8종 추가(재생 19종), 화면 자동 꺼짐(암전 오버레이+wake-lock, 오디오 지속), 디자인 v2(사운드 아이콘 24종·배경 레이어·헤더 490→64px), 잠금화면 미디어컨트롤·햅틱. 리서치 4종(커뮤니티·수익화·플랫폼·경쟁) 기반. QA 3패스(기능·디자인UX·정합성보안) HIGH 3건 수정 반영

* fix(design): 모바일 탭 하이라이트·드래그 선택 억제, 스크린샷 스크립트 전용 포트 고정 + 스크린샷 재생성 (d4f85b2)
* fix(mixer): 컨트롤 팝오버 z-index 15 — 레이어 캡 토스트가 슬라이더를 가리던 스택 버그 (1ba38dc)
* fix(ads): 배너 라이프사이클 앱 배선 — 무료 플랜 한정·암전 중 숨김 (4d769a6)
* fix(store): 리스팅 '광고·구독 없음' 허위 문구 교정, 개인정보정책 구독 명시, iOS 버전 동기화 (79d0e8a)
* feat(plan): 구독 티어·플랜 게이트 — 무료 12/19(63%), 잠금 2종 구분, 레이어·프리셋 초과는 교체+안내 (9df317d)
* feat(v0.3.0): 합성 사운드 8종·화면 자동꺼짐(암전+wake-lock)·디자인 v2 통합·플랫폼 기능 (329813b)
* feat(ads): 배너 광고 통합 — AdMob 테스트 ID·웹 no-op 가드 (cefd06a)
* docs: v0.3.0 로드맵·PLAN 갱신 — 리서치 4종 종합 (d680ebd, 96b6858)

### 참고

* 릴리즈 커밋: d4f85b2
* AAB 크기 3.65MB → 7.55MB (AdMob SDK 추가분) — 광고 수익 대비 타당성은 출시 후 재평가
* 10,000원 티어는 코드 매핑만 존재, 콘텐츠(파일 음원) 확보 전까지 스토어 상품 등록 순연
* 출시 전 필수: AdMob 광고단위 ID 교체, RevenueCat 상품 2종 등록·실 어댑터 연동(현재 플랜은 로컬 저장 스텁), iOS ATT/Privacy Manifest 제출값 확인

## 0.2.1 (2026-08-16)

팔레트 3종(모두 제거+되돌리기·카테고리 탭·드래그 패닝) + 디자인 시스템 v2 에셋(사운드 아이콘 24종·배경 레이어). 서명 아티팩트는 광고/네이티브 트랙 진행 중이라 0.3.0에서 일괄 재빌드

* feat(design): 사운드 아이콘 24종·배경 레이어·디자인 시스템 v2 — 노이즈/바이노럴은 형태로 구분 (504537a)
* feat(mixer): 모두 제거(+undo)·카테고리 탭·팔레트 드래그 패닝 — 제스처 축 분리로 배치 드래그와 공존 (a4a0d7f)
* docs: v0.3.0 로드맵 — 리서치 4종 종합, 티어·광고·화면꺼짐·사운드확장 스코프 확정 (d680ebd)

### 참고

* 릴리즈 커밋: 504537a

## 0.2.0 (2026-07-20)

QA·고도화 사이클 — 6패스 QA(기능·디자인·UX·전문표준·정합성·보안)로 백로그 22건 도출·반영, 코어 고도화(궤도 경로별 볼륨 변화·바이노럴 합성·필터드 자연음 4종·HRTF 자동 강등), 키보드 접근성(WCAG 2.1.1)·마스터볼륨·궤도 컨트롤 확장. opus 리뷰 승인(C0/H0), 파일별 단독 검증 117 테스트·E2E 5

* feat(mixer): volumeCurve UI 배선 완결 — 팝오버 토글+depth 슬라이더, fade-in 가드 (dd10e91)
* feat(audio): E3 코어 고도화 — 궤도 경로별 볼륨 변화, 바이노럴 비트 합성, 필터드 자연음 4종(RMS 정규화), HRTF 자동 강등 (5dfa153)
* feat(polish): QA 백로그 P1·P2 + UI 4종 — 키보드 접근성(B1/B2), 해제버튼·sleeping 동기화, 44px 타겟, 마스터볼륨·fixed·속도·모양 컨트롤 (5e267aa)
* docs(qa): 종합 QA 보고서 — 6패스 종합, 백로그 B1~B22 (a8a5e5b)
* docs: v0.2.0 고도화 스코프 확정 — 카탈로그 실물 불일치 교정 (631a81e)

### 참고

* 릴리즈 커밋: dd10e91

## 0.1.0 (2026-07-20)

SleepRings 초기 릴리즈 — Sleep Orbit 기능 벤치마크 기반(웹 Capacitor). 궤도 믹서(반경=볼륨·바이노럴·제스처)+노이즈 4종 합성+슬립 타이머·프리셋+백그라운드 오디오+서명 AAB/APK+스토어 등록자료. opus 최종 리뷰 승인(CRITICAL/HIGH 0), 테스트 85건·커버리지 Stmts 82%

* chore: versionName 0.1.0 동기화 — 릴리즈 매니페스트와 정합 (최종 리뷰 L-3) (0448b97)
* fix: 최종 리뷰 픽스 — fade-in 램프 보존(lastGain), 슬립 완료 후 재관여 resume, 프리셋 페이드, 잠금 사운드 팔레트 숨김 (1e1289b)
* test: Orb/OrbitField 제스처 컴포넌트 테스트·페이드 경로 보강, v8 커버리지 게이트 — Stmts 82%/Lines 84% (b1d5138)
* feat(assets): 앱 아이콘·스플래시 전 해상도 생성(@capacitor/assets), 알림 아이콘 실모티프 교체 — 서명 AAB 3.5MB 재빌드 (bef341b)
* feat(mobile): 백그라운드 오디오 웹측 배선 — init 1회 + 첫 제스처 킵얼라이브(네이티브 한정) (e07b74f)
* feat(store): 스토어 등록자료 — 한·영 리스팅(글자수 실측 검증)·개인정보정책·스크린샷 8장 자동 캡처 (5f3b1a2)
* feat(mobile): Capacitor 8 패키징 — Android 서명 AAB/APK 빌드 성공, 포그라운드 서비스 플러그인, iOS 프로젝트+빌드 문서 (b81ded9)
* fix(test): vitest 4 API 정정 — drvfs 워커 경합 완화 (b1ea463)
* feat: 앱 타이틀 SleepRings 확정 (7802091)
* fix(mixer): P0~P2 리뷰 픽스 — H1 load-play 레이스 가드, M1 로드실패 처리, M2 페이드, 제스처 엣지 L1-L3 (7f51a35)
* feat(sleep): 슬립 타이머·믹스 자동저장/복원·프리셋 — suspended-start 복원 정책 (420a78d)
* test(e2e): 콘솔·페이지 에러 감시 게이트 (3849c7b)
* feat(mixer): 실엔진 배선·테마 토큰 통합 — 스냅백 버그 수정 (c7dbbe4)
* feat(mixer): 오빗 믹서 UI — 드래그 배치·궤도 rAF·제스처, zustand store (2d38103)
* feat(audio): SoundEngine — HRTF/StereoPanner 이중 경로, 노이즈 4종 합성, 테스트 38건 (04e604b)
* feat(sound): 음원 파이프라인 — Freesound 25건 수동 목록·합성 5종 체제 (ce66434)
* feat(design): 디자인 토큰·비주얼 테마·앱 아이콘 — WCAG 대비 검증 (6c3a69f)
* docs(design): 아키텍처·오디오 엔진 설계 (fff4e24)
* feat: P0 웹 스캐폴드 — Vite+React+TS, vitest·Playwright, ko/en i18n (d5a8f36)
* docs: 앱 작업명 SleepRings 확정 — 상표·스토어 충돌 검토 (0f18098)
* docs: 프로젝트 초기화 — 딥인터뷰 스펙 기반 플랜·벤치마크 리서치 (5cfc2af)

### 참고

* 릴리즈 커밋: 0448b97
