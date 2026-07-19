# Sleep Orbit 벤치마크 리서치 (기능·UX 명세)

> 조사: orbit-recon 에이전트, 2026-07-20. 본 문서가 "풀 클론" 범위의 정문(source of truth)이다.
> 사용자 확정 사항: **궤도 반경(중심 거리) = 볼륨** (2026-07-20 인터뷰 Round 5).

## 1. 앱 신원 & 링크

- **개발사:** SMB Studio LLC
- **iOS App Store (id 1215043393):** 현재명 **"Sleep Orbit: ASMR 3D Sounds App"**, 서브타이틀 "Whispers & Tingles for Sleep". 과거명 "Sleep Orbit: Relaxing 3D Sound" 등. URL: https://apps.apple.com/us/app/sleep-orbit-relaxing-3d-sound/id1215043393
- **Google Play (`net.sleeporbit`):** 현재명 **"Sleep Orbit: 3D ASMR Maker"**. URL: https://play.google.com/store/apps/details?id=net.sleeporbit
- **웹사이트:** https://sleeporbit.app — 무료 브라우저 믹서: https://sleeporbit.app/tools/free-sleep-sound-generator
- **플랫폼:** iPhone/iPad/iPod/Mac(M1+)/Vision Pro (iOS 15.1+); Android 7.0+. 카테고리 Health & Fitness. 9+. ~22개 언어. 용량 ~140–224 MB. 2026 중반 버전: iOS 2.0.6 / Android 2.2.7
- **평점/규모:** iOS 4.7★(3,400+), Play 1M+ 다운로드, 150+ 국가, App of the Day/Editor's Choice 이력

**동명이앱 확인:** 궤도 기반 믹서와 일치하는 앱은 이것 하나. 버전에 따라 이름만 변동(같은 앱/개발사).

## 2. 코어 컨셉 & 궤도 믹싱 UI (정의적 메커니즘)

화면 중심 = **사용자의 머리**. 머리 주위 **360° 공간에 음원을 배치**해 "사운드 코쿤"을 만든다. 배치가 공간감·볼륨을 결정:

- **드래그 배치:** 사운드를 중심 주위 임의 위치로 드래그. 좌/우/앞/아래 배치 위치에서 들림 (바이노럴, 헤드폰 권장) — App Store 설명
- **중심 거리 = 존재감/볼륨:** "사운드를 믹스 안에서 가깝게/멀게 이동" — 가까울수록 크게. (uptodown 설명; 사용자 확정: "궤도볼륨")
- **궤도 운동:** 기본적으로 각 사운드가 머리 주위를 **궤도로 돌며 랜덤하게 방향 전환**. 옵션에서 랜덤 궤도 비활성 가능(현재 방향 유지), **스와이프로 방향 조종**, 고정(permanent) 가능
- **제스처:**
  - 사운드 **홀드** → 위치 고정
  - 사운드 **핀치** → 궤도 원/타원 모양 변경
  - 사운드를 **하단으로 드래그** → 삭제
  - 사운드 오브 **탭/아래로 드래그** → 사운드별 고급 컨트롤 열기
- **무제한 레이어링:** 원하는 만큼 사운드 추가, **믹스 자동 저장**
- **오디오 엔진:** "8D 오디오 엔진"/바이노럴 공간음향 마케팅, 헤드폰 최적
- **유저 요청 미구현 기능(차별화 기회):** 궤도 경로 상 위치별 볼륨 변화(예: 비가 한 지점에서 커졌다 작아짐) — 미지원

## 3. 사운드 라이브러리

- **100+ 전문 녹음 사운드, 17개 카테고리.** 명시된 카테고리: water, rain, animals, whispers, ocean, nature, music/instruments, haircut(가위 ASMR), positive affirmations, lucid dreaming, camping, binaural beats, background noises (+ city life, wind chimes, monks' chanting 언급)
- **노이즈 제너레이터:** White / Pink / Brown / Green 노이즈
- **예시 사운드명 (웹 믹서):** Garden Rain, Seaside, Night Stream, Ethereal Spa, Marshland, Uplifting Harp, Cave Resonance, Running Water
- **ASMR:** 속삭임 단어/짧은 문구, 태핑, 가위 소리
- **루시드 드리밍:** 반복 재생되는 속삭임 reality-check 문구
- **사용자 오디오 임포트** (iOS: iCloud Drive/음악 라이브러리) → 3D 공간음향으로 변환

## 4. 기타 기능

- **슬립(종료) 타이머** — **젠틀 페이드아웃** 후 앱 일시정지(배터리 절약)
- **오프라인** 재생 (비행기 모드 동작), **백그라운드 재생** (2.0.6에서 장시간 백그라운드 세션 수정)
- **저장된 믹스/"spaces"** — 수면·휴식·집중·명상·스트레스 완화 루틴
- **테마/비주얼:** 다이내믹 풍경 테마, 다크 필드 위 컬러 사운드 오브, "비주얼 컨트롤 센터"(오브 탭 → 궤도 컨트롤)
- **알람/기상 기능 없음** (수면 유도 + 앰비언스 앱)

## 5. 수익화 (freemium) — 참고용 (클론은 전부 무료)

- Sleep Orbit Pro: $5.99 (일회성) / 사운드 번들: Nature·City Life 각 $0.99
- 구독: 주 $4.99, 연 $29.99–39.99, 라이프타임 $59.99
- 크레딧 팩(커스텀/AI 사운드·오디오 임포트): $2.99/100, $4.99/300, $7.99/1000

## 6. 클론 구현 인터랙션 요약 (빌드 스펙)

1. 원형 캔버스, 중심 = 청취자. 사운드 토큰을 필드로 드래그
2. **반경(중심 거리) → 볼륨/게인**, 각도 → 스테레오/바이노럴 팬(좌/우/앞/뒤)
3. 토큰별 궤도 애니메이션 — 기본 랜덤 방향, 고정 토글, 스와이프 방향 설정, 핀치로 원↔타원
4. 홀드=위치 고정, 하단 드래그=삭제, 탭=사운드별 고급 컨트롤
5. 무제한 레이어, 이름 있는 믹스/프리셋 자동 저장
6. 바이노럴/8D 렌더링(헤드폰) + White/Pink/Brown/Green 노이즈 제너레이터
7. 슬립 타이머+페이드아웃, 오프라인+백그라운드 재생
8. ~17 카테고리 ~100 사운드 (ASMR 속삭임·가위, 자연음, 바다, 비, 바이노럴 비트, 루시드 드림 문구), 사용자 오디오 임포트→공간화
9. 수익화: 벤치마크는 freemium이나 **클론은 전부 무료** (인터뷰 확정)

## 출처

[App Store](https://apps.apple.com/us/app/sleep-orbit-relaxing-3d-sound/id1215043393) · [Google Play](https://play.google.com/store/apps/details?id=net.sleeporbit) · [sleeporbit.app](https://sleeporbit.app) · [웹 믹서](https://sleeporbit.app/tools/free-sleep-sound-generator) · [Uptodown](https://sleep-orbit.en.uptodown.com/android) · [Aptoide](https://sleep-orbit.en.aptoide.com/app)
