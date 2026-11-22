# 오디오 엔진 설계 — SleepRings

> 정문 스펙: `.omc/specs/deep-interview-sleep-orbit.md`
> 벤치마크: `docs/research/sleep-orbit-benchmark.md` (§2 궤도 믹싱, §6 빌드 스펙)
> 아키텍처: `docs/design/architecture.md`
> 이 문서는 **설계안**이다 (구현 아님). TypeScript는 인터페이스 스케치.

핵심 UX 매핑(스펙 확정): **중심=머리, radius(중심거리)=볼륨, angle=공간감(바이노럴), 사운드별 궤도 애니메이션**.

---

## 1. 사운드당 오디오 그래프

placement 1개 = 노드 체인 1개. 모든 체인이 master로 합류한다.

```
[source]  ──▶  [PannerNode (HRTF)]  ──▶  [GainNode]  ──▶  [master GainNode]  ──▶  [night GainNode]  ──▶  [DynamicsCompressor]  ──▶  destination
 loop buffer      각도→L/R/앞/뒤              사용자 볼륨 트림          전역 볼륨              슬립 페이드 전용        리미터
 또는 노이즈       radius→거리감쇠(distanceModel)   + 뮤트
```

- **source**: 파일이면 `AudioBufferSourceNode`(loop), 노이즈면 사전 렌더 노이즈 버퍼의 `AudioBufferSourceNode`(loop). (합성 방식은 §4.)
- **PannerNode(HRTF)**가 **radius와 angle을 둘 다** 처리한다 — placement의 (radius, angle)을 리스너 기준 3D 위치로 매핑하면, 팬(방향)과 거리감쇠(볼륨)를 **한 노드가 물리 기반으로** 동시에 낸다. (근거 §2, §3.)
- **GainNode**: 사용자가 탭 컨트롤로 만지는 미세 볼륨 + 뮤트. (거리감쇠 위에 곱해지는 트림.)
- **master GainNode**: 전역(사용자) 볼륨.
- **night GainNode**: 슬립 타이머 페이드 전용. 오디오 클럭 자동화로 예약되며, 볼륨 조작(`.value` 쓰기·`cancelScheduledValues`)이 master에만 닿으므로 예약된 페이드가 지워지지 않는다.
- **DynamicsCompressor**: 여러 레이어 합산 시 클리핑을 막는 리미터(threshold -3 dB, ratio 20).

폴백(StereoPanner) 경로에선 PannerNode가 없으므로 radius→게인을 **직접 계산**해 GainNode에 싣는다 (§2 폴백).

## 2. radius → 게인, angle → 패닝

### radius → 게인: **PannerNode 거리 모델(inverse) 권장**

- 사람의 음량 지각은 로그 스케일이다. **선형 매핑은 중심 근처에서 너무 급하고 가장자리에서 뭉갠다.** 지수/역거리 곡선이 자연스럽다.
- 이미 PannerNode를 쓰므로, **radius를 리스너로부터의 거리로 매핑**하고 `distanceModel: 'inverse'`, `refDistance`/`maxDistance`를 오빗 필드에 맞추면 **radius→감쇠가 물리적으로** 나온다. 별도 게인 곡선 코드 불필요 — 한 메커니즘으로 팬과 볼륨을 동시에.
- **1안(권장)**: `distanceModel: 'inverse'`, radius(0..1)를 거리(refDistance..maxDistance)로 선형 사상. 그 뒤 GainNode는 사용자 트림·페이드 전용.
- **폴백(StereoPanner 경로)**: 지수 곡선을 직접 계산 — `gain = pow(1 - radius, 2)` 정도(중심=1, 가장자리→0). dB 매핑을 쓰면 `gain = 10 ** (dB/20)`로 -0dB..-40dB 사상.

### angle → 패닝: **1안 PannerNode(HRTF)**, **2안 StereoPanner 폴백**

- **1안 (권장): `PannerNode` + `panningModel: 'HRTF'`.** 벤치마크의 정의적 셀링포인트가 "8D/바이노럴, 헤드폰 최적, 좌/우/앞/뒤"(연구 §2). HRTF만 **앞/뒤·상하 정위**를 준다. angle을 리스너 주위 수평면 위 방향으로 매핑, radius를 거리로.
- **2안 (폴백): `StereoPannerNode`.** L/R 좌우 팬만 가능(앞/뒤 없음), CPU 훨씬 쌈. 저사양 기기·동시 소스 과다로 HRTF 예산 초과 시 전환.
- **런타임 품질 스위치**: 설정에 `panQuality: 'hrtf' | 'stereo'`. HRTF 파너는 동시 다수일 때 모바일 WebView에서 무겁다 — 동시 소스 수/기기 성능에 따라 자동 강등 여지. (리스크 §7.)

