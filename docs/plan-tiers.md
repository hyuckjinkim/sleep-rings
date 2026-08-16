# 플랜/티어 — 구조와 게이팅 로직 (task B2)

> 방침: ①티어별 구분하되 **무료 최대 개방** ②플랜 미충족 사운드는 **숨기지 않고 비활성 노출** ③10,000원 티어는 **구조만 구현, 상품 등록은 콘텐츠 확보 후로 순연**(`docs/roadmap-v030.md` §2).
> 코드: `src/plan/`(신규). 결제 연동은 RevenueCat 실 어댑터가 배선되어 있으나 API 키가 비어 있어 목(mock)으로 자동 폴백 중 — §3 참조.

## 1. 티어별 제공 내역

카탈로그(`src/library/catalog.ts`, 22개 항목 — 파일 기반 3종은 에셋 미보유로 현재 전부 비활성) 기준. 티어 매핑은 `src/library/catalog.ts`가 아니라 `src/plan/tiers.ts`의 `SOUND_TIER`에 있다(§5 참조).

| 티어 | 사운드 | 레이어 한도 | 프리셋 슬롯 | 광고 |
|---|---|---|---|---|
| **무료** | 노이즈 4 + 자연음 원본 4 + 신규 합성 4(캠프파이어·선풍기·천둥·여울) = **12/19종(63%)** | 3 | 3 | 배너 예정(0.3.1 현재 미노출) |
| **2,000원** | 위 전체 + 신규 합성 나머지 4(우산 위 빗소리·로우파이 험·심장박동·자궁 소리) = 16/19종 | 5 | 10 | 제거 |
| **5,000원** | 위 전체 + 바이노럴 3(델타·세타·알파) = **19/19종(현재 재생 가능한 전부)** | 무제한 | 무제한 | 제거 |
| **10,000원** | 위 전체 + 향후 파일 기반 프리미엄 라이브러리(정원의 비·해변·밤의 시냇물 등) 우선 접근 — **현재는 콘텐츠 없음, "준비 중" 취급** | 무제한 | 무제한 | 제거 |

무료 12/19 = 63%는 로드맵 §2가 정한 목표 비율과 일치한다. B1이 추가한 신규 합성 8종 중 무료/2,000원 분배 기준: 캠프파이어·선풍기·천둥·여울은 기존 8종(노이즈·비·바람·파도·시냇물)과 성격이 같은 범용 앰비언스라 무료에 포함시켰고, 우산 위 빗소리·로우파이 험·심장박동·자궁 소리는 더 니치하거나 ASMR 성격이 강해 2,000원 차별화 요소로 남겼다.

## 2. 잠금 표시 — 2종 구분

`src/mixer/Palette.tsx`는 사운드가 안 보이는 이유가 두 가지임을 시각적으로 구분한다:

| 잠금 사유 | 조건 | 표시 | 탭 동작 |
|---|---|---|---|
| **에셋 없음** ("준비 중") | `catalog.ts`의 `isAvailable()`이 false (파일 사운드 미다운로드) | 네이티브 `disabled`, opacity 0.55 (기존 idle 처리) | 없음(비활성) |
| **플랜 미충족** ("업그레이드 필요") | `isAvailable()`은 true인데 `canUseSound(soundId, plan)`이 false | 네이티브 `disabled` **아님** — 진짜로 탭 가능해야 하므로 `aria-disabled`도 쓰지 않는다(ARIA 스펙·Playwright의 `toBeEnabled()` 모두 `aria-disabled="true"`를 "활성화해도 무반응"으로 해석해 실제 동작과 모순됨). 대신 `is-plan-locked` 클래스(opacity 0.82) + 자물쇠 배지 + `aria-label`에 "업그레이드 필요" 문구를 얹어 접근성 이름으로 구분한다 | 업그레이드 안내 시트(`.mixer-upgrade-sheet`) 오픈 |

두 사유 모두 카테고리 탭에서 사운드 자체를 숨기지 않는다(방침②). 에셋-미보유 필터(L-4)는 플랜 잠금과 별개로 그대로 유지된다.

## 3. 결제 SDK 연결 지점 (구현 완료, 키만 비어 있음)

`@revenuecat/purchases-capacitor@13.4.0` 설치 완료(`npm view` 실측: peerDependency `@capacitor/core >=8.0.0`, 현재 프로젝트 8.4.2와 호환), `npx cap sync android` 반영 완료. `.omc/research/monetization.md` §5-1의 "`@capacitor-community/in-app-purchases`는 실존하지 않는 패키지" 경고대로 RevenueCat 공식 패키지명(`@revenuecat/purchases-capacitor`, community 패키지 아님)을 사용했다.

`src/plan/purchase-adapter.ts`의 `PurchaseAdapter` 인터페이스(기존 유지, `getOfferings()`만 추가):

