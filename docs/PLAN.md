# Sleep Orbit 클론 — 전체 플랜

> 스펙 정문: `.omc/specs/deep-interview-sleep-orbit.md` (ambiguity 11.3%, PASSED)
> 벤치마크 명세: `docs/research/sleep-orbit-benchmark.md`
> 릴리즈: `RELEASE_MANIFEST.json` (blog-auto-poster 형식)

## 목표 한 줄

Sleep Orbit 풀 클론 — 웹 기반(Capacitor+React+Vite) 수면 사운드 믹서. **궤도 반경=볼륨, 각도=공간감(바이노럴), 궤도 애니메이션.** 완료 = 스토어 제출 패키지 전부 자동 산출(제출 버튼만 수동).

## 확정 결정 (인터뷰)

| 항목 | 결정 |
|------|------|
| 스택 | Capacitor + React + Vite, Web Audio API |
| 코어 UX | 중심=머리, 거리=볼륨, 각도=팬, 궤도 애니메이션(랜덤/고정/스와이프/핀치), 탭=개별 컨트롤 |
| 음원 | 하이브리드: 노이즈 4종(White/Pink/Brown/Green) 합성 + 자연음 CC0 자동 다운로드, 라이선스 대장 필수 |
| 수익화 | 전부 무료, IAP 없음 |
| i18n | 한국어 + 영어 |
| 알람 | 벤치마크에 없음 → 범위 제외 |
| 앱 이름 | **SleepRings** (작업명 확정 2026-07-20, docs/app-name.md — 8후보 중 충돌 최소). 작업 번들 ID `com.sleeprings.app` (스토어 제출 전 USPTO/KIPRIS 공식 조회 + 도메인 확인 필수, 제출 후 변경 불가 유의). "Sleep Orbit" 명칭·에셋 사용 금지 |
| 환경 | WSL2 — Android 서명 빌드까지, iOS는 Xcode 프로젝트 구성+절차 문서화(macOS 컴파일 불가) |

## 페이즈 로드맵

