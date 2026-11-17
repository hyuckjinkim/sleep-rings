# 릴리즈 · CHANGELOG 운영

release-please(manifest 모드, `release-type: node`)가 버전과 `CHANGELOG.md`를 관리한다.
main에 푸시될 때마다 `.github/workflows/release-please.yml`이 릴리즈 PR을 열거나 갱신하고,
그 PR을 머지하면 `vX.Y.Z` 태그와 GitHub Release가 만들어진다.

## 버전이 올라가는 규칙 (1.0 이전, `bump-minor-pre-major`)

| 커밋 | 결과 |
|---|---|
| `feat` | 마이너 (0.5.0 → 0.6.0) |
| `fix`, `perf` | 패치 (0.5.0 → 0.5.1) |
| 하위호환 깨짐(`!` 또는 `BREAKING CHANGE`) | 1.0 이전엔 마이너만 |
| `chore` | changelog에 안 나오고, chore만 있으면 릴리즈도 안 함 |

릴리즈 PR이 함께 올리는 버전: `package.json`·`package-lock.json`, Android `versionName`,
iOS `MARKETING_VERSION`(`x-release-please-version` 주석이 붙은 줄만). **정수 빌드 번호
(Android `versionCode`, iOS `CURRENT_PROJECT_VERSION`)는 자동으로 오르지 않는다** — 스토어
업로드 전에 직접 올린다. Xcode가 pbxproj를 다시 저장하며 주석을 지우면 iOS 버전도 그때부터는
수동이다(주석이 남아 있는지 확인).

## 커밋 메시지

- `type(scope): 설명` — 설명은 한국어, 무엇·왜, 72자 이내. type은 feat/fix/perf/refactor/docs/chore/test/ci/style.
- **커밋 제목과 BREAKING CHANGE 꼬리말에 꺾쇠괄호 금지.** release-please가 PR 본문을 HTML로
  파싱해서 꺾쇠 토큰이 들어가면 태그가 조용히 안 만들어지고 run은 success로 끝난다
  (백틱으로 감싸도 소용없다 — `{src}`, `SRC`처럼 쓴다).
- PR로 머지하면 PR 제목에는 type을 붙이지 않는다. 제목이 merge commit에 들어가 같은 항목이
  changelog에 두 번 실린다.

## CHANGELOG.md를 손으로 고칠 때

- 항목은 봇이 쓴다. 사람은 릴리즈마다 **버전 헤더 바로 아래 요약 한 단락**(이번 릴리즈의 "왜")만 쓴다.
- 이 단락은 릴리즈 PR을 머지하기 직전에 그 PR 브랜치에 **`chore:`** 커밋으로 올린다.
  `docs:`로 올리면 그 자체가 다음 릴리즈 대상 변경으로 잡힌다.

## 머지 후 확인

- 태그가 실제로 만들어졌는지 확인한다(run이 success여도 안 만들어졌을 수 있다).
- **태그는 손으로 만들지 않는다.** 봇이 수동 태그를 직전 릴리즈로 읽어 그 이전 커밋을 changelog에서 뺀다.
- 첫 릴리즈의 기준점은 `bootstrap-sha`(0.5.0 릴리즈 커밋 66cf8ab)다. 0.5.0 이하 이력은
  `RELEASE_MANIFEST.json`에서 `CHANGELOG.md`로 옮겨 왔다. AAB 크기·서명 검증 같은 빌드 기록은
  계속 `RELEASE_MANIFEST.json`에 남긴다.

## 저장소 최초 설정 (1회)

GitHub → Settings → Actions → General → **"Allow GitHub Actions to create and approve pull
requests"**를 켜야 봇이 릴리즈 PR을 열 수 있다.
