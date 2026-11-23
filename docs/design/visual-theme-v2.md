# 비주얼 테마 v2 — 아이콘 세트 · 배경 · 디자인 시스템

> 상태: 현행 — [visual-theme.md](./visual-theme.md) 위에 얹는 문서(v1 을 대체하지 않는다).

**대상**: SleepRings v0.3.0 / **작성**: design-lead / **선행 문서**: [visual-theme.md](./visual-theme.md)

v1은 **색과 토큰**을 정의했다. v2는 그 위에 **형태(아이콘)·깊이(배경)·위계(레이아웃)** 를 얹는다.
v1의 토큰 값은 하나도 바꾸지 않았고, `theme.css`에는 v2 블록이 **추가만** 됐다.

> **v1 §8 무효화 선언** — v1 §8은 "CSS만으로 만드는 최소 앰비언스"를 이유로 별을 4개로 못박고
> "점을 더 늘리지 말 것"이라고 적었다. v2는 이 조항을 **대체한다**. 근거: §8의 제약은 *필드 원
> 안쪽*을 전제로 쓰였는데, 실제 화면에서 문제가 되는 건 필드 **바깥**의 완전 평면 배경이다
> (§3.1-G5). v2는 별을 필드에서 떼어내 전역 배경 레이어로 옮기고, 전역 레이어는 mask 타일
> 1장으로 처리해 §8이 걱정하던 "레이어 증가 = 비용 증가"를 애초에 성립하지 않게 만든다.
> `mixer.css:19`의 주석(`do not add more points`)은 통합 시 이 문서를 가리키도록 고칠 것.

---

## 1. 사운드 아이콘 세트

### 1.1 스타일 규칙 (전 24종 예외 없음)

| 항목 | 값 | 이유 |
|---|---|---|
| viewBox | `0 0 24 24`, `width`/`height` 속성 **없음** | 크기는 CSS만 결정 — 오브/칩/스토어에서 같은 파일 재사용 |
| 채색 | `fill="none"` + `stroke="currentColor"` | 색은 부모 `color` 상속. 오브 위에서 자동으로 `--so-bg-void`가 된다 |
| 선 굵기 | `1.5` (24 viewBox 기준) | 표시 크기에 **비례 스케일**된다(20/24/48/96px 렌더 검증 완료). `vector-effect: non-scaling-stroke`를 쓰지 말 것 — 작은 칩에서 선만 상대적으로 굵어져 통일감이 깨진다 |
| 끝단 | `stroke-linecap="round"`, `stroke-linejoin="round"` | 뾰족한 끝은 각성감을 준다 — 수면 앱에서 모서리는 전부 둥글게 |
| 라이브 영역 | x, y ∈ `[2, 22]` | 상하좌우 2px 광학 여백. 원형 오브 안에서 아이콘이 테두리에 닿지 않는다 |
| 요소 수 | 최대 4 stroke | 24px에서 5개 이상은 반드시 뭉갠다 |
| 채움 | 지름 2px 이하 점만 `fill="currentColor"` | 이 크기에서 스트로크 원은 링이 아니라 얼룩이 된다 |

**"고급스러움"의 정의(이 세트의 판단 기준)**: 디테일을 더해서가 아니라 **빼도 알아볼 수 있는 최소
형태**에 도달했을 때 나온다. 24종 전부 같은 굵기·같은 여백·같은 추상화 단계에 있어서, 나란히
놓았을 때 *한 사람이 그린 것*으로 보이는 상태가 목표다. 개별 아이콘이 예뻐 보이려고 규칙을
깨는 순간 세트 전체가 싸구려가 된다.

### 1.2 아이콘 24종 (`assets/sound-icons/`)

**현재 카탈로그 대응 (11)**
`noise-white` `noise-pink` `noise-brown` `noise-green` · `rain` `wind` `waves` `stream` ·
`binaural-delta` `binaural-theta` `binaural-alpha` · `sound`(범용 폴백)

**향후 확장 대비 (12)**
`campfire` `thunder` `fan` `train` `heartbeat` `birds` `singing-bowl` `music` `whispers` `asmr`
`lucid` `ambient`

