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

**알림 아이콘**: `android/app/src/main/res/drawable/ic_stat_sleeprings.xml` — 임시 벡터 아이콘
(달 모양 실루엣). `smallIcon`이 플러그인 API에서 필수 파라미터라 최소한으로 채워넣었다. **P6(스토어
자료) 단계에서 디자이너의 최종 브랜드 아이콘으로 교체 필요** — `ponytail:` 주석으로 표시해둠.

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

### 배선 지점 (아직 적용 안 함 — 팀 리드/오디오팀 판단으로 연결 필요)

1. **`src/audio/sound-engine.ts`의 `SoundEngine` 인스턴스**(예: `src/mixer/engine/instance.ts`의
   `soundEngine`)를 앱 시작 시 한 번 `initBackgroundAudio(soundEngine)`에 넘겨야 한다 — 타입은
   구조적으로 이미 호환된다(`onEnterBackground`/`onEnterForeground` 시그니처 일치).
   권장 위치: `src/main.tsx`의 `createRoot(...).render()` 이전, 또는 `src/app/App.tsx`의
   최상위 `useEffect`.
2. **`startKeepAliveAudio()`는 첫 사용자 제스처 핸들러 안에서** `soundEngine.init()`과
   **같은 호출 지점**에 넣어야 한다 — `sound-engine.ts:188-191`의 `onEnterBackground()` 주석이
   정확히 이 배선을 가리키고 있다("silent keep-alive `<audio>` ... is app-shell/native-plugin
   territory ... nothing for the engine itself to do until that lands"). 믹서 UI에서
   `soundEngine.init()`을 호출하는 지점(현재 `startPlayback`이 첫 배치 시 `soundEngine.load()`를
   여는 흐름 — `src/mixer/store.ts:42`)이 유력한 후보이나, 정확한 훅 위치는 UI/오디오팀이 실제
   "첫 제스처" 판정 로직을 갖고 있는 곳에서 결정해야 한다.

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
distribution 다운로드 포함):

- **AAB**: `android/app/build/outputs/bundle/release/app-release.aab` — 3,116,346 bytes (~3.0MB)
- **APK**: `android/app/build/outputs/apk/release/app-release.apk` — 3,268,165 bytes (~3.1MB)

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

`npm test`(68건) 회귀 없음 확인. `npm run typecheck` 통과.

## 7. 알려진 제약 / 후속 작업

1. **§4의 배선이 미적용 상태** — `src/mobile/`은 완성돼 있으나 실제 앱에 연결되지 않았다.
   연결 전까지는 백그라운드 재생 기능이 실제로 동작하지 않는다.
2. **알림 아이콘이 placeholder** — P6에서 실제 브랜드 아이콘으로 교체 필요.
3. **무음 킵얼라이브의 신뢰성은 실기기 미검증** — `audio-engine.md` §8-1의 최대 리스크가 여전히
   열려있음. Android는 포그라운드 서비스로 프로세스 자체는 보장되지만, WebView 내 Web Audio
   컨텍스트가 Doze/앱 대기 모드에서 실제로 계속 렌더링하는지는 실기기 테스트 필요.
4. **`versionCode`/`versionName`은 `1`/`"1.0"` 그대로** — `RELEASE_MANIFEST.json`과의 동기화는
   범위 밖(팀 리드 관리 영역).
