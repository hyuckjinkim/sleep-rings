# Freesound 수동 다운로드 목록 (사용자용)

> Freesound API 서비스 자체의 상업적 이용 약관이 회색지대라(`docs/sound-sources.md` §1.2), 실제 앱에 들어갈 최종 파일은 **사람이 웹사이트에서 직접 다운로드**하는 것이 기본 경로다. 아래 25개 항목을 각 URL에서 받아 지정된 경로에 저장하면 된다. 전부 CC0-1.0 라이선스 확인됨(검색 시점 기준).

## 진행 방법

1. 아래 표의 "소스 URL"을 열고 페이지의 다운로드 버튼(로그인 불필요, 프리뷰 mp3/ogg 또는 원본)으로 파일을 받는다.
2. `scripts/sounds/raw/{카테고리}/{파일명}.{확장자}` 경로에 저장한다(카테고리 폴더는 미리 없으면 만들 것).
3. 전부 받은 뒤 `node scripts/sounds/process.mjs` 실행 → ffmpeg 후처리(정규화+루프 크로스페이드+AAC 변환) → 아래 "카탈로그 매핑" 항목만 `public/sounds/{카탈로그 id}.m4a` 로 생성. 그 다음 `src/library/catalog.ts`의 `UNAVAILABLE_IDS`에서 해당 id를 빼면 잠금이 풀린다(`catalog-assets.test.ts`가 파일 존재를 검사).
4. 받은 항목을 `docs/sound-licenses.md` 대장에 한 줄씩 기록(파일명·원제·소스 URL·라이선스·저작자·취득일).

## 카탈로그 매핑

앱 카탈로그(`src/library/catalog.ts`)가 실제로 참조하는 파일은 3개뿐이다. `manifest.json`의 `catalogId`가 이 대응을 정의하며, `process.mjs`는 이 3개만 출력한다. 원본 선택은 **청취 전 임시 선택** — 들어 보고 바꾸려면 `catalogId`를 다른 행으로 옮기면 된다.

| 카탈로그 id | 출력 파일 | 원본 id | 원본 저장 경로 |
|---|---|---|---|
| garden-rain | public/sounds/garden-rain.m4a | rain-heavy-01 | scripts/sounds/raw/rain/rain-heavy-01.* |
| seaside | public/sounds/seaside.m4a | ocean-coast-01 | scripts/sounds/raw/ocean/ocean-coast-01.* |
| night-stream | public/sounds/night-stream.m4a | water-forest-stream-00 | scripts/sounds/raw/water/water-forest-stream-00.* |

나머지 22개는 후보 목록(카탈로그 미사용)이다.

## 목록