카테고리 13종 전부 대표 아이콘이 있어, 신규 사운드가 들어와도 **빈 자리가 생기지 않는다**
(폴백 체인은 §1.5).

### 1.3 핵심 검증 — 같은 색 오브 안에서 구별되는가

`noise-*` 4종은 전부 `--so-orb-noise`, `binaural-*` 3종은 전부 `--so-orb-binaural`이다.
텍스트를 걷어내는 순간 **형태만이 유일한 구별 수단**이 되므로, 이 두 패밀리는 임의로 그리지 않고
의미가 그대로 실루엣이 되도록 설계했다.

- **노이즈 4종 = 스펙트럼 막대 5개** (x=4·8·12·16·20, 4px 피치). 높이 프로파일이 곧 주파수 특성이다.
  - `white` **평평** (전대역 균일) / `pink` **완만한 내리막** (1/f)
  - `brown` **급절벽** (1/f²) / `green` **가운데 봉우리** (중역 대역제한)
  - → 평면·경사·절벽·산봉우리 네 실루엣이라 24px에서도 서로 붙지 않는다.
- **바이노럴 3종 = 사인파 1주기 / 2주기 / 3주기**. 주기 수가 곧 비트 주파수(2·6·10Hz)다.
  진폭은 5.5 → 4.0 → 2.75로 함께 줄여, 조밀해져도 파형이 뭉치지 않게 했다.
  양끝 점 2개는 L/R 채널 = "바이노럴"을 뜻한다.

**렌더 검증 결과** (sharp로 96/48/24px 래스터 후 육안 확인)
- 96px·48px: 24종 전부 명확. 오브 실사이즈(48px)가 판정 기준선이며 전부 통과.
- 24px: 22종 통과. `binaural-theta` / `binaural-alpha`는 24px에서 둘 다 "잔물결"로 수렴해
  구별이 약해진다 → **팔레트 칩(20px)에서는 바이노럴 3종만 라벨을 반드시 병기**할 것(§1.4).
  오브(48px)에서는 구별되므로 오브 라벨은 불필요하다.

### 1.4 접근성 — 아이콘만으로는 읽히지 않는다

1. **아이콘은 항상 장식이다.** `<SoundIcon>`은 `aria-hidden="true"`로 고정 렌더된다.
   접근 가능한 이름은 **감싸는 버튼/오브의 `aria-label`이 계속 책임진다** — 현재 `Orb.tsx`·
   `Palette.tsx`의 `aria-label`을 **절대 제거하지 말 것**. 아이콘 교체는 시각 표현만 바꾸는
   작업이며 접근성 트리는 변화가 없어야 한다.
2. **라벨 표시 정책 (3단)**
   - **오브**: 아이콘만. 이름은 탭 시 열리는 팝오버 헤더가 이미 보여준다(현 03 스크린샷).
   - **팔레트 칩**: 아이콘 + 이름 **병기**. 칩은 "처음 보는 사운드를 고르는" 자리이므로 여기서
     이름을 빼면 학습 경로가 끊긴다. 아이콘만 있는 칩은 만들지 않는다.
   - **오브 캡션 옵션**: 설정에 `showOrbLabels`(기본 off)를 두고, on이면 오브 **아래**
     `--so-font-size-xs` 캡션을 붙인다. 오브 *안*에 되돌리지 말 것 — 2줄 접힘 문제(§3.1-G2)가
     그대로 재발한다.
3. **대비**: 아이콘 색은 v1 §2 규칙 그대로 `--so-bg-void`. 13색 전부 4.2:1 이상이라
   WCAG 1.4.11(비텍스트 3:1)을 여유 있게 통과한다. 흰색 아이콘은 금지(camping 1.87:1).

### 1.5 통합 방법 — 이미 붙일 수 있는 상태다

`src/icons/SoundIcon.tsx`(신규, 이번 라운드에 작성 완료)가 SVG를 그대로 인라인한다.
**새 의존성 없음, 코드젠 단계 없음** — Vite의 `import.meta.glob(..., { query: '?raw' })`로
`assets/sound-icons/*.svg`를 빌드타임에 읽으므로 SVG 파일이 그대로 유일한 진실 소스다.

