# 비주얼 테마 가이드 — SleepRings

> 토큰 정의: `src/app/theme.css` (CSS 커스텀 프로퍼티, `:root`)
> 벤치마크 근거: `docs/research/sleep-orbit-benchmark.md` §4(비주얼) — 원본 에셋·로고는 참조하지 않고 "다크 필드 위 컬러 사운드 오브" 분위기만 벤치마크했다.
> 데이터 모델 근거: `docs/design/architecture.md` §3 (`Category` 유니온 13종)

## 0. 네이밍 규칙

모든 토큰은 `--so-<그룹>-<이름>` 형식이다. 그룹: `bg` `text` `border` `orb` `state` `accent` `danger` `space` `radius` `font` `shadow` `glow` `duration` `ease`. 새 토큰을 추가할 때도 이 규칙을 따를 것 — 그룹 밖 임의 이름(`--primary-color` 등) 금지.

이 파일은 아직 어떤 컴포넌트도 `theme.css`를 import하지 않은 상태에서 작성됐다(App.tsx는 소유자가 아니라 수정하지 않음). ui-executor가 `main.tsx` 또는 `App.tsx`에서 `import './theme.css'` 한 줄을 추가하면 즉시 전역에 적용된다.

## 1. 배경 · 텍스트 · 보더

수면 앱이므로 저자극: 채도를 낮추고 휘도 대비만으로 위계를 만든다. 기존 `App.tsx`의 `#0a0e1a`/`#f0f0f5`를 그대로 `--so-bg-base`/`--so-text-primary`로 승격했다(값 불변, 깨지지 않음).

| 토큰 | 값 | 용도 |
|---|---|---|
| `--so-bg-void` | `#05070d` | 최심부 — 풀블리드 배경 가장자리 비네트, 오브 위 아이콘 색 |
| `--so-bg-base` | `#0a0e1a` | 앱 기본 배경 |
| `--so-bg-elevated` | `#12182b` | 카드/패널/시트 |
| `--so-bg-overlay` | `#1a2238` | 팝오버·모달 표면 |
| `--so-border-subtle` | `#232b45` | 다크 표면 위 헤어라인 |
| `--so-text-primary` | `#f0f0f5` | 본문/제목 |
| `--so-text-secondary` | `#a8adc4` | 보조 텍스트, 라벨 |
| `--so-text-tertiary` | `#6b7290` | placeholder, 비활성에 가까운 캡션 |
| `--so-text-disabled` | `#454b66` | 비활성 컨트롤 |

## 2. 카테고리 오브 색 (13종)

`architecture.md`의 `Category` 유니온과 1:1 대응. 전부 HSL `S54% L60%`로 통일하고 hue만 바꿔, 오브 간 시각적 무게(밝기)가 균등하도록 했다 — 특정 카테고리만 유독 튀거나 죽어 보이지 않게.

| 카테고리 | 변수 | hex | bg 대비 | 다크 아이콘 대비 |
|---|---|---|---|---|
| water | `--so-orb-water` | `#62b5d0` | 8.29:1 | 8.67:1 |
| ocean | `--so-orb-ocean` | `#6299d0` | 6.41:1 | 6.70:1 |
| rain | `--so-orb-rain` | `#6278d0` | 4.69:1 | 4.91:1 |
| binaural | `--so-orb-binaural` | `#7462d0` | 4.03:1 | 4.22:1 |
| music | `--so-orb-music` | `#9562d0` | 4.53:1 | 4.73:1 |
| lucid | `--so-orb-lucid` | `#b662d0` | 5.18:1 | 5.42:1 |
| whispers | `--so-orb-whispers` | `#d062c9` | 5.75:1 | 6.02:1 |
| asmr | `--so-orb-asmr` | `#d062a2` | 5.46:1 | 5.71:1 |
| animals | `--so-orb-animals` | `#d09962` | 7.72:1 | 8.07:1 |
| camping | `--so-orb-camping` | `#d0be62` | 10.29:1 | 10.76:1 |
| nature | `--so-orb-nature` | `#62d074` | 9.90:1 | 10.35:1 |
| ambient | `--so-orb-ambient` | `#62d0a8` | 10.18:1 | 10.65:1 |
| noise | `--so-orb-noise` | `#d07462` | 5.83:1 | 6.10:1 |

("bg 대비" = 오브 색 vs `--so-bg-base` `#0a0e1a`. "다크 아이콘 대비" = 오브 색 vs `--so-bg-void` `#05070d`을 오브 위 아이콘/글자로 얹었을 때.)