```ts
export interface PurchaseAdapter {
  getPlan(): Promise<Plan>
  getOfferings(): Promise<PurchaseOffering[]> // { plan, priceString }[] — 상품 목록/가격
  purchase(plan: Exclude<Plan, 'free'>): Promise<Plan>
  restore(): Promise<Plan>
}
```

두 구현체가 존재한다:

- **`localMockPurchaseAdapter`**: 네트워크 없이 `src/plan/store.ts`(zustand + localStorage)를 직접 갱신. `getOfferings()`는 `purchase-config.ts`의 `FALLBACK_PRICE`(문서상 정가)를 그대로 반환.
- **`RevenueCatPurchaseAdapter`**: 실 StoreKit/Play Billing 호출. `purchase()`/`restore()`는 `Purchases.purchasePackage()`/`Purchases.restorePurchases()`를 호출하고 결과 `CustomerInfo`의 활성 entitlement를 `Plan`으로 환산해 플랜 스토어에 반영한다. `getOfferings()`가 RevenueCat 응답에서 매핑 가능한 패키지를 하나도 못 찾으면(오퍼링 미설정·네트워크 실패) 목 어댑터의 `FALLBACK_PRICE`로 조용히 폴백한다.

**어댑터 자동 선택** — `getPurchaseAdapter()`(및 `isPurchaseAvailable()`)가 매 호출 시 판단한다:

```
네이티브 플랫폼 && API 키 설정됨  →  RevenueCatPurchaseAdapter
그 외(웹 빌드 / 키 미설정)        →  localMockPurchaseAdapter
```

지금 빌드는 `purchase-config.ts`의 키가 빈 문자열이라 **항상 목으로 폴백** — AdMob이 테스트 ID로 배포된 것과 동일한 패턴으로, 기존 동작(단위/E2E 테스트 포함)이 전혀 바뀌지 않는다.

### 3-1. 키 주입 지점 (한 곳)

`src/plan/purchase-config.ts`의 `PURCHASE_CONFIG.revenueCatApiKey.{android,ios}` — RevenueCat 대시보드에서 발급하는 **공개(client-safe) SDK 키**(Stripe publishable key와 같은 성격, 비밀값 아님)를 여기에만 채우면 된다. 다른 코드 변경 불필요.

### 3-2. 패키지/entitlement ↔ Plan 매핑

`src/plan/purchase-config.ts`의 `TIER_PLAN` 맵 하나가 **오퍼링 패키지 식별자**와 **entitlement 식별자** 양쪽에 동시에 쓰인다 — RevenueCat 대시보드에서 두 식별자를 아래와 동일하게 맞춰 등록하면 코드 변경 없이 그대로 연결된다:

| RevenueCat 식별자(패키지 ID = entitlement ID) | Plan | 정가(FALLBACK_PRICE) |
|---|---|---|
| `tier2000` | `tier2000` | ₩2,000 |
| `tier5000` | `tier5000` | ₩5,000 |
| `tier10000` | `tier10000` | ₩10,000 |

### 3-3. UI 배선 — 업그레이드 시트에 실 구매 버튼

`src/mixer/Palette.tsx`의 `UpgradeSheet`가 `isPurchaseAvailable()`로 두 상태를 분기한다:

- **구매 가능**(네이티브+키 설정 후): `.mixer-upgrade-buy`(가격은 `getOfferings()` 실시간 값, 실패 시 §3-2의 정가 폴백) + `.mixer-upgrade-restore`("구매 복원", iOS 심사 요구사항) 버튼 노출. 구매/복원 중 로딩 상태, 취소(`isPurchaseCancelled()` — RevenueCat `PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR`)는 조용히 닫기, 그 외 실패는 `.mixer-upgrade-error` 문구.
- **구매 불가**(현재 빌드 — 키 미설정 또는 웹): `.mixer-upgrade-comingSoon` 문구만 노출("결제 연동 준비 중"), 구매/복원 버튼 자체가 렌더되지 않아 오해를 주지 않는다.

성공 시 어댑터가 내부적으로 `usePlanStore.setPlan()`을 호출하므로 시트는 그냥 닫기만 하면 되고, 잠긴 사운드는 플랜 스토어 구독을 통해 자동으로 잠금 해제된다.

## 4. QA/개발용 플랜 전환

설정 화면 토글은 만들지 않았다(`src/app`은 이 작업 범위 밖). 대신 `src/plan/store.ts`가 `localStorage['so.plan']`을 그대로 읽으므로, 브라우저 콘솔에서:

```js
localStorage.setItem('so.plan', 'tier5000') // 'free' | 'tier2000' | 'tier5000' | 'tier10000'
```

후 새로고침하면 즉시 반영된다. 프로덕션 UI에 아무 컨트롤도 없으므로 "숨긴 토글"이 아니라 애초에 노출되지 않는다.

## 5. 설계 결정 — 티어 매핑을 catalog.ts에 안 넣은 이유

