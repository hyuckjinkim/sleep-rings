# Android 빌드 — Capacitor 패키징 (Task #9)

> 환경: WSL2 Ubuntu, **sudo/apt 미사용** — JDK·Android SDK 전부 유저 공간 설치.
> 관련: `docs/design/audio-engine.md` §6(백그라운드 재생), `docs/PLAN.md` P5.

## 1. 빌드 환경 (재현 절차)

sudo 없이 `~/.local/`, `~/android-sdk/`에 설치. `~/.bashrc`에 아래 env가 추가돼 있다(새 셸이면 자동 적용):

```bash
export JAVA_HOME="$HOME/.local/jdk21/jdk-21.0.11+10"
export ANDROID_HOME="$HOME/android-sdk"
export ANDROID_SDK_ROOT="$HOME/android-sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

**JDK 버전 주의**: Temurin **17**로 처음 시도했으나 `capacitor-android` 모듈 컴파일이
`Java compilation initialization error: invalid source release: 21`로 실패했다 — Capacitor 8의
Android 모듈은 **JDK 21**을 요구한다. `~/.local/jdk21/`에 Temurin 21을 별도 설치해 해결(17도
`~/.local/jdk/`에 남아있으나 이 프로젝트 빌드엔 21을 써야 함).

설치된 SDK 패키지: `platform-tools`, `platforms;android-35`, `platforms;android-36`(=
`compileSdk`/`targetSdk`), `build-tools;35.0.0`, `build-tools;36.0.0`. cmdline-tools는
`~/android-sdk/cmdline-tools/latest/`(zip에서 압축 풀 때 `unzip`이 없어 `python3 -m zipfile`로
대체). 라이선스는 `sdkmanager --licenses`로 전부 동의 처리됨.

## 2. Capacitor 설정

`capacitor.config.json` (appId `com.sleeprings.app`, appName `SleepRings`, webDir `dist`).

**`.ts` 대신 `.json`을 쓴 이유**: 처음 `capacitor.config.ts`로 작성했으나 `npx cap add android`가
`TypeError: Cannot read properties of undefined (reading 'CommonJS')`로 실패했다 —
`@capacitor/cli`의 내부 TS 설정 로더가 `ts.ModuleKind`를 참조하는데, 프로젝트의
`typescript@^7.0.2`(베타 계열)에서 그 API 형태가 바뀌어 깨진다. Capacitor CLI가 JSON 설정을
동일하게 지원하므로 `.json`으로 전환해 이 비호환을 완전히 우회했다 — 별도 트랜스파일 의존성이
없어 오히려 더 견고하다.

## 3. 백그라운드 재생 플러그인 — 실측 결정

`audio-engine.md` §6/§8-3은 "`@jofr/capacitor-media-session`의 Cap8 대응을 mobile-packager가
실제 설치·검증하거나 `@capgo`로 대체"하라고 명시했다. 실측 결과:

| 후보 | 확인 결과 | 채택 여부 |
|---|---|---|
| `@jofr/capacitor-media-session@4.0.0` | `npm view` 결과 `peerDependencies: {"@capacitor/core": "^6.0.0"}` — Cap 8과 명시적으로 불일치 | **미채택** |
| `@capgo/capacitor-native-audio@8.4.17` | peerDep `>=8.0.0`으로 Cap8 호환 선언, `cap sync android`도 통과. 다만 **README에 "포그라운드 서비스는 플러그인이 관리하지 않음, 직접 구현 필요"라고 명시** — 순수 오디오 렌더 플러그인이라 1안(웹 오디오 유지 + 프로세스 킵얼라이브)이 필요로 하는 "포그라운드 서비스 자체"를 제공하지 않는다. 또 HLS(m3u8) 선택적 의존성이 APK에 ~4MB를 추가해 1안의 "네이티브 오디오 렌더 코드 0" 취지에도 안 맞음 | **미채택** (설치 후 검증하고 제거) |
| `@capawesome-team/capacitor-android-foreground-service@8.1.0` | peerDep `>=8.0.0`, `npx cap sync android` 통과, 실제 gradle 서명 빌드까지 성공 확인. 정확히 "포그라운드 서비스 + 알림"만 하는 목적 일치 플러그인(robingenz/Capawesome — Capacitor 생태계에서 잘 알려진 유지보수자) | **채택** |

즉 §6 1안의 Android 요소("무음 웹 킵얼라이브 + 포그라운드 서비스로 프로세스 유지 + 미디어 알림")를
`@capawesome-team/capacitor-android-foreground-service`로 구현했다. **네이티브 오디오 렌더링
코드는 여전히 0줄** — Web Audio 오빗 믹스가 그대로 렌더링되고, 이 플러그인은 프로세스가
백그라운드에서 죽지 않도록 알림만 띄운다.

### AndroidManifest.xml 변경

`android/app/src/main/AndroidManifest.xml`에 추가:
- 권한: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`, `POST_NOTIFICATIONS`
- `<application>` 내부: `NotificationActionBroadcastReceiver` + `AndroidForegroundService`
  (`android:foregroundServiceType="mediaPlayback"`)