### 궤도 애니메이션 시 파라미터 갱신: **rAF 스로틀 + AudioParam 램프 (혼합)**

궤도가 돌면 매 프레임 (radius, angle)이 바뀐다. 두 극단 다 나쁘다: 프레임마다 `.value =` 하드 세팅은 **지퍼 노이즈**(계단 잡음), 순수 AudioParam 자동화만으론 랜덤 방향전환·스와이프 조종 같은 **동적 경로**를 미리 스케줄 못 함.

- **권장(혼합)**: rAF 렌더 루프가 궤도 위치를 계산하되, 오디오 파라미터는 **~20–30Hz로 스로틀**해 갱신하고 각 갱신을 **짧은 램프**(`linearRampToValueAtTime`, ~50ms)로 건다. 오디오 스레드가 램프 사이를 보간 → 매끈함. 프레임률(60fps) 전부를 오디오 파라미터에 흘리지 않아 CPU도 절약.
- `PannerNode.positionX/Y/Z`는 a-rate AudioParam이라 램프 가능. `setPosition()`(하드)보다 램프를 우선.
- `locked`(홀드)면 갱신 자체를 멈춘다 — 정지한 소스는 오디오 파라미터 트래픽 0.

```ts
// audio/orbit-driver.ts (스케치) — 스로틀된 파라미터 램프
const RAMP = 0.05;               // 50ms 램프
function applyOrbit(node: PlacementNodes, radius: number, angle: number, t: number) {
  const [x, , z] = polarToListener(radius, angle);   // 수평면 매핑
  node.panner.positionX.linearRampToValueAtTime(x, t + RAMP);
  node.panner.positionZ.linearRampToValueAtTime(z, t + RAMP);
}
```

## 3. 노이즈 합성 (White/Pink/Brown/Green): **사전 렌더 AudioBuffer 루프 권장**

- **AudioWorklet vs 사전 렌더**: 노이즈는 통계적으로 정상(stationary) 신호다 — 충분히 긴 루프(~10초)면 반복이 지각되지 않는다. 매 샘플 JS/Worklet CPU를 태울 이유가 없다.
- **권장: 사전 렌더 AudioBuffer 루프.** 앱 로드 시 각 색상 노이즈 ~10초를 JS로 **한 번** 생성해 AudioBuffer에 담고, 이후 placement마다 그 버퍼를 `loop`로 재생. 일회성 생성 비용, 런타임 비용 ≈ 0. 모바일 WebView에 유리.
- AudioWorklet은 **진짜 무한 비반복 노이즈**가 필요할 때만 정당 — 수면 앱엔 과함(YAGNI).
- 색상별 생성:
  - **White**: `Math.random()*2-1`.
  - **Pink**: Paul Kellet 필터(또는 Voss-McCartney) — 화이트에 -3dB/oct.
  - **Brown**: 화이트를 leaky integrator로 적분 — -6dB/oct, 저역 강조.
  - **Green**: 중역(~500Hz) 대역 강조된 핑크 변형 — "자연스러운" 중심 노이즈.
- 각 색상 버퍼는 **placement 간 공유**(같은 버퍼를 여러 소스가 참조) → 메모리 절약.
- **캐시 상한 (v0.4.2)**: 버퍼는 비압축 float32(48kHz 모노 = 192KB/s)이고, 사운드 품질 패스에서 주기성 제거를 위해 스웰 계열 색상을 40~72초로 늘렸다 — 22색 전량이면 **91MB**. 캐시를 `dispose()`에서만 비우면 카탈로그를 둘러본 세션이 그 양을 밤새 상주시킨다(안드로이드 LMK·iOS jetsam 대상). `SoundEngine`은 재생 중이 아닌 사운드의 버퍼를 **유휴 예산 24MB** 초과 시 LRU로 해제한다 → 상한 = 재생 중 버퍼 + 24MB. 재생 중 버퍼는 절대 해제하지 않으므로 소리에는 영향 없음.

```ts
// audio/noise.ts (스케치)
function renderNoise(ctx: BaseAudioContext, color: NoiseColor, seconds = 10): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // color별 채움 (white/pink/brown/green)
  return buf;                    // 색상당 1개, 미사용 시 예산 초과분부터 해제(위 캐시 상한)
}
```

