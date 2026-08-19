# 아키텍처 설계 — Sleep Orbit 클론

> 정문 스펙: `.omc/specs/deep-interview-sleep-orbit.md`
> 벤치마크 명세: `docs/research/sleep-orbit-benchmark.md`
> 오디오 엔진 상세: `docs/design/audio-engine.md`
> 이 문서는 **설계안**이다 (구현 아님). TypeScript는 인터페이스 스케치.

## 0. 설계 원칙 (과설계 금지)

- 앱은 화면 3개짜리 소규모다: **믹서(오빗 캔버스) · 라이브러리 · 설정/프리셋**. 규모에 맞는 최소 구조를 쓴다.
- 단일 구현밖에 없을 인터페이스·팩토리·추상화는 만들지 않는다. 예외는 **오디오 엔진 공개 API 하나** — UI팀과 오디오팀이 병렬로 일하려면 계약이 필요하기 때문이다.
- 비즈니스 로직(배치 수학, 게인·팬 매핑, 프리셋 직렬화, 마이그레이션)은 **React·AudioContext 없이 단위 테스트되게** 프레임워크 독립으로 둔다.

## 1. 모듈 구조 (feature 기반)

```
src/
  app/          # 셸: 라우팅, 최상위 레이아웃, 프로바이더 조립. 다른 feature를 조합만 한다
  audio/        # SoundEngine — Web Audio 순수 엔진. React import 금지, 헤드리스 실행 가능
  mixer/        # 오빗 캔버스 UI, 제스처, Placement <-> 엔진 바인딩 (React)
  library/      # 사운드 카탈로그 브라우즈, 카테고리, 검색 (React + 카탈로그 데이터)
  sleep/        # 슬립 타이머 + 페이드, 믹스 자동저장/프리셋 (persistence)
  i18n/         # ko/en UI 문자열 + t() 훅
  store/        # zustand 스토어 (선언적 앱 상태)
  data/
    catalog.json    # 사운드 카탈로그 (음원 신원 + 라이선스의 단일 출처)
    types.ts        # 공유 도메인 타입
```

### 의존 방향 (안쪽이 바깥을 모른다)

```
        app  (조립만)
      /  |   |   \
 mixer library sleep   ── 모두 store + audio 공개 API에 의존
      \  |   |  /
        store             ── 선언적 상태 (zustand)
          |
        audio  (SoundEngine)   ── 아무것도 위를 모른다. 순수 Web Audio
          |
        data (catalog, types)   ── 순수 데이터/타입
```

- **`audio/`는 최하위**: React·store·DOM을 import하지 않는다. 입력은 `Placement`/`Sound` 데이터 + 명령(play/stop/setPlacement)뿐. 덕분에 mock AudioContext로 단위 테스트 가능하고, UI와 완전 병렬 개발된다.
- `mixer/sleep/library`는 **엔진 공개 인터페이스**와 **store**에만 의존한다. 엔진 내부(노드 그래프)를 직접 만지지 않는다.
- **고빈도 궤도 애니메이션(프레임당 angle 갱신)은 React state로 흐르지 않는다.** 캔버스 렌더 루프(rAF)와 엔진이 명령형(ref/직접 호출)으로 처리한다. store에는 **선언적 설정**(radius, angle 목표, orbit mode, locked, volume)만 담는다 — 60fps를 React 리렌더로 돌리는 함정을 원천 차단.

## 2. 상태 관리 — **Zustand** 1개 추천

**선택: Zustand.** 이유:

- **보일러플레이트 없음**: Provider·액션 타입·리듀서 없이 `create()` 하나. 소규모 앱에 Redux는 과설계(YAGNI).
- **선택적 구독**: 컴포넌트가 필요한 슬라이스만 구독 → Context의 "한 값 바뀌면 전 서브트리 리렌더" 문제 회피. 오빗 컨트롤이 많아도 리렌더 격리됨.
- **React 밖에서 접근 가능**: vanilla 스토어라 rAF 루프·엔진 어댑터가 `store.getState()`로 직접 읽을 수 있다. Jotai의 atom 쪼개기까지는 이 규모에 불필요.

과설계 방지선: 스토어는 **2~3개**로 충분하다 — `useMixStore`(현재 믹스·placements·프리셋), `useSettingsStore`(locale·팬 품질·테마·타이머 기본값). 더 쪼개지 않는다.