```tsx
import { SoundIcon } from '../icons/SoundIcon'

// 오브 안 (Orb.tsx) — aria-label은 그대로 두고 텍스트 자식만 교체
<SoundIcon soundId={placement.soundId} category={soundCategory(placement.soundId)} />

// 팔레트 칩 안 (Palette.tsx) — 아이콘 + 이름
<SoundIcon soundId={sound.id} category={sound.category} className="so-icon--sm" />
<span>{sound.name[locale]}</span>
```

해결 순서: **`<soundId>.svg` → 카테고리 대표 아이콘 → `sound.svg`**.
신규 사운드에 전용 아이콘을 주고 싶으면 `assets/sound-icons/<soundId>.svg` 파일만 추가하면
1순위로 잡힌다 — 코드 수정 불필요.

> `dangerouslySetInnerHTML`을 쓰지만 입력은 빌드타임에 번들된 로컬 정적 SVG뿐이고 사용자
> 입력이 들어올 경로가 없다. 이 목적으로 sanitizer 의존성을 추가하지 말 것.

---

## 2. 배경 · 환경

### 2.1 후보 비교와 확정안

| 후보 | 깊이감 | 모바일 비용 | 채택 |
|---|---|---|---|
| 다층 radial-gradient 오로라 (정적) | 상 | **0** (합성 시 1회 래스터) | ✅ |
| SVG feTurbulence 그레인 (정적, mask 타일) | 중 (밴딩 제거) | 160px 타일 1장 | ✅ |
| 전역 별 레이어 (정적, mask 타일) | 중상 | 360px 타일 1장 | ✅ |
| 궤도 링 발광 (inset box-shadow) | 중 | blur 없음 | ✅ |
| 중심 헤드 광원화 | 상 | drop-shadow 1개 (이미 있음, 강화만) | ✅ |
| 재생 중 배경 호흡 | 중 | transform/opacity 1개 = 컴포지터 전용 | ✅ (재생 중 + 모션 허용 시만) |
| 별 개별 반짝임(twinkle) | 하 | 별 수만큼 애니메이션 | ❌ 각성 유발 + 비용 대비 효과 최저 |
| 큰 backdrop-filter blur | 중 | **매 프레임 GPU 블러** | ❌ 모바일 프레임 드랍 주범 |
| 캔버스 파티클 / 노이즈 셰이더 | 상 | rAF 상시 점유 + 배터리 | ❌ 저자극 원칙·배터리 위반 |

**확정: 정적 오로라 + 정적 그레인 + 정적 별 + 재생 중 초저속 호흡 1개.**
움직이는 것은 **화면 전체에서 단 하나**(배경 호흡)이고, 그마저 30초 주기·밝기 진폭 8%이며
`prefers-reduced-motion`에서 완전히 꺼진다.

### 2.2 배경 레이어 — `src/app/backdrop.css` (작성 완료, 붙이기만 하면 됨)

DOM은 **`<div class="so-backdrop" />` 한 장**뿐이고 별·그레인은 `::before`/`::after`다.
색은 전부 토큰(`--so-aurora-*`, `--so-star-opacity`, `--so-grain-opacity`)이며 하드코딩 색이 없다.
data URI가 색을 토큰화할 수 없는 문제는 **이미지를 `mask`로 쓰고 색은 `background-color`로 주는**
방식으로 우회했다 — 별빛도 `--so-text-secondary` 한 곳에서 관리된다.

> **⚠️ 이걸 빠뜨리면 배경이 안 보인다**: `App.tsx`의 `<main>` 인라인 style에
> `background: 'var(--so-bg-base)'`가 **불투명하게** 깔려 있어 `z-index:-1` 레이어를 통째로
> 가린다. 통합 시 이 한 줄을 **반드시 제거**할 것. 배경색은 `.so-backdrop`이 담당한다.

```tsx
// src/app/App.tsx
import './backdrop.css'
// ...
const isPlaying = /* store에서: placements.length > 0 && !muted */
return (
  <>
    <div className={isPlaying ? 'so-backdrop is-playing' : 'so-backdrop'} aria-hidden="true" />
    <main style={{ /* background 줄 삭제, 나머지 유지 */ }}>…</main>
  </>
)
```