플러그인 API의 `ServiceType` enum에는 `Location`/`Microphone`만 있고 `MediaPlayback`이 없는데,
서비스 타입은 매니페스트의 `android:foregroundServiceType` 속성이 실제로 결정하므로(런타임 JS
호출에서 `serviceType`은 생략 가능한 선택 파라미터) 문제되지 않는다 — 매니페스트 선언만으로
Android 14+ 요구사항을 충족한다.

**알림 아이콘**: `android/app/src/main/res/drawable-{m,h,xh,xxh,xxxh}dpi/ic_stat_sleeprings.png` —
(#12b에서) `assets/icon.svg`의 실제 초승달 모티프로 교체 완료. 손으로 근사한 벡터 대신, 소스 SVG의
두 원(`cx=512,cy=470,r=150` 빼기 `cx=574,cy=436,r=140`)을 SVG `<mask>`로 합성해(단순 겹친 원 2개를
evenOdd로 두면 겹치지 않는 바깥쪽 조각까지 남아 모양이 깨짐 — mask는 진짜 알파 구멍을 뚫어 정확한
초승달만 남는다) `sharp`(`@capacitor/assets`가 끌어온 전이 의존성)로 밀도별 PNG 5장을 렌더링.
기존 `drawable/ic_stat_sleeprings.xml` 플레이스홀더는 삭제.

## 4. 웹 쪽 통합 — `src/mobile/`

`src/mixer/` 파일은 건드리지 않았다(다른 에이전트가 동시 작업 중이기도 함). 대신
`src/mobile/`에 믹서 엔진과 구조적으로만 결합된(덕 타이핑, import 없음) 독립 모듈을 뒀다:

- **`src/mobile/background-audio.ts`**
  - `BackgroundAudioTarget` 인터페이스 — `SoundEngine`의 `onEnterBackground()`/`onEnterForeground()`와
    구조적으로만 일치(직접 import 안 함).
  - `initBackgroundAudio(target)` — `@capacitor/app`의 `appStateChange` 이벤트를 구독해
    `target.onEnterBackground/Foreground()`를 호출하고, Android에서는 동시에
    `startAndroidKeepAliveService()`/`stopAndroidKeepAliveService()`를 호출. cleanup 함수 반환.
  - `startKeepAliveAudio()` — `/mobile/silence.wav`(0.5초 무음, `public/mobile/silence.wav`,
    stdlib `wave` 모듈로 생성한 8kHz/16bit PCM)를 loop 재생하는 `<audio>` 엘리먼트 생성. **반드시
    사용자 첫 제스처 핸들러에서 호출**해야 한다(오토플레이 정책) — 모듈 로드 시점에 호출하면
    브라우저가 조용히 막는다.
- **`src/mobile/foreground-service.ts`** — `@capawesome-team/capacitor-android-foreground-service`
  래퍼. `startAndroidKeepAliveService()`/`stopAndroidKeepAliveService()` (Android 외 플랫폼은 no-op).
- **`src/mobile/index.ts`** — 배럴.

### 배선 지점

1. **`initBackgroundAudio(soundEngine)`** — Task #15에서 `src/main.tsx`에 적용 완료(앱 시작 시
   1회, `createRoot(...).render()` 이전).
