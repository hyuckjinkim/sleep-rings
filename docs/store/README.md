# 스토어 등록자료 — 인덱스

## 파일

- `listing-ko.md` / `listing-en.md` — App Store·Play Store 공용 등록 문구 초안(앱명·서브타이틀·설명·키워드·카테고리·스크린샷 캡션)
- `privacy-policy-ko.md` / `privacy-policy-en.md` — 개인정보처리방침(믹스·프리셋은 전부 로컬 저장 / 배너 광고 SDK가 광고 식별자를 처리 — `docs/ads-setup.md` 참고)
- `screenshots/{ios,android}/01~04-*.png` — 자동 캡처 스크린샷(아래 스크립트로 재생성)

## 스크린샷 재생성

```
node scripts/store/screenshots.mjs
```

dev 서버(`localhost:5173`)가 떠 있지 않으면 스크립트가 알아서 `npm run dev`로 띄우고 끝나면 종료한다. 이미 떠 있으면 그대로 재사용(종료하지 않음). iOS(1290x2796) / Android(1080x1920) 두 뷰포트 각각 4장(빈 필드 → 노이즈 4종 배치 → 오브 탭 팝오버 → 슬립 타이머/프리셋)을 찍는다. 궤도가 rAF로 계속 회전해 Playwright의 클릭/스크린샷 안정성 체크가 절대 통과하지 못하는 문제가 있어, 스크립트가 `page.emulateMedia({ reducedMotion: 'reduce' })`로 앱에 이미 내장된 감속-모션 정지 로직(`OrbitField.tsx`, `visual-theme.md` §9)을 켜서 우회한다 — 덕분에 재실행할 때마다 결과가 결정적이다.

## 아이콘·스플래시 생성 — 완료 (#12b)

`@capacitor/assets@3.0.5`(devDependency)로 `assets/icon.svg`에서 iOS/Android 전 해상도 아이콘·스플래시를 생성 완료 — Android `mipmap-{m,h,xh,xxh,xxxh}dpi`(런처 아이콘 + 적응형 아이콘 전경/배경 + 라이트/다크 스플래시), iOS `Assets.xcassets/{AppIcon,Splash}.imageset`. 배경색은 앱 테마 토큰과 동일값 사용(`src/app/theme.css`의 `--so-bg-void #05070d`/`--so-bg-base #0a0e1a` — 앱에 별도 라이트 테마가 없어 라이트/다크 둘 다 동일값).

재생성 명령:

```bash
npx @capacitor/assets generate --iconBackgroundColor '#05070d' --iconBackgroundColorDark '#05070d' --splashBackgroundColor '#0a0e1a' --splashBackgroundColorDark '#0a0e1a' --ios --android
```

**`--ios --android`를 반드시 명시할 것** — 플래그 없이 실행하면 이 프로젝트가 쓰지 않는 PWA 매니페스트(`public/manifest.webmanifest`)와 최상위 `icons/` 디렉터리까지 같이 생성한다(#12b에서 발견, 수동 삭제 후 처리).

Android 알림(백그라운드 재생 포그라운드 서비스, `docs/android-build.md` §3) 아이콘 `ic_stat_sleeprings`도 `assets/icon.svg`의 실제 초승달 모티프(두 원 마스크 합성, `docs/android-build.md` §3 참고)로 교체 완료 — 기존 손으로 그린 플레이스홀더 벡터는 삭제.

## 스토어 제출 전 반드시 교체할 항목

- `privacy-policy-ko.md` / `privacy-policy-en.md`의 `[실제 연락 이메일로 교체]`, `[시행일]`, 개인정보 보호책임자 성명 — 실제 게시 계정 이메일 확정 전이라 자리표시자로 남겨둠(임의로 개인 이메일을 채워 넣지 않음)
- Play Console 신고(2026-11-24 고도화 플랜 2단계): ① `mediaPlayback` 포그라운드 서비스 — 사용자가 직접 재생을 시작하는 장면이 담긴 영상 필수 ② Health apps — 「Sleep Management」 ③ Data safety — AdMob 수집 항목(광고 ID·대략적 위치·기기 정보·앱 상호작용, 공유: Google). 광고는 설정 화면 배너로 유지(2026-11-24 오너 결정)
- `docs/app-name.md`에 이미 기록된 대로, 번들 ID(`com.sleeprings.app`)의 USPTO/KIPRIS 공식 조회·도메인 확인은 제출 전 별도 필요