### 2.3 필드·링·헤드 (통합자가 `src/mixer/mixer.css`에 반영)

```css
/* .mixer-field — 별 4개는 전역 배경으로 이관됐으므로 여기선 삭제.
   필드는 이제 "배경보다 살짝 밝은 원판"이라는 역할만 남는다. */
.mixer-field {
  border-color: color-mix(in srgb, var(--so-border-subtle) 60%, transparent);
  background: radial-gradient(
    100% 100% at 50% 42%,
    color-mix(in srgb, var(--so-bg-elevated) 55%, transparent) 0%,
    transparent 72%
  );
}

/* .orbit-ring — 중심에 가까울수록 밝게. 헤드가 광원이라는 설정을 링이 받아준다. */
.orbit-ring {
  border-color: color-mix(in srgb, var(--so-accent) 14%, transparent);
  box-shadow: inset 0 0 var(--so-glow-blur-sm) color-mix(in srgb, var(--so-accent) 5%, transparent);
}

/* .mixer-field-head — 검은 원판이 아니라 빛나는 광원으로. 현재는 --so-bg-elevated 배경이라
   어두운 구멍처럼 읽힌다(§3.1-G5). */
.mixer-field-head {
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--so-text-primary) 24%, var(--so-bg-elevated)) 0%,
    var(--so-bg-elevated) 70%
  );
  box-shadow: var(--so-glow-head);
  filter: none; /* 기존 drop-shadow는 box-shadow로 대체 — 필터보다 싸다 */
}
```

### 2.4 성능 예산 (지켜야 할 상한)

- 애니메이션 프로퍼티는 `transform`·`opacity` **둘만**. `width`/`top`/`box-shadow` 애니메이션 금지.
- `filter`/`backdrop-filter` blur는 **어디에도 추가하지 않는다**.
- 배경 레이어는 정적 → 최초 페인트 후 **리페인트 0**. 호흡은 컴포지터 스레드에서 처리된다.
- `will-change`는 `.is-playing`일 때만 켠다(상시 지정 시 메모리 상주).

---

## 3. 디자인 시스템 v2

### 3.1 현 화면의 격차 Top 5 (iOS 스크린샷 4장 실측 기준)

**G1 — 헤더가 첫 화면의 25%를 먹는다 (최우선)**
`h1`에 스타일이 없어 브라우저 기본 `2em bold`로 렌더되고("SleepRings"가 화면 폭의 절반),
그 아래 부제 한 줄, 그 아래 언어 토글 한 줄이 세로로 쌓여 상단 ~490px(1290px 기준)이 크롬에
소비된다. 주인공인 궤도 필드가 아래로 밀려 화면 중앙을 못 잡는다.
→ `h1`은 `--so-font-size-md`(1.25rem) + `letter-spacing: .02em`, 부제(`app.subtitle`)는 **삭제**
(앱 이름 아래 기능 설명은 스토어 리스팅의 일이지 앱 화면의 일이 아니다), 언어 토글은 **우상단
아이콘 버튼**으로 절대 배치. 헤더 총 높이 490px → **56px**.

**G2 — 오브 안 텍스트가 2줄로 접혀 여백이 0이다**
48px 원 안에 "화이트/노이즈"가 꽉 차서 원이 라벨 홀더로 보인다. 궤도·반경 은유가 죽는다.
→ §1 아이콘 세트가 정확히 이 문제를 푼다. 아이콘 24px + 상하 12px 여백 = 원이 다시 원이 된다.

**G3 — 팔레트 칩 색이 탁하다**
`color-mix(orb-color 22%, --so-bg-elevated)`가 노이즈 오렌지 × 남색 = **채도 죽은 갈보라**로
떨어진다. 카테고리 식별도 안 되고("전부 같은 진흙색") 고급스럽지도 않다.
→ 칩 표면은 **무채**(`--so-bg-elevated`)로 통일하고, **카테고리 색은 아이콘에만** 태운다.
색면을 줄이고 색점을 남기는 게 절제이고, 그게 §1.1의 "고급스러움" 정의와 같은 원리다.

