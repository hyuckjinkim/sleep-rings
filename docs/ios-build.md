# iOS 빌드 — Capacitor 패키징 (Task #9)

> 환경: WSL2 Ubuntu, **macOS 없음** — Xcode 컴파일·서명·아카이브는 이 환경에서 불가능.
> 이 문서는 (a) Linux에서 실제로 한 것, (b) 못 한 것, (c) macOS에서 이어서 할 절차를 정리한다.
> 관련: `docs/design/audio-engine.md` §6(백그라운드 재생).

## 1. Linux(WSL2)에서 완료한 것

- `npx cap add ios` — `ios/App/`에 Xcode 프로젝트 생성 완료. Capacitor 8의 iOS 템플릿은
  **CocoaPods가 아니라 Swift Package Manager(Package.swift)**를 기본으로 쓰므로, `cap add ios`
  시점에 `pod install`을 시도하지 않았다(따라서 "pod 실패"는 발생하지 않음 — Capacitor 8부터
  달라진 점). `@capacitor/app` 플러그인이 자동으로 `Package.swift`에 포함됨.
- `ios/App/App/Info.plist`에 다음 추가:

  ```xml
  <key>UIBackgroundModes</key>
  <array>
      <string>audio</string>
  </array>
  ```

  `CFBundleDisplayName`은 이미 `SleepRings`로 설정돼 있었음(스캐폴드 단계 산출물).

## 2. Linux에서 할 수 없었던 것 (macOS 필요)

- 실제 컴파일/빌드, 시뮬레이터·실기기 실행
- Swift Package Manager 의존성 resolve 검증 — Xcode를 처음 열 때 네트워크로 패키지를 받아야
  하는데, 이 자체는 Xcode GUI 동작이라 CLI(`xcodebuild`)조차 macOS가 있어야 함
- 코드 서명(프로비저닝 프로파일, Apple Developer 인증서)
- 아카이브(.xcarchive) 생성, `.ipa` export, App Store Connect 업로드
- **AVAudioSession 카테고리 설정의 실기기 검증** — `audio-engine.md` §6이 명시한 대로
  WKWebView는 자체 프로세스에서 자체 세션을 돌리므로, 호스트 앱이 Swift로 세션을 설정해도
  WebView에 직접 영향을 주지 않는다. 이 설계상 **네이티브 Swift 코드로 세션을 만질 필요가
  없다** — `Info.plist`의 `UIBackgroundModes: audio` + 무음 `<audio>` 킵얼라이브(1안,
  `src/mobile/background-audio.ts`)만으로 WKWebView 내부 세션이 `.playback`으로 유도된다는
  전제다. 이 전제 자체가 실기기 미검증 리스크(§6 오픈퀘스천 1)이므로, macOS/실기기 확보 시
  가장 먼저 검증해야 할 항목이다.

## 3. macOS에서 이어서 할 절차

1. **Xcode로 열기**: `ios/App/App.xcodeproj` 오픈(workspace 아님 — SPM 기반이라 `.xcworkspace`가
   없음). 최초 오픈 시 File → Packages → Resolve Package Versions로 SPM 의존성 resolve.
2. **Signing & Capabilities 탭**:
   - Team 선택(Apple Developer Program 계정 필요)
   - Bundle Identifier가 `com.sleeprings.app`인지 확인(자동으로 `PRODUCT_BUNDLE_IDENTIFIER`에서
     읽힘)
   - **"+ Capability" → "Background Modes" 추가 → "Audio, AirPlay, and Picture in Picture"
     체크.** `Info.plist`에 `UIBackgroundModes: audio`를 이미 텍스트로 넣어뒀지만, Xcode
     Capabilities 탭에서 다시 확인/토글해야 entitlements와 프로비저닝 프로파일에 반영되는 경우가
     있다(Xcode가 캡퍼빌리티 변경 시 provisioning profile을 갱신하기 때문).
3. **빌드 확인**: 시뮬레이터로 먼저 `⌘R` 실행 → 오빗 믹서 기본 동작 확인. 그 다음 **실기기**에서
   백그라운드 재생 실기기 테스트(§2의 미검증 리스크) — 화면 잠금 후 오빗 애니메이션이 이어지는지,
   앱 스위처로 백그라운드 전환 후 소리가 끊기지 않는지 확인. 불안정하면
   `audio-engine.md` §6 2안(네이티브 스냅샷 오프로드, `@capgo/capacitor-native-audio`)으로
   전환 검토.
4. **아카이브 & 배포**: Product → Archive → Organizer에서 "Distribute App" →
   - App Store 제출: App Store Connect 업로드
   - 내부 테스트: Ad Hoc 또는 TestFlight
   서명은 Automatic Signing 권장(Xcode가 인증서/프로파일 자동 관리), 수동이 필요하면 Apple
   Developer 사이트에서 Distribution 인증서 + App Store 프로비저닝 프로파일을 미리 생성.
5. **버전**: `Info.plist`의 `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`은 Xcode 프로젝트
   설정(`project.pbxproj`)에 있음 — `MARKETING_VERSION`은 `npm run release`가 올리고(`docs/RELEASE.md`),
   `CURRENT_PROJECT_VERSION`(빌드 번호)은 업로드 전에 직접 올린다.

## 4. 웹 쪽 통합 — 배선 지점

Android와 동일한 `src/mobile/` 모듈을 그대로 쓴다(`src/mobile/background-audio.ts`의
`initBackgroundAudio()` / `startKeepAliveAudio()`) — iOS 전용 코드는 없다.
`src/mobile/foreground-service.ts`는 `Capacitor.getPlatform() === 'android'`로 가드돼 있어
iOS에서는 자동으로 no-op이다. 배선 지점은 `docs/android-build.md` §4와 동일하니 그쪽을 참고.

## 5. 알려진 제약

- iOS 실측이 전혀 안 된 상태 — 위 §2, §3의 모든 macOS 전용 단계가 미실행.
- 자연음 파일(m4a, `audio-engine.md` §4)의 iOS WKWebView 실디코드 검증도 이 작업 범위 밖(P3/
  사운드 파이프라인 팀 영역, 문서상 코덱 호환성은 조사됐으나 실기기 미검증).
