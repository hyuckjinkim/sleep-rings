# 배너 광고 설정 — AdMob (task B4)

> 방침: **배너만**. 전면·보상형 영상 광고는 절대 추가하지 않는다(`docs/roadmap-v030.md` §3).
> 코드: `src/ads/`. 오너가 실행할 수동 단계는 §4에 모아뒀다.

## 1. 플러그인 채택 — `@capacitor-community/admob` (roadmap 1안에서 변경)

`docs/roadmap-v030.md`와 `.omc/research/monetization.md`는 **Cap-go/capacitor-admob**을 1안으로 권고했다. 실측(npm pack + GitHub 소스 확인) 결과 이를 뒤집을 근거가 나와 **`@capacitor-community/admob@8.1.0`으로 변경**했다:

| 항목 | Cap-go/capacitor-admob | @capacitor-community/admob | 판단 |
|---|---|---|---|
| Capacitor 8 호환 | `peerDependencies: "@capacitor/core": ">=8.0.0"` | `dependencies: "@capacitor/core": "^8.0.0"` (peerDeps 없음, 명시적 호환) | 둘 다 호환 |
| **Google UMP(GDPR 동의 폼)** | **미지원** — `consent`/`ump` grep 결과 없음, README·API 어디에도 동의 폼 메서드 없음 | **지원** — `requestConsentInfo`/`showConsentForm`/`showPrivacyOptionsForm`/`resetConsentInfo` + Android `user-messaging-platform:4.0.0` 내장 | community 채택 결정타 |
| Android 광고 SDK | **Next-Gen SDK 베타**(`ads-mobile-sdk:0.25.0-beta01`) — 심사 리스크 1순위 태스크에 베타 의존성은 부적절 | **안정판** `play-services-ads:25.4.+` | community |
| iOS 광고 SDK | Google Mobile Ads SDK 13.1.x | Google Mobile Ads SDK **13.6.0**(고정) + `GoogleUserMessagingPlatform ~> 3.1` | community |
| API 형태 | 범용 `adCreate/adLoad/adShow/adHide(id)` — 배너 전용 `BannerAdOptions{adUnitId,position}` | 배너 전용 `showBanner/hideBanner/resumeBanner/removeBanner(BannerAdOptions{adId,adSize,position,npa,isTesting})` | 배너만 쓰는 이 태스크엔 community가 더 직접적 |

**리서치 문서 정정**: `.omc/research/monetization.md` §1-1의 "두 플러그인 모두 … GDPR UMP 연동을 지원"은 Cap-go 쪽에 한해 **사실이 아니었다**(실측 전 추정). 리드가 이 리서치를 근거로 다른 문서를 쓰고 있다면 정정 필요.

node 엔진 요구사항(`engines.node >= 22.0.0`)도 현재 개발 환경(node v22.22.3)과 호환 확인.

## 2. `src/ads/` 모듈

- `ad-config.ts` — **실 ID 교체 지점 1곳**. `AD_CONFIG.bannerAdUnitId.{android,ios}`에 Google 공식 테스트 광고 단위 ID가 하드코딩되어 있다. AdMob *App* ID(`ca-app-pub-...~...`, 광고 단위 ID와 다른 값)는 여기 없다 — 네이티브 설정(§3)에 있다.
- `plan-gate.ts` — `shouldShowBanner(planIsFree: boolean): boolean` 순수 함수. B2(플랜 시스템)가 아직 없어 지금은 항상 `planIsFree` 그대로 반환. B2가 실제 플랜 상태를 여기 연결한다.
- `ads.ts` — `initAds()` / `showBanner(position)` / `hideBanner()` / `isAdsEnabled()`. `src/mobile/foreground-service.ts`와 동일한 패턴: `Capacitor.isNativePlatform()` 가드로 웹 빌드에서 완전 no-op, 모든 실패는 `console.warn`으로만 삼킨다(`console.error` 금지 — `e2e/mixer.spec.ts`가 콘솔 에러 0건을 단언함).
- `index.ts` — 배럴 export.

`initAds()` 내부 순서(README 공식 예제 그대로): `AdMob.initialize()` → (iOS만) ATT 상태 확인 후 `notDetermined`면 `requestTrackingAuthorization()` → `requestConsentInfo()` → 동의 폼이 필요하면(`isConsentFormAvailable && status === REQUIRED`) `showConsentForm()` → `canRequestAds`가 false면 이후 `showBanner()`에 `npa: true`(비개인화 광고) 적용.

## 3. 네이티브 설정 (완료된 것)

**Android** (`android/app/src/main/AndroidManifest.xml`, `strings.xml`):
```xml
<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="@string/admob_app_id" />
```
`admob_app_id` 문자열 리소스에 Google 공식 테스트 App ID(`ca-app-pub-3940256099942544~3347511713`)를 넣어뒀다 — 릴리즈 시 실제 App ID로 이 한 줄만 교체.

`android/app/build.gradle`은 **변경 없음** — Capacitor 오토링킹(`npx cap sync`가 생성하는 `capacitor.build.gradle`)이 플러그인의 `play-services-ads`/`user-messaging-platform` 의존성을 자동으로 끌어온다. `AD_ID` 권한(`com.google.android.gms.permission.AD_ID`)도 **수동으로 추가하지 않았다** — Google Mobile Ads SDK AAR이 매니페스트 병합으로 자동 주입한다(권한 최소성 감사 원칙상 앱이 선언할 필요 없음). 릴리즈 빌드(`npm run build:android`, 리드 실행분)의 병합 매니페스트(`android/app/build/intermediates/merged_manifest/release/.../AndroidManifest.xml`)에서 자동으로 나타나는지 확인 권장.