## 4. 심리스 루핑 & 파일 포맷

### 루핑 전략

- **HTML `<audio loop>` 금지(파일 루프에서).** AAC는 인코더 프라이밍/패딩 프레임이 있어 `<audio>` 루프에 **틈(gap)**이 생긴다(연구 확인).
- **권장**: 파일을 `decodeAudioData`로 **AudioBuffer**로 디코드 → `AudioBufferSourceNode.loop = true` + **`loopStart`/`loopEnd`를 프라이밍 이후·제로크로싱 지점**으로 설정. 디코드된 PCM 위에서 도므로 인코더 지연이 무해.
- 깔끔히 안 붙는 소재는 **짧은 등파워 크로스페이드**(두 버퍼 소스 겹치기 또는 사전 베이크된 크로스페이드 버퍼). loopStart/loopEnd는 카탈로그(`Sound.source.loopStart/End`)에 사운드별로 기록.
- **합성음 루프 이음새 (v0.4.2)**: `renderNoiseBuffer`가 위 권고대로 **사전 베이크된 등파워 크로스페이드**를 적용한다 — 생성기에 15ms 여분을 더 요청해 그 꼬리를 머리 위로 겹친다. 양끝을 0으로 페이드하는 방식은 클릭은 없애지만 wrap마다 **-20dB(white/rain)~-32dB(wind)** 드롭아웃을 만든다(버퍼 길이는 깊이가 아니라 **빈도**만 바꾼다). 크로스페이드 후 22색 전부 wrap 델타가 자기 버퍼 델타 분포의 **p99.9 이하**(최악 0.41배), 정상 색상 레벨 편차 3dB 이내, 타격음 어택 보존(싱잉볼 59.6ms 무변화).

### 파일 포맷 (iOS WKWebView 코덱 호환)

확인된 사실(연구): iOS WKWebView가 **확실히** 디코드하는 것은 **WAV/AIFF, MP3, AAC-LC/HE-AAC**. **Ogg Opus는 Safari 18.4+(iOS 18.4+)에서만** — baseline으로 못 씀.