2. **`startKeepAliveAudio()`**는 여전히 첫 사용자 제스처 핸들러(=`soundEngine.init()`과 같은
   호출 지점)에 연결이 필요 — `sound-engine.ts`의 `onEnterBackground()` 주석이 이 지점을
   가리킨다. 정확한 훅 위치는 UI/오디오팀이 "첫 제스처" 판정 로직을 갖고 있는 곳에서 결정.

## 5. 서명 릴리스 빌드

- 키스토어: `android/keystore/sleeprings-release.keystore` (PKCS12, RSA 2048, 유효기간
  10000일 = ~2053년). `keytool -genkeypair`로 생성 — 최신 keytool은 PKCS12 keystore에서
  store/key 비밀번호를 분리 지원하지 않아 동일 비밀번호를 씀.
- 비밀번호: `android/keystore.properties`에 **무작위 생성값**으로 기록(24자, `openssl rand`).
  **`.gitignore`에 이미 `*.keystore`/`*.jks`/`keystore.properties`가 등록돼 있어 커밋되지
  않는다.** 실제 스토어 제출 전 반드시 값을 교체할 것 — 비밀번호 자체는 이 문서/보고에 적지
  않음, 파일 위치만 명시.
- `android/app/build.gradle`에 `signingConfigs.release`를 추가해 `keystore.properties`를
  읽는다. 파일이 없으면(예: CI에서 시크릿 미주입) 자동으로 unsigned release로 폴백한다.

## 6. 빌드 스크립트 & 산출물

```bash
npm run build:android
# = vite build && npx cap sync android && cd android && ./gradlew bundleRelease assembleRelease
```

