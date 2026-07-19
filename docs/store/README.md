# 스토어 등록자료 — 인덱스

## 파일

- `listing-ko.md` / `listing-en.md` — App Store·Play Store 공용 등록 문구 초안(앱명·서브타이틀·설명·키워드·카테고리·스크린샷 캡션)
- `privacy-policy-ko.md` / `privacy-policy-en.md` — 개인정보처리방침(수집 데이터 없음, 전부 로컬 저장)
- `screenshots/{ios,android}/01~04-*.png` — 자동 캡처 스크린샷(아래 스크립트로 재생성)

## 스크린샷 재생성

```
node scripts/store/screenshots.mjs
```

dev 서버(`localhost:5173`)가 떠 있지 않으면 스크립트가 알아서 `npm run dev`로 띄우고 끝나면 종료한다. 이미 떠 있으면 그대로 재사용(종료하지 않음). iOS(1290x2796) / Android(1080x1920) 두 뷰포트 각각 4장(빈 필드 → 노이즈 4종 배치 → 오브 탭 팝오버 → 슬립 타이머/프리셋)을 찍는다. 궤도가 rAF로 계속 회전해 Playwright의 클릭/스크린샷 안정성 체크가 절대 통과하지 못하는 문제가 있어, 스크립트가 `page.emulateMedia({ reducedMotion: 'reduce' })`로 앱에 이미 내장된 감속-모션 정지 로직(`OrbitField.tsx`, `visual-theme.md` §9)을 켜서 우회한다 — 덕분에 재실행할 때마다 결과가 결정적이다.

## 아이콘 PNG 변환 — 스킵됨 (#12b에서 처리)

`assets/icon.svg`(1024 viewBox)를 실제 제출용 PNG(1024x1024 등)로 변환해야 하는데, 이 환경엔 변환 도구가 하나도 없다(확인 완료: `sharp`는 devDependencies에 없음, `rsvg-convert`/`convert`(ImageMagick)/`inkscape` 전부 PATH에 없음). 새 의존성을 설치하지 않고 명령만 남긴다.

아래 중 하나가 설치되면 실행:

```bash
# ImageMagick (convert 또는 magick)
convert -background none -resize 1024x1024 assets/icon.svg assets/icon-1024.png

# rsvg-convert (librsvg)
rsvg-convert -w 1024 -h 1024 assets/icon.svg -o assets/icon-1024.png

# sharp (프로젝트에 devDependency로 추가 후)
node -e "require('sharp')('assets/icon.svg').resize(1024,1024).png().toFile('assets/icon-1024.png')"
```

Android는 추가로 여러 해상도(mipmap-mdpi~xxxhdpi)가 필요하므로, 위 명령의 `-resize`/`-w -h` 값을 48/72/96/144/192(mdpi~xxxhdpi)로 바꿔 반복하거나 `@capacitor/assets` 같은 기존 Capacitor 툴체인을 쓰는 편이 낫다(mobile-packager 담당 영역).

## 스토어 제출 전 반드시 교체할 항목

- `privacy-policy-ko.md` / `privacy-policy-en.md`의 `[실제 연락 이메일로 교체]`, `[시행일]` — 실제 게시 계정 이메일 확정 전이라 자리표시자로 남겨둠(임의로 개인 이메일을 채워 넣지 않음)
- `docs/app-name.md`에 이미 기록된 대로, 번들 ID(`com.sleeprings.app`)의 USPTO/KIPRIS 공식 조회·도메인 확인은 제출 전 별도 필요