**G4 — 하단 컨트롤 5줄이 그룹 없이 평평하다**
마스터볼륨 / 타이머 6버튼 / 믹스이름+저장 / 프리셋행이 **전부 같은 시각 무게**로 나열돼 있고
구분선도 카드도 없다. 게다가 프리셋행이 화면 최하단에서 잘린다(safe-area 미반영).
→ 3그룹으로 재편: **① 사운드 고르기**(팔레트) **② 지금 듣는 것**(마스터볼륨 + 타이머)
**③ 저장된 믹스**(프리셋). ②·③은 `--so-bg-elevated` 카드로 감싸고 그룹 간격은 `--so-space-5`,
그룹 내부는 `--so-space-3`(4:1 리듬). 최하단에 `padding-bottom: env(safe-area-inset-bottom)`.

**G5 — 배경이 그냥 검정이라 깊이가 0이다**
별 4개 + 필드 원 *안쪽* 그라데이션이 전부고, 필드 **바깥**은 완전 평면 `#0a0e1a`다.
결과적으로 "웹페이지 위에 원 하나"로 읽힌다. 중심 헤드도 `--so-bg-elevated` 배경이라 빛나는
광원이 아니라 **어두운 구멍**처럼 보인다.
→ §2 전역 배경 레이어 + 헤드 광원화.

### 3.2 타이포 위계 (현재는 위계가 아예 없다)

| 역할 | 토큰 | 굵기 | 색 |
|---|---|---|---|
| 앱 타이틀 | `--so-font-size-md` | 600 | `--so-text-primary` |
| 팝오버 제목 / 그룹 헤더 | `--so-font-size-base` | 600 | `--so-text-primary` |
| 본문 · 값 | `--so-font-size-sm` | 400 | `--so-text-secondary` |
| 라벨 · 캡션 · 버튼 | `--so-font-size-xs` | 500 | `--so-text-tertiary` |

`--so-font-size-lg`/`xl`은 **이 앱에서 쓰지 않는다**. 야간 앱에서 큰 글자는 정보가 아니라 자극이다.
숫자(볼륨 %, 남은 시간)에는 `font-variant-numeric: tabular-nums`를 붙여 값이 바뀔 때 폭이
흔들리지 않게 한다.

### 3.3 여백 리듬

한 화면에 **간격 값 3개만** 쓴다: 그룹 사이 `--so-space-5`, 그룹 안 행 사이 `--so-space-3`,
행 안 요소 사이 `--so-space-2`. 지금처럼 모든 곳이 `--so-space-2~4`로 균질하면 눈이 묶음을
못 찾는다 — **여백 차이가 곧 그룹핑**이다.

### 3.4 카테고리 탭 UI (impl-palette 후속 통합용)

2단 구조. 상단이 카테고리 탭, 하단이 해당 카테고리의 사운드 칩.

```
[ ◎ 노이즈  ⟡ 빗소리  ≋ 바다  ∿ 바이노럴  … ]   ← 탭 (가로 스크롤, 44px)
[ ▮▮▮ 화이트 노이즈 ] [ ▮▟ 핑크 노이즈 ] …        ← 칩 (가로 스크롤, 44px)
```

- **탭에 알약 배경을 주지 말 것.** 선택 표시는 **하단 2px 인디케이터**(카테고리 색) + 글자색을
  `--so-text-tertiary` → `--so-text-primary`로 올리는 것으로 끝낸다. 알약 배경 두 줄이 겹치면
  현재 스크린샷의 "버튼 밭"이 그대로 재현된다.
- 탭·칩 모두 `min-height: 44px`, 가로 스크롤 + 우측 마스크 페이드(`mixer.css`의 B19 패턴 재사용).
- 탭 전환은 크로스페이드 없이 즉시. `--so-duration-fast` 이내.
- 사운드가 1종뿐인 카테고리는 탭을 숨긴다(빈 탭 금지).

### 3.5 오브 상태 스펙 (v1 §3 유지 + 아이콘 반영)