| id | 카테고리 | 원제 | 저작자 | 소스 URL | 저장 경로 |
|---|---|---|---|---|---|
| rain-heavy-01 | rain | Heavy Rain | EricsSoundschmiede | https://freesound.org/people/EricsSoundschmiede/sounds/666624/ | scripts/sounds/raw/rain/rain-heavy-01.mp3 |
| rain-backyard-01 | rain | Heavy rain in a backyard with people talking | BonnyOrbit | https://freesound.org/people/BonnyOrbit/sounds/645926/ | scripts/sounds/raw/rain/rain-backyard-01.wav |
| rain-bucket-01 | rain | Rain Drips in a bucket | TheGloomWorker | https://freesound.org/people/TheGloomWorker/sounds/683249/ | scripts/sounds/raw/rain/rain-bucket-01.mp3 |
| ocean-coast-01 | ocean | Ocean_coast_04_092025_0659AM | YevgVerh | https://freesound.org/people/YevgVerh/sounds/827530/ | scripts/sounds/raw/ocean/ocean-coast-01.wav |
| ocean-rocky-beach-01 | ocean | Ocean Waves, Rocky Beach | goochiano | https://freesound.org/people/goochiano/sounds/623051/ | scripts/sounds/raw/ocean/ocean-rocky-beach-01.wav |
| ocean-waves-01 | ocean | Ocean waves | derjuli | https://freesound.org/people/derjuli/sounds/535069/ | scripts/sounds/raw/ocean/ocean-waves-01.wav |
| water-forest-stream-00 | water | water_forest_stream_00_l | teadrinker | https://freesound.org/people/teadrinker/sounds/403049/ | scripts/sounds/raw/water/water-forest-stream-00.wav |
| water-forest-stream-03 | water | water_forest_stream_03_l | teadrinker | https://freesound.org/people/teadrinker/sounds/403048/ | scripts/sounds/raw/water/water-forest-stream-03.wav |
| camping-campfire-01 | camping | Campfire deer camp - adding kindling - med wind - part 4 | Ambient-X | https://freesound.org/people/Ambient-X/sounds/660298/ | scripts/sounds/raw/camping/camping-campfire-01.wav |
| camping-campfire-02 | camping | 1.3. campfire | 15GKovacovaJulie | https://freesound.org/people/15GKovacovaJulie/sounds/461083/ | scripts/sounds/raw/camping/camping-campfire-02.wav |
| camping-crickets-01 | camping | 180811 Night insects crickets thick distant traffic | TRP | https://freesound.org/people/TRP/sounds/571092/ | scripts/sounds/raw/camping/camping-crickets-01.wav |
| camping-crickets-02 | camping | 180903 Night late insects thick chorus field | TRP | https://freesound.org/people/TRP/sounds/571207/ | scripts/sounds/raw/camping/camping-crickets-02.wav |
| city-traffic-01 | city-life | AMBTraf Ambience bus stop close perspective | SFXAFRIK | https://freesound.org/people/SFXAFRIK/sounds/582935/ | scripts/sounds/raw/city-life/city-traffic-01.wav |
| city-subway-01 | city-life | city ambience, pedestrian subway, inside | be_a_hero_not_a_patriot | https://freesound.org/people/be_a_hero_not_a_patriot/sounds/332784/ | scripts/sounds/raw/city-life/city-subway-01.wav |
| windchimes-01 | wind-chimes | Wind chimes 1 | giddster | https://freesound.org/people/giddster/sounds/437337/ | scripts/sounds/raw/wind-chimes/windchimes-01.wav |
| windchimes-02 | wind-chimes | wind chimes - single 04 | Anthousai | https://freesound.org/people/Anthousai/sounds/398496/ | scripts/sounds/raw/wind-chimes/windchimes-02.wav |
| animals-bird-01 | animals | Canarian_Bird_In_Cage_Singing_2 | ivolipa | https://freesound.org/people/ivolipa/sounds/329548/ | scripts/sounds/raw/animals/animals-bird-01.wav |
| animals-bird-02 | animals | Canarian_Bird_In_Cage_Singing_SHORT | ivolipa | https://freesound.org/people/ivolipa/sounds/329547/ | scripts/sounds/raw/animals/animals-bird-02.wav |
| music-harp-01 | music-instruments | Harp Melody Lovely Resonance 2 | luckylittleraven | https://freesound.org/people/luckylittleraven/sounds/415397/ | scripts/sounds/raw/music-instruments/music-harp-01.wav |
| music-harp-02 | music-instruments | Harp Whimsical Riff | luckylittleraven | https://freesound.org/people/luckylittleraven/sounds/415433/ | scripts/sounds/raw/music-instruments/music-harp-02.wav |
| haircut-scissors-01 | haircut | hair scissors 03 | _sinny_ | https://freesound.org/people/_sinny_/sounds/822430/ | scripts/sounds/raw/haircut/haircut-scissors-01.wav |
| haircut-scissors-02 | haircut | Scissors | mmg67 | https://freesound.org/people/mmg67/sounds/567933/ | scripts/sounds/raw/haircut/haircut-scissors-02.wav |
| meditation-singingbowl-01 | monks-chanting | Tibetan Singing Bowl | FlashTrauma | https://freesound.org/people/FlashTrauma/sounds/398285/ | scripts/sounds/raw/monks-chanting/meditation-singingbowl-01.wav |
| meditation-singingbowl-02 | monks-chanting | Singing Bowl, long without reverb | hollandm | https://freesound.org/people/hollandm/sounds/573805/ | scripts/sounds/raw/monks-chanting/meditation-singingbowl-02.wav |
| background-fan-hum-01 | background-noises | Large Floor Fan - Steady Deep Hum - 2 Minutes | FansAreCoolAndRelaxing16 | https://freesound.org/people/FansAreCoolAndRelaxing16/sounds/843484/ | scripts/sounds/raw/background-noises/background-fan-hum-01.wav |

## 참고

- 저장 경로의 확장자는 실제 다운로드되는 파일 형식에 맞춰 조정(mp3/wav/ogg/flac 무엇이든 `process.mjs`가 ffmpeg로 변환하므로 무관).
- `whispers` / `positive-affirmations` / `lucid-dreaming` 3개 카테고리는 이 목록에 없음 — v1 제외(음성 녹음/TTS 필요, `docs/sound-sources.md` §2 참고).
- `monks-chanting` 카테고리는 실제 챈팅 보컬 대신 싱잉볼로 대체 조달했음(문화적 민감성·저작권 리스크 회피, `docs/sound-sources.md` §1 참고).
