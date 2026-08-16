# 플랜/티어 — 구조와 게이팅 로직 (task B2)

> 방침: ①티어별 구분하되 **무료 최대 개방** ②플랜 미충족 사운드는 **숨기지 않고 비활성 노출** ③10,000원 티어는 **구조만 구현, 상품 등록은 콘텐츠 확보 후로 순연**(`docs/roadmap-v030.md` §2).
> 코드: `src/plan/`(신규). 결제 연동은 스텁만 있고 실제 SDK는 미설치 — §3 참조.

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

## 3. 결제 SDK 연결 지점

`src/plan/purchase-adapter.ts`의 `PurchaseAdapter` 인터페이스가 연결점이다:

```ts
export interface PurchaseAdapter {
  getPlan(): Promise<Plan>
  purchase(plan: Exclude<Plan, 'free'>): Promise<Plan>
  restore(): Promise<Plan>
}
```

현재는 `localMockPurchaseAdapter`만 존재 — 네트워크 없이 `src/plan/store.ts`(zustand + localStorage)를 직접 갱신한다. 실제 연동 시:

1. `@revenuecat/purchases-capacitor` 설치(`.omc/research/monetization.md` §5-1 권고 — 서버 없는 영수증 검증, MTR $2,500/월까지 무료).
2. `PurchaseAdapter`를 구현하는 `revenueCatPurchaseAdapter`를 새로 작성해 `purchase()`/`restore()`가 실제 StoreKit/Play Billing 호출이 되도록 하고, `getPlan()`은 RevenueCat의 캐시된 entitlement를 읽도록 한다.
3. `localMockPurchaseAdapter` 사용처를 교체. 인터페이스가 동일하므로 호출부(향후 구매 UI, `src/app` 소관) 변경은 최소화된다.

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

- App Store Connect / Google Play Console: 구독 상품 2개 등록(2,000원/5,000원). **10,000원 상품은 등록하지 않는다** — 콘텐츠(파일 기반 프리미엄 라이브러리) 확보 전까지는 코드의 `tier10000`이 있어도 판매하지 않는다(방침③).
- RevenueCat 프로젝트 생성 → 스토어 API 키 연동 → 앱에 API 키 삽입(§3의 실 어댑터 작성과 함께).
- 위 항목 발생 시 개인정보처리방침/이용약관에 구독 자동 갱신·환불 정책 반영(`.omc/research/monetization.md` §5-2 참조, 광고 계정 관련 항목은 `docs/ads-setup.md`).

## 광고 상태 (0.3.1 기준)

배너는 **배선돼 있지 않다**. 이 앱은 화면이 하나뿐이고 하단이 `.mixer-controls`(볼륨·삭제·타이머)라, 네이티브 배너를 띄우면 조작 컨트롤 위에 겹쳐 `docs/ads-setup.md` §5가 금지한 배치가 된다(AdMob 오클릭 정책 = 계정 리스크). `src/ads` 모듈과 네이티브 설정은 그대로 유지되므로, **재생 화면이 아닌 전용 화면(라이브러리/설정)이 생기는 릴리즈**에서 배선하면 된다. 그때 개인정보처리방침 상단의 "이 빌드는 광고 미표시" 고지도 함께 제거할 것.