| 상태 | 표현 | 비고 |
|---|---|---|
| 재생 | 카테고리 색 100% + 글로우 24px | 아이콘 `--so-bg-void` |
| 로딩/대기 | opacity 55%, 글로우 없음 | 아이콘 그대로 |
| 오류 | 대기 + `--so-danger` 아웃라인 | |
| 고정 | `--so-text-secondary` 실선 링 | 색을 바꾸지 않는다 |
| 고정 예약 | `--so-text-tertiary` 점선 링 | |
| 선택 | `--so-accent` 3px 링 + 글로우 | |
| 삭제 대상 | 배경 `--so-danger` | 아이콘은 유지 — 무엇을 지우는지 끝까지 보인다 |

**색(hue)으로 상태를 표현하지 않는다.** 상태는 전부 알파·링·글로우로만 표현한다 — 카테고리 색이
곧 정체성이므로 상태가 정체성을 덮어쓰면 안 된다(삭제 대상만 유일한 예외).

### 3.6 마이크로 인터랙션 원칙

- 지속시간은 `--so-duration-base`(300ms) 이하, 이징은 항상 `--so-ease-gentle`.
- 상태 전이의 **밝기 변화 ±10% / 크기 변화 ±6%** 상한. 넘으면 야간에 각성 자극이 된다.
- 드래그 중 오브는 **애니메이션 없이 손가락을 즉시 따라간다**(지연은 고장으로 읽힌다).
  감속 이징은 손을 뗀 뒤에만.
- 바운스·오버슈트 이징 금지. 되돌아오는 움직임은 낮의 언어다.
- 새 오브 등장은 `scale(.94) → 1` + `opacity 0 → 1`, `--so-duration-base`.

### 3.7 빈 상태

현재("사운드를 탭해 놓아보세요")는 문구는 맞는데 **위치가 헤드 바로 아래(62%)라 헤드와 겹쳐
읽힌다**. 필드 하단 78%로 내리고, 글자는 `--so-text-tertiary`/`--so-font-size-xs` 유지.
문구 아래에 **첫 사운드로 유도하는 힌트는 넣지 않는다** — 팔레트가 바로 아래 보이므로 중복이다.

---

## 4. 통합 체크리스트 (웨이브 2)

| # | 파일 | 할 일 | 근거 |
|---|---|---|---|
| 1 | `src/app/App.tsx` | `<main>` 인라인 style에서 `background` **제거** | §2.2 — 안 하면 배경이 전혀 안 보인다 |
| 2 | `src/app/App.tsx` | `import './backdrop.css'` + `<div className="so-backdrop" aria-hidden="true" />` 추가, 재생 중 `is-playing` 토글 | §2.2 |
| 3 | `src/app/App.tsx` | `h1`에 `--so-font-size-md` 적용, `app.subtitle` `<p>` 삭제, 언어 토글 우상단 절대배치 | §3.1-G1 |
| 4 | `src/mixer/Orb.tsx` | 텍스트 자식 → `<SoundIcon>`. **`aria-label`은 그대로 유지** | §1.4, §1.5 |
| 5 | `src/mixer/Palette.tsx` | 칩에 `<SoundIcon className="so-icon--sm">` + 이름 병기 | §1.4 |
| 6 | `src/mixer/mixer.css` | `.mixer-palette-item` 배경을 `color-mix` → `--so-bg-elevated` 무채로 | §3.1-G3 |
| 7 | `src/mixer/mixer.css` | `.mixer-orb`의 텍스트 관련 속성(`font-size`·`word-break`·`line-height`) 제거 | §3.1-G2 |
| 8 | `src/mixer/mixer.css` | `.mixer-field` 별 4개 삭제 + §2.3 스니펫 3종 반영, 19행 주석을 이 문서로 교체 | §2.3, v1 §8 무효화 |
| 9 | `src/mixer/mixer.css` | 하단 컨트롤 3그룹 재편 + `env(safe-area-inset-bottom)` | §3.1-G4 |
| 10 | `src/mixer/Palette.tsx` | 카테고리 탭 2단 구조 (인디케이터 방식, 알약 배경 금지) | §3.4 |
| 11 | `docs/store/screenshots/` | 통합 후 전량 재생성 | 현 캡처는 v1 화면 |

**하지 말 것**: 새 색 팔레트 추가(오로라도 기존 카테고리 색 재사용), `svgr`/sanitizer 등 신규
의존성, blur 필터, 별 반짝임 애니메이션, 오브 *안*으로 라벨 되돌리기.