**대비 검증 결과 (§8에 상세):**
- 오브를 UI 컴포넌트(도형)로 볼 때 기준인 WCAG 1.4.11(비텍스트 대비 3:1)은 13종 전부 통과 — 가장 낮은 binaural도 4.03:1.
- 오브 위에 아이콘/숫자를 얹을 때는 **항상 `--so-bg-void`(#05070d)를 아이콘 색으로 쓸 것** — 13종 전부 4.2:1 이상으로 통과. 흰색(`--so-text-primary`) 아이콘은 camping(1.87:1) 등에서 실패하므로 오브 위에는 쓰지 않는다.
- 오브 색을 **본문 텍스트 색으로 직접 쓰지 않는다.** rain/binaural/music처럼 4.5:1에 못 미치는 조합이 있어 작은 글자엔 부적합. 카테고리를 라벨에서 표시할 때는 색은 **작은 원형 스와치(dot)** 로만 쓰고, 글자는 `--so-text-primary`/`--so-text-secondary`를 쓴다.

## 3. 오브 상태 (대기 / 재생 / 고정)

색상 자체는 카테고리당 1개로 고정하고, **상태는 투명도·글로우·테두리로만 표현**한다(색을 상태별로 늘리지 않음 — 조합 폭발 방지).

```css
/* 대기: 흐리게, 글로우 없음 */
.orb--idle {
  opacity: var(--so-state-idle-opacity); /* 0.55 */
}

/* 재생: 완전 불투명 + 은은한 글로우 (color-mix로 카테고리 색과 조합) */
.orb--playing {
  opacity: var(--so-state-playing-opacity); /* 1 */
  box-shadow: 0 0 var(--so-glow-blur-md)
    color-mix(in srgb, var(--so-orb-water) var(--so-state-glow-alpha), transparent);
}

/* 고정(홀드): 재생과 동일 + 링 테두리로만 구분 (색 변경 없음) */
.orb--locked {
  outline: var(--so-state-locked-ring-width) solid var(--so-text-secondary);
  outline-offset: 3px;
}
```

`color-mix()`는 모든 대상 브라우저(Chrome/Safari/Firefox 최신, iOS 15.1+ 범위 밖일 수 있음 — iOS 16.2+부터 지원)에서 쓸 수 있다. 구형 iOS 15.1 WebView 대상이라면 `color-mix()` 대신 카테고리별 rgba 폴백이 필요할 수 있으니, 실제 타깃 WebView 확인 후 ui-executor가 판단할 것(현재는 토큰만 준비, 폴백은 YAGNI로 보류).

## 4. 궤도 링 (가이드라인 원)

사운드가 없는 빈 궤도 반경을 시각적으로 안내하는 얇은 동심원. 색은 카테고리와 무관하게 중립.

```css
.orbit-ring {
  border: 1px solid var(--so-border-subtle);
  border-radius: var(--so-radius-full);
  opacity: 0.5;
}
```

반경(半徑) 단계마다(예: 25%/50%/75%/100%) 링을 하나씩 그릴 때도 같은 클래스를 재사용하고, 중심에 가까운 링일수록 `opacity`를 살짝 낮춰(0.3~0.5) 원근감을 준다.

## 5. 중심 헤드 아이콘

사용자의 머리(청취 기준점)를 나타내는 중심 아이콘. `--so-bg-elevated` 배경 원 + `--so-text-secondary` 아이콘 색. 오브보다 항상 낮은 z-index로 두어 오브가 항상 위에 오게 한다(궤도가 머리를 도는 은유가 깨지지 않도록).

## 6. 팔레트 바 (카테고리 선택 UI)

라이브러리 화면에서 카테고리를 고르는 가로 스크롤 바 등에 쓸 때: 각 칩은 `background: color-mix(in srgb, var(--so-orb-<cat>) 22%, var(--so-bg-elevated))`로 저채도 배경을 만들고, 텍스트는 `--so-text-primary`, 선택된 칩만 `border: 1px solid var(--so-orb-<cat>)`로 강조한다. 칩 배경 자체를 오브 원색 그대로 채우지 않는다(저자극 원칙 — 칩이 오브보다 튀면 안 됨).

## 7. 팝오버 (사운드별 고급 컨트롤)

- 배경: `--so-bg-overlay`, 반경: `--so-radius-lg`, 그림자: `--so-shadow-panel`
- 진입/퇴장 트랜지션: `var(--so-duration-base) var(--so-ease-gentle)` (opacity + translateY 8px 정도)
- 내부 슬라이더 트랙 등 인터랙티브 강조색은 `--so-accent`(중립 문라이트 블루) 사용 — 특정 카테고리 색과 겹치지 않도록 저채도로 잡았다.

## 8. 다크 필드 배경 (별 / 그라데이션)

원본 벤치마크의 "다이내믹 풍경 테마"는 이 앱 범위 밖(에셋 복제 방지 + 과설계 방지)이므로, CSS만으로 구현 가능한 최소한의 앰비언스로 대체한다.

```css
.mixer-field {
  background:
    radial-gradient(1px 1px at 20% 30%, var(--so-text-tertiary) 50%, transparent 51%),
    radial-gradient(1px 1px at 75% 15%, var(--so-text-tertiary) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 60% 70%, var(--so-text-secondary) 50%, transparent 51%),
    radial-gradient(1px 1px at 40% 85%, var(--so-text-tertiary) 50%, transparent 51%),
    radial-gradient(120% 120% at 50% 40%, var(--so-bg-elevated) 0%, var(--so-bg-base) 60%, var(--so-bg-void) 100%);
  background-repeat: no-repeat;
}
```

별 개수는 이 4개 선에서 늘리지 않는다 — 더 필요하면 `box-shadow` multi-value 트릭으로 수십 개를 흩뿌리는 방법도 있지만, 지금은 은은한 배경일 뿐 초점이 아니므로 YAGNI.

## 9. 모션 원칙

**수면 친화 = 느리고 부드럽게.** 두 층으로 나눠 생각한다.

1. **UI 크롬 모션** (팝오버 열림/닫힘, 버튼 피드백, 칩 선택 등) — `--so-duration-*` + `--so-ease-gentle` 사용. `prefers-reduced-motion: reduce`에서는 `theme.css`가 세 durations를 전부 `0ms`로 자동 오버라이드하므로 컴포넌트가 따로 분기할 필요 없다.
2. **궤도 각속도(오브가 실제로 도는 움직임)** — `architecture.md` §1 설계 원칙에 따라 이건 CSS 트랜지션이 아니라 **store의 `Orbit.speed`(rad/s)를 rAF 루프가 명령형으로 구동**한다. 따라서 이 문서는 CSS duration 토큰을 제공하지 않는다. 대신 가이드라인만 남긴다: 기본 랜덤 궤도 속도는 **한 바퀴에 45~90초** 범위를 권장(빠른 회전은 각성 유발, 너무 느리면 "돌고 있다"는 느낌 자체가 사라짐). `prefers-reduced-motion: reduce`일 때는 엔진 쪽에서 `Orbit.speed`를 0에 가깝게 낮추거나 랜덤 방향전환을 끄는 것을 권장 — 이 자동 대응은 mixer/audio 쪽 구현 책임이며, 이 문서는 CSS 토큰 소유자로서 지침만 남긴다(직접 구현하지 않음, 소유 범위 밖).

## 10. ui-executor 참고 — 변수 사용 규칙 요약

- 오브 색은 항상 `--so-orb-<category>` 하나만 참조. 상태(대기/재생/고정)는 §3의 opacity/glow/outline 조합으로 표현하고 새 색 토큰을 만들지 않는다.
- 오브 위 아이콘/숫자는 항상 `--so-bg-void`. 흰색 금지(§2 대비 실패 사례 있음).
- 카테고리 색을 본문 텍스트에 직접 쓰지 않는다 — 스와치(dot)로만.
- 새 그룹의 토큰이 필요하면 `--so-<그룹>-<이름>` 규칙을 지키고, 이 파일에 표를 추가해 갱신한다(토큰과 문서가 따로 놀지 않도록 — `architecture.md`가 catalog.json을 라이선스 대장의 단일 출처로 삼은 것과 같은 원칙).

## 11. 접근성 대비 검증 (전체 원자료)

WCAG 2.1 상대 휘도 공식으로 계산(sRGB → 선형화 → `0.2126R+0.7152G+0.0722B`, 대비비 `(L1+0.05)/(L2+0.05)`).

| 검증 대상 | 대비비 | 기준 | 결과 |
|---|---|---|---|
| `--so-text-primary` vs `--so-bg-base` | 16.95:1 | 4.5:1 (본문) | 통과 |
| `--so-text-secondary` vs `--so-bg-base` | 8.66:1 | 4.5:1 | 통과 |
| `--so-text-tertiary` vs `--so-bg-base` | 4.07:1 | 3:1 (라지/UI 한정 사용) | 통과 — 단, 본문 소문자엔 부적합하므로 캡션/placeholder 용도로만 사용 |
| `--so-bg-elevated` vs `--so-text-primary` | 15.52:1 | 4.5:1 | 통과 |
| 오브 13종 vs `--so-bg-base` | 4.03:1 ~ 10.29:1 | 3:1 (비텍스트) | 전부 통과 |
| 오브 13종 vs `--so-bg-void`(아이콘 색으로 사용 시) | 4.22:1 ~ 10.76:1 | 3:1(대형)/4.5:1(소형) | 전부 통과, 소형 아이콘 기준도 대부분 통과 (binaural 4.22:1이 최저) |
| `--so-accent` (`#93a5c8`) vs `--so-bg-base` | 7.75:1 | 4.5:1 | 통과 |
| `--so-danger` (`#d45e68`) vs `--so-bg-base` | 5.13:1 | 3:1(비텍스트) | 통과 |

계산 스크립트는 재산출용으로 보관하지 않는다 — 값이 고정 토큰으로 `theme.css`에 이미 박혀 있고, 향후 팔레트를 바꾸면 이 표만 재계산해 갱신하면 된다(YAGNI: 상시 검증 스크립트는 지금 필요 없음).

## 12. 빌드 검증

`theme.css`는 아직 어떤 파일에서도 import되지 않는다(App.tsx/mixer 소유권이 designer 밖이라 연결하지 않음). 이 상태에서 `npm run build`가 기존과 동일하게 통과함을 확인했다 — 새 정적 자산(`theme.css`, `icon.svg`)이 빌드 그래프에 들어있지 않으므로 당연한 결과이며, 실제 적용 여부는 ui-executor가 import를 추가한 뒤 재검증이 필요하다.