**iOS** (`ios/App/App/Info.plist`):
```xml
<key>GADIsAdManagerApp</key><true/>
<key>GADApplicationIdentifier</key><string>ca-app-pub-3940256099942544~1458002511</string>
<key>SKAdNetworkItems</key><array><dict><key>SKAdNetworkIdentifier</key><string>cstr6suwn9.skadnetwork</string></dict></array>
<key>NSUserTrackingUsageDescription</key><string>...</string>
```
Google 공식 테스트 App ID. 릴리즈 시 실제 값으로 교체.

**iOS Privacy Manifest** (`ios/App/App/PrivacyInfo.xcprivacy`, 신규): 앱 레벨 선언(NSPrivacyTracking=true, DeviceID 수집, 제3자 광고 목적). Google-Mobile-Ads-SDK Pod 자체는 자체 `PrivacyInfo.xcprivacy`를 번들로 갖고 있어(Required Reason API 등) 별도 작업 불필요 — 이 파일은 **앱 자신의** 선언이다.

⚠️ **수동 단계 (Xcode 필요, WSL에서 불가)**: `PrivacyInfo.xcprivacy`를 디스크에 만드는 것만으로는 부족하다 — Xcode에서 App 타겟의 "Copy Bundle Resources" 빌드 페이즈에 추가해야 번들에 포함된다. `docs/ios-build.md`의 기존 Xcode 작업 절차에 이 항목 추가 필요.

## 4. 오너 수동 단계

1. **AdMob 계정 생성** → 앱 등록(iOS/Android 각각) → 배너 광고 단위 발급.
2. 발급받은 값으로 4곳 교체: `src/ads/ad-config.ts`(광고 단위 ID 2개), `android/app/src/main/res/values/strings.xml`의 `admob_app_id`, `ios/App/App/Info.plist`의 `GADApplicationIdentifier`. 교체 후 `AD_CONFIG.useTestAds`를 `false`로.
3. **Google UMP 동의 메시지 구성**: [AdMob 콘솔에서 GDPR 메시지 생성](https://support.google.com/admob/answer/10113207) — 안 하면 `requestConsentInfo()`가 항상 `isConsentFormAvailable: false`를 반환해 EEA/UK 사용자에게 동의 폼이 뜨지 않고, 2024-01-16 정책에 따라 Limited Ads로 강등될 수 있다.
4. **실기기 테스트 시**: `AdMob.requestConsentInfo({ debugGeography, testDeviceIdentifiers })`로 강제 리전 테스트 가능(코드에는 배선 안 함 — 개발 중 필요하면 `src/ads/ads.ts`에 임시로 추가 후 원복).
5. **Play Console Data Safety / App Store Privacy Nutrition Label**: 광고 식별자·기기정보 수집 항목 갱신(§2 표의 근거를 그대로 사용 가능).
6. **개인정보처리방침**: `docs/store/privacy-policy-{ko,en}.md`에 이미 반영 완료 — 이메일·시행일 플레이스홀더만 실제 값으로 교체.

## 5. 배치 정책 (위반 시 계정 전체 광고 중단 리스크)

- **금지**: 믹서 조작 화면(오브 배치·볼륨 슬라이더 등 조작 UI), 버튼 근접 배치, "광고를 클릭하세요" 류 유도 문구, 클릭 보상.
- **허용**: 라이브러리·설정·프리셋 화면의 **하단 고정** 배너만 (`showBanner('bottom')`).
- 야간 사용 특성상 배너 컨테이너는 다크 톤 유지 — AdMob이 앱 테마에 맞는 크리에이티브를 보장하지 않으므로, 배너를 감싸는 컨테이너에 어두운 배경을 깔아 눈부심을 줄이는 건 **UI 배선 담당(§6) 몫**.

## 6. UI 배선 지점 (이 태스크 범위 밖 — 리드가 배정)

`src/ads`는 화면에 아무것도 그리지 않는다(파일 소유권상 `src/app`, `src/mixer` 등을 건드릴 수 없어 의도적으로 분리). 실제로 화면에 배너를 얹으려면:

1. **앱 시작 시 1회**: 첫 제스처 핸들러(background-audio.ts가 `startKeepAliveAudio()`를 부르는 지점, `src/mixer/Mixer.tsx`)나 그 인근에서 `initAds()` 호출.
2. **라이브러리/설정/프리셋 화면 mount**: `if (shouldShowBanner(planIsFree)) showBanner('bottom')`.
3. **해당 화면 unmount 또는 믹서 화면 진입 시**: `hideBanner()`.
4. `isAdsEnabled()`는 광고 영역 자리 확보(레이아웃 시프트 방지) 여부를 UI가 판단하는 데 쓸 수 있음.
5. `planIsFree`는 B2(플랜 게이트)가 실제 값을 제공하기 전까지 `true`로 하드코딩해도 무방(현재 전 사용자가 무료 플랜).

## 7. 검증 결과

- `npm run typecheck` — 통과.
- `npm run build` — (§8 참고: 이 문서 작성 시점에 실행 결과를 §8에 기록)
- `npx cap sync android` — (§8 참고)
- `npx vitest run src/ads` (no-op 가드 + shouldShowBanner 순수 함수 단위 테스트) — (§8 참고, 공유 샌드박스 리소스 경합으로 워커 스폰 타임아웃 발생 시 대안 검증 경로 기록)
- `npm run test:e2e` — (§8 참고)
- **Android 릴리즈 빌드(`npm run build:android`)는 실행하지 않음** — 리드가 릴리즈 시 일괄 수행.