| Phase | 내용 | 완료 기준 (verify) | 상태 |
|-------|------|--------------------|------|
| P0 스캐폴드 | Vite+React+TS 초기화(Capacitor는 P5로), i18n 골격, 앱 이름 확정 | `npm run build`·`npm test` 통과, 이름 결정 기록 | ✅ d5a8f36 |
| P1 오디오 엔진 | Web Audio 믹서 그래프(게인·팬/HRTF·심리스 루프·페이드), 노이즈 4종 합성 | 엔진 단위 테스트 통과, 데모 페이지에서 동시 재생 | ✅ 04e604b (테스트 38건) |
| P2 오빗 믹서 UI | 원형 캔버스, 드래그 배치, 반경=볼륨·각도=팬 바인딩, 궤도 애니메이션+제스처(홀드/핀치/하단삭제/탭) | E2E: 배치→볼륨 변화→조합 재생 시나리오 통과 | ✅ c7dbbe4·3849c7b (opus 리뷰 완료 — HIGH 1 픽스 반영 중) |
| P3 사운드 라이브러리 | 다운로드 파이프라인(출처·라이선스 대장), 카테고리 카탈로그, 에셋 최적화 | `docs/sound-licenses.md` 전 음원 기록, 앱에서 카탈로그 브라우즈 | 🔄 파이프라인 ✅ ce66434, 음원 수동 대기 |
| P4 수면 기능 | 슬립 타이머+페이드아웃, 믹스 자동저장/프리셋, 오프라인, 설정 | E2E 통과, 새로고침 후 믹스 복원 | ✅ 420a78d·7f51a35 |
| P5 모바일 패키징 | Capacitor android/ios 프로젝트, 백그라운드 재생(네이티브 플러그인), Android 서명 AAB/APK 빌드 스크립트 | Android 빌드 산출물 생성 재현 가능, iOS 빌드 절차 문서 | ✅ b81ded9 (AAB 3.1MB 서명검증, 웹측 배선 #15 진행) |
| P6 스토어 자료 & 릴리즈 | 아이콘·스크린샷(자동 캡처)·한영 설명문·개인정보처리방침, RELEASE_MANIFEST 릴리즈 | 등록자료 일체 산출, 매니페스트 버전 기록 | ✅ 5f3b1a2·bef341b, **v0.1.0 릴리즈** (opus 최종 리뷰 승인) |

품질 게이트(전 페이즈): 단위+통합+E2E(Playwright), 커버리지 ≥80%, code-reviewer 승인 후 머지.

## 팀 구성 (/team 10, 사용량 절약 모드 — 2026-07-20 사용자 지시)

usage 정책: opus는 **설계 1회 + 페이즈 경계 배치 리뷰**에만. 구현은 설계 문서 기반 sonnet. 워커는 웨이브 방식 스폰(유휴 금지), 리드 wakeup 최소화.

| # | 역할 | 모델 | 담당 |
|---|------|------|------|
| 1 | team-lead | (메인 세션) | 오케스트레이션, 커밋, docs·매니페스트 관리 |
| 2 | architect | opus (1회성 설계) | 오디오 엔진·아키텍처 설계 문서 |
| 3 | code-reviewer | opus (페이즈 경계 배치 리뷰) | P1~2, P3~4, P5~6 경계에서 일괄 리뷰·시큐리티 |
| 4 | audio-engineer | sonnet | Web Audio 믹서 엔진 구현 (설계 문서 추종) |
| 5 | researcher | sonnet | 앱 이름 검증, 벤치마크 세부 확인 |
| 6 | ui-executor | sonnet | React 컴포넌트, 궤도 캔버스, 인터랙션 |
| 7 | designer | sonnet | 비주얼 테마·애니메이션·아이콘·스크린샷 |
| 8 | sound-pipeline | sonnet | CC0 다운로드 스크립트·라이선스 대장·에셋 최적화 |
| 9 | mobile-packager | sonnet | Capacitor·Android 서명 빌드·iOS 프로젝트·스토어 메타 |
| 10 | test-engineer | sonnet | 단위/통합/E2E·커버리지 게이트 |

## 문서 맵

- `docs/PLAN.md` — 이 문서 (플랜·상태)
- `docs/research/sleep-orbit-benchmark.md` — 벤치마크 기능·UX 명세 (정문)
- `docs/sound-licenses.md` — 음원 출처·라이선스 대장 (P3에서 생성)
- `docs/store/` — 스토어 등록자료 (P6에서 생성)
- `docs/ios-build.md` — macOS 빌드 절차 (P5에서 생성)
- `RELEASE_MANIFEST.json` — 버전·릴리즈 기록

## 수동 단계 대기 목록 (개발 완료 후 사용자 실행)

1. **Freesound 음원 25건 수동 다운로드** — `docs/sound-manual-downloads.md`의 목록을 받아 `scripts/sounds/raw/{category}/`에 배치 (Freesound API의 상용 약관이 회색지대라 자동화 제외; archive.org는 라이선스 검증 결과 0건 사용 가능)
2. **ffmpeg 설치** (`sudo apt-get install ffmpeg`) 후 `node scripts/sounds/process.mjs` 실행 → loudnorm·루프·AAC 변환
3. **개인정보처리방침 연락 이메일·시행일 기입** — `docs/store/privacy-policy-{ko,en}.md`의 placeholder 교체 (양대 스토어 제출 하드 요구사항, 최종 리뷰 L-2)
4. Android/iOS 스토어 계정·서명·제출 (P5~P6 산출물로 준비됨). 제출 전 키스토어 비밀번호 교체(`android/keystore.properties`) + 상표 공식 조회(USPTO/KIPRIS)

v0.1.0 카탈로그 실물은 합성 노이즈 4종(바이노럴은 타입만 존재 — v0.2.0에서 구현). 합성 근사 자연음은 v0.2.0 스코프.

## v0.2.0 고도화 스코프 (E2 승인 2026-07-20, `.omc/qa/enhancement-gaps.md`)

**enh-core(오디오·엔진)**: ① 궤도 경로별 볼륨 변화(차별화 — Orbit.volumeCurve + computeGain 각도 모듈레이션) ⑥ 바이노럴 비트 합성(궤도 팬 우회 경로) ⑦ 필터드 노이즈 자연음 4종(rain/wind/waves/stream — 팔레트 4→8) ⑧ HRTF 동시개수 임계 자동 stereo 강등
**enh-polish(UI·QA 백로그)**: ② 마스터 볼륨 UI ③ 'fixed' 궤도 모드 노출 ④ 궤도 속도 조절 ⑤ 궤도 모양 슬라이더(핀치 비접근 사용자) + QA Q5 백로그
**제외**: CC0 파일 카테고리(수동 대기), 오디오 임포트(v0.3), 풍경 테마, iOS 실기기, 브랜치 커버리지 보강(스트레치)

## 운영 규칙

- /loop 셀프 페이싱 자동진행. 수동 개입(스토어 계정·제출)은 전부 완료 후.
- 커밋: conventional commits, 페이즈/작업 단위 원자 커밋. main 직행(솔로 레포) 또는 feature 브랜치 — 팀 리드 재량.
- 벤치마크 명칭("Sleep Orbit")·로고·에셋 직접 복제 금지. 기능 벤치마크만.
- 미구현 차별화 아이디어(궤도 경로별 볼륨 변화 등)는 `docs/ideas.md`에 기록만 하고 클론 완성 후 검토.