- **권장 배포 포맷: AAC-LC `.m4a`** (HE-AAC 가능) — 압축 크기 + iOS/Android WebView 하드웨어 디코드 보장. 프라이밍 지연은 위 **Web Audio 버퍼 루프(loopStart)** 로 흡수.
- **OGG/Opus는 baseline 미채택** (iOS 18.4 미만 미지원).
- 아주 짧은 루프(노이즈·심플 루프)는 WAV/PCM도 선택지지만(인코더 지연 0) 용량 큼 — 자연음 녹음엔 AAC 우선.
- 출처: [Apple HTML5 Audio 기기 고려사항](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html), [Opus 브라우저 지원](https://www.testmuai.com/learning-hub/opus-audio-codec-browser-support/).

## 5. 페이드 스케줄링 & autoplay

### 페이드 (슬립 타이머 연동)

- **master GainNode**에서 `setValueAtTime(now)` + `linearRampToValueAtTime(0, now + fadeOutSec)`. 지수 램프는 0에 도달 못 하므로(0 곱 불가) 페이드아웃 끝은 선형 램프 또는 `setTargetAtTime` 후 하드 0.
- 슬립 타이머: `now + (duration - fadeOutSec)`에 램프 시작 예약 → 만료 시 0 도달, 이후 소스 stop + `AudioContext.suspend()`(배터리 절약, 벤치마크 §4 "페이드아웃 후 일시정지").
- 개별 소스 fade in/out(배치·삭제 시)도 같은 원리로 각 GainNode에.

### autoplay 정책

- `AudioContext`는 **suspended**로 시작(브라우저 autoplay 정책). **첫 사용자 제스처**(첫 탭/배치)에서 `ctx.resume()`. 표준.
- Capacitor WebView도 동일 — 첫 인터랙션 전까지 재생 금지.

## 6. 백그라운드 재생 전략 (최대 리스크)

### 핵심 제약 (연구 확정)

- **WKWebView는 자체 프로세스에서 자체 `AVAudioSession`을 돌린다 — 호스트 앱이 Swift로 설정한 세션 카테고리를 무시한다.** ([WebKit #167788](https://bugs.webkit.org/show_bug.cgi?id=167788), [Apple 포럼 24464](https://developer.apple.com/forums/thread/24464)) WebView 세션은 HTML5 `<audio>`/`<video>` 요소로만 간접 영향받는다.
- **Web Audio API 그래프는 앱이 백그라운드/화면잠금되면 iOS에서 정지**하고, 잠금 해제 후에도 복구 안 될 수 있다. `UIBackgroundModes: audio`만으론 부족. ([Apple 포럼 658375](https://developer.apple.com/forums/thread/658375), [Capacitor #3446](https://github.com/ionic-team/capacitor/discussions/3446))
- Android도 WebView 오디오는 백그라운드/잠금 시 **포그라운드 서비스가 없으면** 정지.

즉 우리 앱의 정체(Web Audio 실시간 오빗 스페이셜라이제이션)와 백그라운드 재생은 **근본 긴장 관계**다. Web Audio는 백그라운드에서 못 살고, 네이티브 오디오 플러그인은 동적 오빗/HRTF를 못 낸다. 두 갈래 설계:

### 1안 (권장): "무음 킵얼라이브 + Web Audio"

- `UIBackgroundModes: audio` 켜고, **무음 루프 HTML5 `<audio>` 요소를 동시 재생**해 WKWebView 미디어 프로세스의 세션을 `.playback`으로 고정 → Web Audio 오빗 믹스가 백그라운드에서 **계속 렌더**(궤도 운동도 유지).
- Android: 같은 웹 킵얼라이브 + **포그라운드 서비스**로 WebView 프로세스 서스펜드 방지 및 미디어 알림 표시.
- **네이티브 오디오 렌더 코드 0** — 진짜 믹서가 그대로 돈다. 가장 미니멀.
- **⚠️ 신뢰성 미검증**: 무음 루프 트릭은 iOS 버전별로 편차가 크다(포럼상 Web Audio가 잠금 후 재개 안 되는 사례 존재). **실기기 테스트로 검증 필수** — 오픈 퀘스천 §8.

### 2안 (폴백): 네이티브 오프로드 (스냅샷)

1안이 대상 iOS 버전에서 불안정하면:
- 백그라운드 진입 시 **현재 믹스를 스테레오 루프 AudioBuffer로 바운스**(OfflineAudioContext로 스페이셜라이즈된 스냅샷 렌더) → 유지보수되는 네이티브 플러그인이 네이티브로 재생 + 잠금화면 컨트롤.
- **궤도 운동은 백그라운드에서 정지**(정적 공간 스냅샷). 포그라운드 복귀 시 라이브 Web Audio 그래프 재개(store에서 재구성 — 아키텍처 §7).
- 더 큰 작업량이지만 iOS 버전 무관하게 견고.

### 실존 플러그인 확인 (2026-07 기준)

| 플러그인 | 최신/날짜 | Capacitor | 백그라운드 | 상태 | 판단 |
|----------|-----------|-----------|-----------|------|------|
| **@capgo/capacitor-native-audio** | 8.4.17 / 2026-07-15 | 8 | Android 포그라운드 서비스(`backgroundPlayback`), iOS `AVAudioSession .playback` + Now Playing | **활발** (community/native-audio의 후속) | **2안 렌더 플러그인 1순위** |
| @mediagrid/capacitor-native-audio | 3.0.0 / 2026-01-23 | 8 | 백그라운드 + OS 알림, Android 포그라운드 서비스 | 활발 | 2안 대안 |
| @jofr/capacitor-media-session | v4.x | 6 (최신 대응 미확인) | Android 네이티브 포그라운드 서비스, iOS/Web은 Web Media Session 얇은 래퍼 | 유지 (Cap 8 대응 **미확인**) | **1안 Android 포그라운드 서비스/미디어 알림** 후보 |
| @capacitor-community/native-audio | (구) | — | 프리로드 파일 재생, `backgroundPlayback` 개념 | 생태계가 @capgo로 이동 | 신규 채택 비권장 |
| capacitor-plugin-background-mode | — | — | — | **미확인**(레거시 cordova 계열, 유지보수 불명) | **비권장 / 미검증** |

- **1안 조합 추천**: `UIBackgroundModes: audio` + 무음 킵얼라이브 + (Android) `@jofr/capacitor-media-session` 또는 `@capgo/capacitor-native-audio`의 포그라운드 서비스로 프로세스 유지 + 미디어 알림.
- **2안 렌더 플러그인**: `@capgo/capacitor-native-audio`(최신·Cap8·활발) 1순위.

## 7. 엔진 공개 API (TypeScript 인터페이스 스케치)

UI팀과 오디오팀 병렬 작업의 계약. `audio/`는 이 인터페이스만 노출하고 내부 노드 그래프는 숨긴다.

```ts
interface SoundEngine {
  /** 첫 사용자 제스처에서 호출. AudioContext.resume() + 노이즈 버퍼 사전 렌더 */
  init(): Promise<void>;

  /** 카탈로그 항목 로드 (파일이면 fetch+decode, 노이즈면 캐시 버퍼 확보). 멱등 */
  load(sound: Sound): Promise<void>;

  /** placement 재생 시작 → 노드 체인 생성·연결. 이미 재생 중이면 무시 */
  play(placement: Placement): void;

  /** placement 정지 → 페이드아웃 후 노드 정리 */
  stop(placementId: string, fadeSec?: number): void;

  /** 배치/볼륨/궤도/잠금 변경 반영. 오빗 드라이버가 rAF에서 위치도 갱신 */
  setPlacement(placement: Placement): void;

  /** 전역 볼륨 (0..1) */
  setMasterVolume(v: number): void;

  /** 패닝 품질 런타임 전환 (hrtf<->stereo). 재생 중에도 그래프 재배선 */
  setPanQuality(q: 'hrtf' | 'stereo'): void;

  /** 슬립 타이머: duration초 뒤 정지, 끝 fadeSec 동안 페이드아웃 (master 뒤 night 게인의 AudioParam 자동화) */
  scheduleSleep(durationSec: number, fadeSec: number): void;
  cancelSleep(): void;

  /** 테스트 전용 introspection — placement별 현재 gain/pan (Playwright 단언용) */
  inspect(placementId: string): { gain: number; pan: { x: number; z: number } } | null;

  /** 백그라운드 진입/복귀 훅 (Capacitor App 이벤트에서 호출) */
  onEnterBackground(): void;   // 1안: 킵얼라이브 확인 / 2안: 스냅샷 바운스+네이티브 재생
  onEnterForeground(): void;   // 라이브 그래프 재개 (store에서 재동기화)

  /** 전체 정지 + AudioContext 해제 */
  dispose(): void;
}
```

## 8. 리스크 & 오픈 퀘스천

1. **[최대] iOS 백그라운드 Web Audio 신뢰성** — 1안 무음 킵얼라이브가 대상 iOS 버전(15.1+ ~ 최신)에서 안정적인가? **실기기 검증 필요.** 불안정하면 2안(네이티브 스냅샷)으로. → P1/P5에서 실측.
2. **HRTF 파너 다중 동시 성능** — 모바일 WebView에서 HRTF PannerNode를 몇 개까지 동시에 무리 없이 돌리나? 임계 넘으면 자동 StereoPanner 강등 정책 필요. → 벤치 필요.
3. **@jofr/capacitor-media-session의 Capacitor 8 대응** — v4.x가 Cap 6까지만 확인됨. Cap 8에서 동작 미확인 → mobile-packager가 실제 설치·검증하거나 @capgo로 대체.
4. **AAC 루프 이음새** — loopStart/loopEnd 지점을 사운드별로 튜닝해야 함(제로크로싱). 카탈로그에 값 기록하되, 소재에 따라 크로스페이드 폴백 필요할 수 있음.
5. **Green 노이즈 정의 모호** — 벤치마크가 "Green"을 명시하나 표준 정의가 흔들림(중역 강조 노이즈로 근사). 사용자 체감상 큰 문제 아니나 튜닝 여지.
6. **OfflineAudioContext 스냅샷(2안)의 궤도 정지** — 백그라운드에서 오빗이 멈추는 UX 저하. 벤치마크도 백그라운드 상세 거동은 불명 → 1안 우선인 이유.

---

## 부록: 핵심 결정 요약

- **상태관리**: Zustand (소규모, 보일러플레이트 0, React 밖 접근). 고빈도 오빗은 store 밖 rAF/명령형.
- **패닝**: 1안 PannerNode(HRTF) — radius=거리(inverse distanceModel)로 볼륨·팬 동시 처리 / 2안 StereoPanner 폴백 + 지수 게인.
- **노이즈**: 사전 렌더 AudioBuffer 루프(~10s, 색상당 1버퍼 공유). AudioWorklet 미채택.
- **파일 포맷**: AAC-LC `.m4a` + Web Audio 버퍼 loopStart 루프. OGG/Opus 미채택.
- **백그라운드 재생 1안**: `UIBackgroundModes: audio` + 무음 킵얼라이브 + (Android) 포그라운드 서비스(@jofr/capacitor-media-session 또는 @capgo). **폴백 2안**: 네이티브 스냅샷 오프로드(@capgo/capacitor-native-audio, Cap8·활발). capacitor-plugin-background-mode는 미검증·비권장.