```ts
// store/mix.ts (스케치)
interface MixState {
  current: Mix;
  presets: Mix[];
  addPlacement(soundId: string, radius: number, angle: number): void;
  updatePlacement(id: string, patch: Partial<Placement>): void;
  removePlacement(id: string): void;
  savePreset(name: string): void;
  loadPreset(id: string): void;
}
```

## 3. 데이터 모델

좌표 규약: **radius 0..1**(0=중심=최대볼륨, 1=가장자리=최소), **angle 라디안**(0=정면, 시계방향). 정규화해 화면 크기와 무관하게 저장.

```ts
type Locale = 'ko' | 'en';

type Category =
  | 'water' | 'rain' | 'ocean' | 'nature' | 'animals'
  | 'whispers' | 'asmr' | 'music' | 'binaural' | 'lucid'
  | 'noise' | 'ambient' | 'camping';

// 음원 출처: 합성(코드) 또는 파일(CC0 번들)
type SoundSource =
  | { kind: 'synth'; generator: 'white' | 'pink' | 'brown' | 'green' }
  | { kind: 'file'; src: string; loopStart?: number; loopEnd?: number };

interface LicenseRef {          // 라이선스 대장의 단위 (docs/sound-licenses.md 생성 원본)
  spdx: string;                 // 예: 'CC0-1.0'
  sourceName: string;           // 예: 'Freesound'
  author?: string;
  url?: string;
}

interface Sound {               // 카탈로그 항목 (재생 인스턴스 아님)
  id: string;
  name: Record<Locale, string>; // i18n 사운드명은 데이터로 카탈로그가 보유
  category: Category;
  source: SoundSource;
  license: LicenseRef;          // synth 음원은 spdx: 'no-license-required' 등으로 표기
}

type OrbitMode = 'random' | 'fixed' | 'steered'; // 랜덤 방향전환 / 고정 / 스와이프 조종
type OrbitShape =
  | { kind: 'circle' }
  | { kind: 'ellipse'; eccentricity: number; tilt: number }; // 핀치로 원<->타원

interface Orbit {
  mode: OrbitMode;
  shape: OrbitShape;
  speed: number;      // 각속도 (rad/s), 0이면 정지
  direction: 1 | -1;
}

interface Placement {           // 궤도에 놓인 사운드 1개 (재생 인스턴스)
  id: string;
  soundId: string;
  radius: number;               // 0..1 -> 볼륨/거리감쇠
  angle: number;                // 라디안 -> 바이노럴 팬
  orbit: Orbit;
  locked: boolean;              // 홀드 = 위치 고정
  volume: number;               // 0..1 사용자 미세 볼륨 (탭 컨트롤). radius 감쇠 위에 곱
  muted?: boolean;
}

interface Mix {
  id: string;
  name: string;
  placements: Placement[];      // 무제한 레이어
  masterVolume: number;         // 0..1
  updatedAt: number;            // epoch ms
}
```

### 카탈로그 JSON 스키마 (`src/library/catalog.ts`)

`Sound[]` 배열 하나가 **음원 신원 + 라이선스의 단일 출처**다. 이 파일에서 `docs/sound-licenses.md`(P3 대장)를 생성한다 — 대장을 손으로 이중 관리하지 않는다.

```json
[
  {
    "id": "pink-noise",
    "name": { "ko": "핑크 노이즈", "en": "Pink Noise" },
    "category": "noise",
    "source": { "kind": "synth", "generator": "pink" },
    "license": { "spdx": "no-license-required", "sourceName": "합성" }
  },
  {
    "id": "garden-rain",
    "name": { "ko": "정원의 비", "en": "Garden Rain" },
    "category": "rain",
    "source": { "kind": "file", "src": "sounds/garden-rain.m4a", "loopStart": 0.12, "loopEnd": 30.4 },
    "license": { "spdx": "CC0-1.0", "sourceName": "Freesound", "author": "...", "url": "https://..." }
  }
]
```

## 4. 영속화 (localStorage)

로컬 저장만(스펙: 클라우드 동기화 non-goal). 키 네임스페이스 `so.`:

| 키 | 내용 | 쓰기 시점 |
|----|------|-----------|
| `so.currentMix` | 현재 믹스 (Mix) | placement 변경 시 **디바운스**(~500ms) 자동저장 |
| `so.presets` | 저장된 명명 믹스 `Mix[]` | 프리셋 저장/삭제 시 |
| `so.settings` | locale, 팬 품질(hrtf/stereo), 테마, 최근 타이머 시간 | 설정 변경 시 |
| `so.schemaVersion` | 정수 (마이그레이션 버전) | 앱 부팅 시 최신값으로 갱신 |

