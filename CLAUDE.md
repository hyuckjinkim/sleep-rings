# Sleep-Rings

수면 사운드 믹서 앱 — React 19 · Vite · TypeScript · zustand · Capacitor 8(웹·Android·iOS).

## 규칙

@../.styleguide/README.md
@../.styleguide/app/README.md
@../.styleguide/Sleep-Rings/README.md

규칙 본문은 위 세 파일에 있다(우선순위: 저장소 > 그룹 > 개인판 §0 > 공통). 이 파일에는 이 저장소에서 일할 때 조심할 것만 둔다.

## 검사

- 타입: `npm run typecheck`. `tsc -b` 는 쓰지 않는다 — `tsconfig.tsbuildinfo` 가 남는다.
- 테스트: `npx vitest run --pool=forks --maxWorkers=1`(WSL 에서 병렬 실행이 타임아웃 난다). 결과의 테스트 파일 수가 `find src -name '*.test.ts*' | wc -l` 과 같은지 본다.
- 빌드: `npx vite build` · Android: `cd android && ./gradlew assembleDebug`.
- iOS Swift 는 이 환경(Xcode 없음)에서 컴파일할 수 없다. 고친 Swift 는 「미검증」이라고 적는다.

## 함정

- `src/audio/noise.test.ts` 의 새소리 RMS 검사는 시드 없는 난수라 가끔 실패한다(알려진 불안정).
- 포트 4173 은 `npm run web` 미리보기·터널이 쓴다.
- 서명 키(`*.keystore`·`keystore.properties`)와 사운드 원본 `scripts/sounds/raw/` 는 git 밖이다.
- 릴리스(`npm run release`)는 Android `build.gradle`·iOS `project.pbxproj` 판도 함께 올린다 — 사용자 요청 때만.