리드 지시(`src/library/catalog.ts`(티어 필드 추가만))와 달리, 사운드→티어 매핑은 `catalog.ts`에 필드를 추가하는 대신 `src/plan/tiers.ts`의 `SOUND_TIER` 맵으로 분리했다. `Sound` 타입은 `src/data/types.ts`(이 작업 소유권 밖, 병렬 작업 중인 다른 파일)에 있어 거기 손대지 않고는 `catalog.ts`에 새 필드를 추가할 수 없었고, 카탈로그 자체를 수익화 로직과 무관하게 유지하는 편이 결합도가 낮다고 판단했다. 매핑 미비 시 기본값은 `'free'`(방침②에 따라 미지정 사운드가 실수로 잠기지 않도록).

## 6. 레이어/프리셋 한도 초과 시 UX

거부 대신 대체한다(`src/mixer/store.ts`):

- **레이어**(`addPlacement`): 한도 도달 시 잠금 안 된 오브 중 가장 오래된 것을 자동 교체하고 `layerLimitNotice`로 안내(`outcome: 'replaced'`). 모든 오브가 잠겨 있어 교체할 게 없으면 새 사운드는 배치되지 않고 `outcome: 'blocked'`로 안내만 표시된다. 안내는 `Palette.tsx`의 `.mixer-layer-notice` 토스트로 노출되고 4~5초 후 자동으로 사라진다(기존 undo 토스트와 동일한 타임아웃 상수 재사용).
- **프리셋**(`savePreset`): 한도 도달 시 가장 오래된 프리셋을 FIFO로 교체. 프리셋은 "고정" 개념이 없어 레이어처럼 교체 불가 상황(전부 잠김)이 발생하지 않는다.
  - **알려진 갭**: 프리셋 저장은 항상 성공하므로(거부하지 않는 설계) 사용자에게 "오래된 프리셋이 교체됐다"는 별도 안내는 아직 없다 — 프리셋 UI(`src/sleep/SleepControls.tsx`)는 이 작업의 소유권 밖이라 손대지 않았다. 안내 문구가 필요하면 `useMixStore`의 `presets` 배열 길이 변화를 관찰하거나, 이 문서의 §7 문구를 참고해 해당 컴포넌트 소유자가 추가하면 된다.

## 7. 오너가 할 수동 단계

코드(RevenueCat 어댑터, UI, 매핑)는 이미 완성돼 있다 — 아래 단계만 하면 실제 결제가 켜진다.

1. **App Store Connect / Google Play Console**: 구독 상품 2개 등록(2,000원/5,000원). **10,000원 상품은 등록하지 않는다** — 콘텐츠(파일 기반 프리미엄 라이브러리) 확보 전까지는 코드의 `tier10000`이 있어도 판매하지 않는다(방침③).
2. **RevenueCat 프로젝트 생성** → App Store Connect/Play Console API 연동(영수증 검증 자동화).
3. **오퍼링·패키지 등록**: RevenueCat 대시보드에서 패키지 식별자를 §3-2 표와 **정확히** `tier2000` / `tier5000`으로 맞춰 만들고, 각각을 1번 단계의 스토어 구독 상품에 연결한다. 식별자가 다르면 `getOfferings()`/`purchase()`가 매핑을 못 찾아 조용히 폴백/실패한다.
4. **entitlement 등록**: 마찬가지로 §3-2 표와 동일한 식별자(`tier2000`/`tier5000`)로 entitlement를 만들고 해당 패키지에 연결.
5. **API 키 주입**: RevenueCat이 발급하는 공개 SDK 키를 `src/plan/purchase-config.ts`의 `PURCHASE_CONFIG.revenueCatApiKey.android`/`.ios`에 채운다. 이 한 줄만으로 앱이 목 어댑터에서 실 어댑터로 전환된다(§3 참조) — 코드 재배포 필요.
6. **10,000원 상품**: sound-pipeline(#8) 콘텐츠 확보 후, 1~4번 절차를 동일하게 `tier10000`으로 반복.
7. 위 항목 발생 시 개인정보처리방침/이용약관에 구독 자동 갱신·환불 정책 반영(`.omc/research/monetization.md` §5-2 참조, 광고 계정 관련 항목은 `docs/ads-setup.md`).

## 광고 상태 (0.3.1 기준)

배너는 **배선돼 있지 않다**. 이 앱은 화면이 하나뿐이고 하단이 `.mixer-controls`(볼륨·삭제·타이머)라, 네이티브 배너를 띄우면 조작 컨트롤 위에 겹쳐 `docs/ads-setup.md` §5가 금지한 배치가 된다(AdMob 오클릭 정책 = 계정 리스크). `src/ads` 모듈과 네이티브 설정은 그대로 유지되므로, **재생 화면이 아닌 전용 화면(라이브러리/설정)이 생기는 릴리즈**에서 배선하면 된다. 그때 개인정보처리방침 상단의 "이 빌드는 광고 미표시" 고지도 함께 제거할 것.