실제 실행 결과(WSL2, /mnt/d 드라이브라 gradle이 느림 — 최초 빌드 8분 35초, gradle
distribution 다운로드 포함; #12b 실아이콘 반영 후 재빌드는 2분 26초):

- **AAB**: `android/app/build/outputs/bundle/release/app-release.aab` — 3,651,390 bytes (~3.5MB)
- **APK**: `android/app/build/outputs/apk/release/app-release.apk` — 3,871,452 bytes (~3.7MB)
- (#9 최초 빌드는 기본 Capacitor 플레이스홀더 아이콘 기준 AAB 3.0MB/APK 3.1MB였음 — #12b에서
  실제 아이콘·스플래시로 교체하며 커진 것, 정상)

서명 검증(둘 다 종료 코드 0):

```
apksigner verify app-release.apk
  → Verified using v2 scheme (APK Signature Scheme v2): true, Number of signers: 1

jarsigner -verify app-release.aab
  → jar verified.
  (경고: "PKIX path building failed: unable to find valid certification path" — 자체 서명
   인증서라 신뢰 루트 체인이 없다는 뜻으로 정상. Google Play는 자체 서명 앱 서명 키를 그대로
   받는다 — CA 체인 필요 없음.)
```

`npm test`(68건) 회귀 없음 확인(#9 시점). `npm run typecheck` 통과(#9, #12b 둘 다).

## 7. 알려진 제약 / 후속 작업

1. ~~`startKeepAliveAudio()` 미배선~~ — **#15에서 해소(e07b74f).** `main.tsx`의
   `initBackgroundAudio(soundEngine)` + `Mixer.tsx` 첫 제스처 핸들러의
   `Capacitor.isNativePlatform()` 가드 하 `startKeepAliveAudio()` 호출로 양쪽 모두 배선 완료.
2. ~~알림 아이콘이 placeholder~~ — **#12b에서 해소.** `assets/icon.svg`의 실제 초승달 모티프로
   교체 완료(§3).
3. **무음 킵얼라이브의 신뢰성은 실기기 미검증** — `audio-engine.md` §8-1의 최대 리스크가 여전히
   열려있음. Android는 포그라운드 서비스로 프로세스 자체는 보장되지만, WebView 내 Web Audio
   컨텍스트가 Doze/앱 대기 모드에서 실제로 계속 렌더링하는지는 실기기 테스트 필요.
4. **`versionCode`/`versionName`은 `1`/`"1.0"` 그대로** — `RELEASE_MANIFEST.json`과의 동기화는
   범위 밖(팀 리드 관리 영역).

## 8. 화면 자동 꺼짐 + 플랫폼 기능 (Task B3, v0.3.0)

`.omc/research/platform-capabilities.md` §1/§3의 결론(iOS/Android 둘 다 앱이 화면을 직접 끄는 API
없음)을 그대로 따라 구현했다. `src/screen/`(신규) + `src/mobile/`에 추가.

### 화면 자동 꺼짐 — 암전 오버레이 + Wake Lock 해제

- **`src/screen/store.ts`**: 무동작(포인터/키 입력 없음) N분(5/10/30/사용안함) 후
  `dimmed: true`로 전환하는 zustand 스토어. 슬립 타이머(`src/mixer/store.ts`의
  `startSleepTimer`)와 완전히 독립 — 이쪽은 `soundEngine`을 전혀 import하지 않아서, 암전이
  오디오를 건드릴 방법 자체가 없다(구조적으로 보장).
- **`src/screen/wake-lock.ts`**: 네이티브 플러그인 없이 표준 **Screen Wake Lock API**만 사용.
  `@capacitor-community/keep-awake`는 Cap8 미지원(R3 확인)이고, Cap-go 포크를 붙이는 것보다
  — 이 기능의 진짜 보장은 암전 오버레이 쪽이고 wake-lock은 OLED 패널의 실제 절전을 돕는
  best-effort 보조일 뿐이라 — 의존성 추가가 정당화되지 않는다고 판단(YAGNI). 브라우저/WebView
  미지원 시 전부 조용히 no-op(`'wakeLock' in navigator` 가드).
- **`src/screen/ScreenDimOverlay.tsx`**: `position:fixed; inset:0; background:#000` 풀스크린
  오버레이. `pointerdown/pointermove/keydown/touchstart` + `visibilitychange`로 활동을
  감지해 타이머를 리셋하고, 암전 중이면 즉시 해제한다.
- **`src/screen/ScreenDimSettings.tsx`**: 5/10/30/사용안함 선택 UI.
- **배선 완료**: 두 컴포넌트 모두 `src/sleep/SleepControls.tsx`(이 워커 소유)에서 이미
  렌더링 중 — `App.tsx`는 건드리지 않았다. `ScreenDimOverlay`가 `position:fixed`라 트리상
  위치는 무관하게 항상 뷰포트 전체를 덮는다. 리드가 원하면 나중에 `App.tsx` 루트로 옮겨도
  되지만 필수는 아니다(이미 실동작 확인, 아래 검증 참조).
- **영속화**: `src/screen/persistence.ts`, localStorage 키 `so.screenDim`,
  `src/sleep/persistence.ts`와 동일한 `{version, value}` 스키마 규약.

### 잠금화면 미디어 컨트롤 — 네이티브 플러그인 대신 표준 Media Session API

- **`src/mobile/media-session.ts`**: `@capgo/capacitor-media-session` 같은 플러그인을 붙이지
  않고 `navigator.mediaSession`(표준 API)만 사용. 재생/정지만 요구사항이고, Android Chromium
  WebView(전 버전)와 iOS 15+ WKWebView 양쪽이 이미 커버하므로 플러그인이 주는 추가 이득이
  없다고 판단(YAGNI) — R3가 제시한 두 옵션(플러그인 vs 웹 API) 중 웹 API를 채택.
  `BackgroundAudioTarget`(`background-audio.ts`가 이미 정의한 구조적 인터페이스)을 그대로
  재사용해 play→`onEnterForeground()`, pause→`onEnterBackground()`에 매핑.
  `'mediaSession' in navigator` 가드로 미지원 플랫폼은 no-op.
- **배선 필요(리드 또는 App/main 소유자)**: `main.tsx`의 `initBackgroundAudio(soundEngine)`
  바로 아래에 `initMediaSession(soundEngine, t('app.title'))` 한 줄 추가. (`soundEngine`이
  이미 `BackgroundAudioTarget` 구조를 만족하므로 추가 어댑터 불필요.)

### 햅틱 — 채택, 기본 ON + 전역 스위치

- **`@capacitor/haptics@8.0.2`** 설치(공식 코어 플러그인, 기존 `@capacitor/*` 8.x 스택과
  정합). `src/mobile/haptics.ts`: `hapticTap()`은 항상 `ImpactStyle.Light`만 사용(다른
  강도는 야간 앱에 과함) + `localStorage`(`so.hapticsEnabled`, 기본 on) 전역 on/off. 미지원
  플랫폼(웹)에서는 `Haptics.impact()` 호출이 실패해도 catch로 삼켜 무해.
- **배선 필요(`src/mixer/store.ts` 소유자)**: 이 워커는 `src/mixer/**`를 건드릴 수 없어
  직접 연결하지 못했다. 정확히 3곳에 `hapticTap()` 한 줄씩 추가하면 된다 —
  `addPlacement()`(오브 배치 성공 시), `removePlacement()`/`restoreLastRemoved()`(삭제·복원),
  `toggleLocked()`(고정 토글). `import { hapticTap } from '../mobile/haptics'` 한 줄 + 각
  액션 끝에 `hapticTap()` 호출.

### 화면 방향 잠금 — 세로 고정 권고, 매니페스트 한 줄이 정답 (미구현)

`src/mixer/mixer.css`의 필드가 `width: min(92vw, 420px)`로 사실상 정사각형 고정 크기라
가로모드(예: 812×375)에서는 세로 여백이 부족해 `App.tsx`의 세로 스택 레이아웃(제목+마스터볼륨+
슬립타이머+믹서필드+팔레트)이 잘리거나 과도한 스크롤이 생긴다 — **세로 고정이 적절하다.**

R3가 확인했듯 가장 확실한 방법은 플러그인이 아니라 `AndroidManifest.xml`의
`android:screenOrientation="portrait"` 한 줄(전체 앱 고정, 플러그인 불필요) — 이 파일은
`android/**`라 이 워커가 건드릴 수 없다. 리드 또는 android 소유자가 MainActivity의
`<activity>` 태그에 추가하면 끝. Screen Orientation Web API(`screen.orientation.lock()`)는
WebView에서 fullscreen 컨텍스트 없이는 신뢰할 수 없어(주요 브라우저의 일반적 제약) 채택하지
않았다.

### 검증

- 단위 테스트 3개 파일, 각 파일 단독 실행으로 통과 확인: `src/screen/store.test.ts`(가상
  타이머로 무동작 타이머 로직 5건), `src/screen/persistence.test.ts`(영속화 왕복 6건),
  `src/screen/wake-lock.test.ts`(no-op 가드 포함 3건) — 총 14건.
- `npm run typecheck`, `npm run build` 통과.
- E2E 신규 `e2e/screen-dim.spec.ts`: 사운드 배치 → 암전 타이머 발동(테스트 전용
  `window.__SO_TEST_DIM_MS__` 오버라이드로 800ms 대기, 실사용자 경로엔 절대 등장하지 않는
  전역) → 오버레이 표시 확인 → **오브가 `is-loading` 클래스를 얻지 않음을 확인(=재생 지속,
  B17 패턴이 이미 이 클래스를 "정지 상태" 신호로 씀)** → 탭(`pointerdown`)으로 즉시 복귀 →
  오브 재생 지속 재확인. 통과.
- 기존 E2E 8개 중 7개 유지 통과, `mixer.spec.ts`의 "category tabs" 1건은 이 워커 범위 밖 —
  `git status`로 확인한바 `src/library/catalog.ts`/`src/mixer/Palette.tsx`가 다른 워커가
  동시 작업 중인 파일이라 카탈로그 항목 수 변경과 그 테스트 기대값이 아직 안 맞은 상태로
  보임(이 워커는 해당 파일들을 전혀 건드리지 않았음).