### 마이그레이션 여지

- 저장 스키마에 **버전 정수** 하나만 둔다. 부팅 시 `stored.version < CURRENT`면 순수 `migrate(old): new` 함수를 순차 적용. 지금은 v1이라 마이그레이션 로직 자체는 **아직 안 만든다**(YAGNI) — 버전 필드만 심어 미래 여지를 남긴다.
- **fail-safe 필수**: 파싱 실패/스키마 불일치 시 예외를 삼키지 말고 **기본값으로 리셋**(수면 앱이 저장값 하나로 벽돌 되면 안 됨). `try/catch` + Zod류 경량 검증으로 경계에서 방어.

```ts
// sleep/persistence.ts (스케치)
const CURRENT_SCHEMA = 1;
function loadMix(): Mix {
  try {
    const raw = JSON.parse(localStorage.getItem('so.currentMix') ?? 'null');
    if (!raw) return emptyMix();
    return migrate(raw);          // 버전 < CURRENT면 변환, 아니면 그대로
  } catch {
    return emptyMix();            // 손상 시 안전 복구
  }
}
```

## 5. i18n 구조

- **UI 문자열**: ko/en 두 언어 + 평면 키셋. 이 규모엔 react-i18next 도입이 과함 — **타입 안전 사전 + `t(key)` 훅**(~30줄)으로 충분. `i18n/ko.json`, `i18n/en.json`, `useTranslation()`.
- **사운드명**: UI 문자열이 아니라 **데이터** — `Sound.name`(카탈로그)이 보유. i18n 시스템과 분리.
- 확장 여지(복수형·보간·언어 추가)가 실제로 생기면 react-i18next로 교체 (인터페이스가 `t(key)`라 교체 비용 작음). 지금 도입하지 않는다.

## 6. 테스트 전략

스펙 게이트: 단위 + 통합 + E2E(Playwright), 커버리지 ≥80%.

| 계층 | 대상 | 도구 | 검증 내용 |
|------|------|------|-----------|
| **엔진 단위** | `audio/` 순수 로직 | Vitest + mock AudioContext | radius→게인 곡선, angle→팬 매핑, placement→그래프 배선, 페이드 스케줄 계산, 프리셋 직렬화·마이그레이션 |
| **UI 컴포넌트** | mixer/library | Vitest + Testing Library | 제스처가 올바른 placement 변이 디스패치(홀드→locked, 핀치→shape, 하단드래그→remove, 탭→컨트롤), 컨트롤↔store 바인딩 |
| **플로우 E2E** | 핵심 시나리오 | Playwright | 배치→radius 변경→게인 값 변화→다중 조합 재생→프리셋 저장/재로드→슬립 타이머 페이드 |

- Playwright는 소리를 "들을" 수 없으므로, 엔진에 **테스트 전용 introspection**(각 placement의 현재 gain/pan 값 노출)을 두어 오디오 상태를 단언한다. 프로덕션 경로엔 영향 없는 읽기 전용 훅.
- `audio/`가 프레임워크 독립이므로 엔진 테스트는 브라우저·React 없이 헤드리스로 대부분 커버 가능 → 80% 게이트 달성의 주력.

## 7. 리스크 (아키텍처 관점)

1. **백그라운드 재생과 상태의 관계** — 오디오 엔진이 백그라운드에서 살아있는지가 최대 리스크. 상세·완화는 `audio/design/audio-engine.md` §백그라운드. 상태 계층은 "포그라운드 복귀 시 엔진 재동기화"를 지원해야 함(store가 진실 원천, 엔진은 store로부터 재구성 가능하게).
2. **드vfs I/O(WSL `/mnt/d`)** — node_modules 고빈도 I/O 느림. 개발 편의 문제일 뿐 아키텍처엔 영향 없음. 빌드 산출물 검증에서만 주의.
3. **카탈로그-대장 이중화 방지** — 라이선스 정보가 catalog.json과 sound-licenses.md에 갈라지면 드리프트. 대장은 **반드시 catalog에서 생성**(단일 출처 원칙).

> **갱신 이력**: 초기 설계는 카탈로그를 `data/catalog.json`으로 두려 했으나, 사운드가 전부 코드 합성이라 별도 데이터 파일이 필요 없어졌다. 실제 진실 소스는 `src/library/catalog.ts`다(.omc/qa4/code-health.md 문서 화석 #2).
