# 릴리즈 · CHANGELOG 운영

CI 비용 없이 로컬에서 [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version)으로
버전·`CHANGELOG.md`·git 태그를 관리한다. 설정: `.versionrc.json`.

## 릴리즈 절차

```bash
npm run release -- --dry-run                 # 미리보기: 올라갈 버전과 changelog
npm run release -- --release-as minor        # 기능 릴리즈 (0.5.0 → 0.6.0)
npm run release                              # 수정만 있는 릴리즈 (0.5.0 → 0.5.1)
git push --follow-tags origin main
```

한 번 실행하면 버전 올리기 → `CHANGELOG.md` 갱신 → `chore(release): x.y.z` 커밋 → `vX.Y.Z` 태그까지
처리된다. 함께 올라가는 버전: `package.json`·`package-lock.json`, Android `versionName`,
iOS `MARKETING_VERSION`(`x-release-version` 주석이 붙은 줄만, `scripts/release/version-updater.cjs`).

**정수 빌드 번호(Android `versionCode`, iOS `CURRENT_PROJECT_VERSION`)는 자동으로 오르지 않는다** —
스토어 업로드 전에 직접 올린다. Xcode가 pbxproj를 다시 저장하며 주석을 지우면 iOS 버전도
수동이 되므로 릴리즈 전에 주석이 남아 있는지 확인한다.

## 버전이 올라가는 규칙 (1.0 이전)

이 도구는 1.0 이전에 한 단계 낮춰 올린다: `feat` → 패치, 하위호환 깨짐 → 마이너.
기능 릴리즈를 마이너로 내려면 `--release-as minor`를 붙인다(위 절차). `chore`·`test`·`ci`·`style`은
changelog에 나오지 않는다.

## 커밋 메시지

- `type(scope): 설명` — 설명은 한국어, 무엇·왜, 72자 이내. type은 feat/fix/perf/refactor/docs/chore/test/ci/style.
- changelog 섹션: 기능(feat)·수정(fix)·성능(perf)·구조(refactor)·문서(docs).

## CHANGELOG.md를 손으로 고칠 때

- 항목은 도구가 쓴다. 사람은 필요하면 버전 헤더 바로 아래에 요약 한 단락(이번 릴리즈의 "왜")만 추가한다 —
  `npm run release -- --skip.commit --skip.tag`로 파일만 갱신하고 요약을 넣은 뒤, 직접 커밋하고 태그를 단다.
- **태그는 이 도구가 만든 `vX.Y.Z`만 쓴다.** 다음 릴리즈는 직전 태그 이후 커밋만 changelog에 담는다.
- 기준점: `v0.5.0` 태그(66cf8ab). 0.5.0 이하 이력은 구 `RELEASE_MANIFEST.json`(삭제)에서 옮겨 왔다.
- AAB 크기·서명 검증, 오너 후속 작업 같은 빌드 메모는 해당 버전 아래 `### 참고` 목록으로 직접 적는다
  (위 요약 단락과 같은 절차 — 파일만 갱신하고 커밋 전에 추가).
