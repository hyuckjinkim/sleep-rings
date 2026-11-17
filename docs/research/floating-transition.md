# 튀어나오던 궤도 필드를 날아오르게 만들기

플랫폼 가이드의 결론은 **스크롤에 1:1로 묶인 연속 축소가 가장 자연스럽고, 순간적인 임계값 전환은 "튄다"는 비판을 받는다**는 것이다. 하지만 sleep-orbit은 폰에서 **최대 스크롤이 약 136px**밖에 안 된다(`src/mixer/FieldDock.tsx` 주석). 그래서 360px 필드를 제자리에서 연속으로 줄여 작은 창까지 만들 수 없다. 게다가 사용자가 요청한 떠 있는 창, 최소화 버튼, 스트립 뷰, 맨 위 복귀는 모두 PiP 계열의 설계다. 따라서 권장안은 "허용 등급"이다. 기존 임계값과 히스테리시스(약 68px 진입, 41px 복귀)는 유지하고, 순간이동만 **250–300ms의 대칭적이고 중단 가능한 컨테이너 트랜스폼**으로 바꾼다. 빈 스페이서는 돌아갈 자리를 보여주는 "도크 슬롯"으로 바꾼다. 구현은 기존 rAF 루프 위에서 **진행값 하나(`--m`)로 슬롯과 창의 실측 사각형을 매 프레임 보간하는 손수 짠 FLIP 변형**으로 한다. 이 방식은 iOS 15 WKWebView까지 모든 타깃에서 돌고, 오브 위치 계산을 바꿀 필요가 없으며, 스크롤 중 움직이는 목적지도 따라간다. 창을 던질 때의 물리감은 2단계에서 Android PiP식 좌우 가장자리 스냅, 속도 투영, 임계 감쇠 스프링으로 더한다.

## 레퍼런스는 두 계열로 갈리고, 지금 구현은 그 사이에 끼어 있다

조사한 패턴은 진입 방식과 빈 자리 처리 방식에 따라 정확히 두 계열로 나뉜다. 첫째는 **스크롤 연동 축소 계열**이다. Material의 `AppBarLayout`은 뷰가 "스크롤 이벤트에 직접 비례해" 움직인다고 정의한다. `EXIT_UNTIL_COLLAPSED`는 최소 높이까지 줄어든 뒤 멈추고, `SNAP`은 "스크롤이 끝났을 때" 부분적으로 보이는 뷰를 가까운 쪽 끝으로 붙인다. 즉 스크롤하는 동안에는 항상 비례하고, 스냅은 손을 뗀 뒤에만 일어난다([Android AppBarLayout.LayoutParams](https://developer.android.com/reference/com/google/android/material/appbar/AppBarLayout.LayoutParams)). Compose의 `exitUntilCollapsedScrollBehavior`는 nested scroll로 스크롤 델타를 먼저 소비한다. 그래서 바가 줄어드는 만큼 콘텐츠가 올라오고 빈틈이 생기지 않는다([Android Developers: App bars](https://developer.android.com/develop/ui/compose/components/app-bars)). iOS 26의 탭바도 같은 계열이다. `.tabBarMinimizeBehavior(.onScrollDown)`으로 스크롤 시 최소화되고, Apple Music 플레이어 같은 하단 액세서리는 구멍을 남기지 않고 최소화된 탭 버튼 옆으로 자리를 옮긴다([Donny Wals](https://www.donnywals.com/exploring-tab-bars-on-ios-26-with-liquid-glass/)).

둘째는 **떠 있는 창 계열**이다. YouTube 미니플레이어는 2024년에 하단 바에서 PiP 비슷한 떠 있는 창으로 바뀌었다. 2025년 5월 업데이트에서는 하단 컨트롤 띠가 빠졌고, 창은 크기를 바꿀 수 있으며 시스템 PiP처럼 좌우 가장자리에 숨겼다가 손잡이로 꺼낼 수 있다([9to5Google](https://9to5google.com/2025/05/15/youtube-miniplayer-update/)). 이 창은 시청 페이지를 떠날 때 나타나므로, 원래 페이지에 구멍이 보이는 상황 자체가 없다. 다만 재설계가 사용자 반발로 일부 롤백됐다는 보도는 단일 출처라 확인되지 않았다([Techloy](https://www.techloy.com/youtube-reportedly-rolls-back-miniplayer-redesign-after-user-backlash/)). iOS PiP는 "가벼운 플릭만으로 화면 어느 구석으로든" 옮겨지는 창이다([WWDC18 Designing Fluid Interfaces](https://developer.apple.com/videos/play/wwdc2018/803/)). Android PiP는 네 모서리가 아니라 좌우 가장자리로 스냅하고 세로 위치는 자유롭다([AOSP PipMotionHelper](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android14-release/libs/WindowManager/Shell/src/com/android/wm/shell/pip/phone/PipMotionHelper.java)). **Spotify와 Apple Music의 전체 플레이어↔미니 바 애니메이션은 1차 출처(디자인 문서)를 찾지 못했다.** 흔히 관찰되는 "아래로 쓸면 손가락을 따라 아트워크가 미니 바로 줄어든다"는 묘사는 이 보고서에서 검증되지 않은 것으로 남겨 둔다.

| 레퍼런스 | 진입 트리거 | 무엇이 움직이나 | 빈 자리 | sleep-orbit에 주는 교훈 |
|---|---|---|---|---|
| Material 접히는 툴바 | 스크롤 오프셋(연속) | 높이·내용이 스크롤에 비례 | 레이아웃이 실제로 줄어 없음 | 이상형이지만 긴 페이지가 전제 |
| iOS 26 탭바 + 액세서리 | 아래 방향 스크롤 | 탭바 최소화, 액세서리 재배치 | 바 영역 자체가 줄어 없음 | 작은 형태가 큰 형태 근처에 머묾 |
| YouTube 미니플레이어 | 페이지 이탈·제스처 | 떠 있는 창, 가장자리 숨김 | 다른 페이지라 없음 | 떠 있는 창은 스크롤로 진입하지 않음 |
| iOS PiP | 앱 이탈 | 네 모서리 스냅, 투영 기반 플릭 | 해당 없음 | 던지기는 속도 투영으로 판정 |
| Android PiP | 앱 이탈 | 좌우 가장자리 스냅, 세로 자유, 숨김 | 해당 없음 | 세로 자유 배치를 살리는 스냅 모델 |
| Spotify / Apple Music 미니 바 | 제스처·탭(관찰, 미검증) | 근거 공백 | 근거 공백 | 인용 불가, 설계 근거로 쓰지 않음 |
| 공유 요소 / 컨테이너 트랜스폼 | 상태 전환 | 하나의 컨테이너가 크기·모양을 바꿈 | 전환 경로로 연결 | 이산 전환을 "이어 보이게" 만드는 표준 수단 |

이 표에서 sleep-orbit의 위치가 보인다. 지금 구현은 **스크롤 위치로 진입하는 떠 있는 창**이다. 아래 진단은 인용 사실이 아니라 이 보고서의 추론이다. 근거도 두 군데 비어 있다. 인용한 YouTube 기사는 미니플레이어 진입 방식을 설명하지 않는다. 그리고 가장 가까운 선례인 "스크롤하면 모서리로 붙는 모바일 웹 뉴스 동영상"은 조사하지 않았다. 이 점을 전제로 보면, 지금 구현은 첫째 계열의 트리거와 둘째 계열의 표현을 섞었고, 두 계열이 각자 피하는 문제를 모두 떠안은 것으로 보인다. 스크롤 계열은 제자리에서 줄어들어 공간 연속성을 지키고, 창 계열은 페이지를 떠나므로 구멍이 보이지 않는다. 지금 구현은 경로 없이 다른 위치에 나타나고, 원래 자리에는 구멍을 남긴다. Apple은 화면을 떠났다 돌아오는 요소는 "대칭적인 경로"로 오가야 한다고 말한다([WWDC18](https://developer.apple.com/videos/play/wwdc2018/803/)). NN/g는 헤더가 "사라졌다가 갑자기 다시 나타나는" 축소를 대표적인 결함으로 든다([NN/g: Sticky Headers](https://www.nngroup.com/articles/sticky-headers/)). 지금의 부자연스러움은 이 두 원칙을 동시에 어긴 결과다.

## 연속 축소가 정답이지만, 136px 스크롤에서는 허용 등급을 택한다

질문 (1)의 근거를 있는 그대로 정리하면 순위는 분명하다. Apple HIG는 동작이 "사람의 제스처와 기대를 따르는" 사실적인 피드백이어야 하고, 사용자가 애니메이션을 기다리지 않고 취소할 수 있어야 한다고 말한다([Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)). WWDC18은 "1:1 추적이 극도로 중요하다"고 강조하고, 경계에서 부드러운 전환 없이 멈추면 "벽에 부딪힌 듯 거칠다"고 표현한다([WWDC18](https://developer.apple.com/videos/play/wwdc2018/803/)). NN/g는 축소 애니메이션이 "빠르고 부드럽고 즉각적"이어야 하며 헤더가 "튀거나 사용자를 놀라게 해서는 안 된다"고 하고, 부분 고정 헤더의 슬라이드인은 약 300–400ms면 자연스럽다고 본다([NN/g: Sticky Headers](https://www.nngroup.com/articles/sticky-headers/)). 이를 종합하면 **연속 스크롤 연동 + 손 뗀 뒤 스냅이 최선**이고, **이산 전환 + 짧은 컨테이너 트랜스폼이 허용 등급**이며, **애니메이션 없는 순간 전환이 최하위**다. 다만 두 방식을 직접 비교한 A/B 테스트나 정량 연구는 찾지 못했다. 이 순위는 가이드라인과 전문가 의견에 근거한다.

그런데 sleep-orbit에서 최선안이 성립하지 않는 이유는 취향이 아니라 기하학이다. `FieldDock.tsx`의 주석에 따르면 폰에서 최대 스크롤은 약 136px이다. 그래서 진입 임계값은 `min(top + h·0.5, maxScroll·0.5)`로 상한이 걸려 **약 68px에서 미니로, 약 41px 아래로 오면 복귀**한다. Material식으로 필드를 흐름 안에서 줄이면 문서 높이가 줄고, 스크롤 범위가 줄고, 진행도가 바뀌는 되먹임 루프가 생긴다. 136px 페이지에서는 축소가 끝나기 전에 스크롤할 공간이 사라진다. 높이를 고정한 sticky 헤더 기법은 루프를 피하지만, 136px만큼만 줄어 360px 필드가 약 224px에서 멈춘다. 결국 연속 축소로는 "작은 창"에 도달할 수 없다. 스페이서가 존재하는 이유도 같다. 주석은 스페이서가 없으면 전환마다 페이지 높이가 바뀌어 `scrollY`가 임계값을 넘나들며 모드가 깜빡인다고 설명한다. 그래서 이 앱의 정답은 **허용 등급, 즉 기존 임계값과 히스테리시스는 유지하되 순간이동을 컨테이너 트랜스폼으로 바꾸는 것**이다. Material의 기본 컨테이너 트랜스폼은 들어올 때 300ms, 나갈 때 250ms이고 이징은 `cubic-bezier(0.4, 0.0, 0.2, 1)`이다([material-components-android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)). 미니로 갈 때 250ms, 전체로 돌아올 때 300ms면 NN/g 범위 안에 든다. **이 판단은 페이지가 짧다는 사실에 걸려 있다.** 타이머·프리셋 영역이 커져 스크롤 범위가 약 300px 이상이 되면, 아래에 설명할 같은 진행값을 시간 대신 스크롤로 구동하는 연속 방식으로 바꿀 수 있다.

질문 (5)의 트리거와 히스테리시스는 이 결정과 맞물린다. 트리거는 세 가지다. **스크롤**(기존 엣지 트리거 방식 유지), **최소화/확대 버튼**(확대는 지금처럼 맨 위로 부드럽게 스크롤), **도크 슬롯 탭**(확대)이다. 지금 히스테리시스 폭은 약 27px이다. 문헌 근거 없이 엔지니어링 추정으로 제시되는 24–40px 범위 안에 들어가므로 그대로 둬도 된다. 플랫폼이 규정한 값은 없다. 엣지 트리거(직전 위치와 현재 위치가 임계값을 가로지를 때만 전환) 덕분에 맨 위에서 수동으로 최소화한 뒤 작은 스크롤 한 번에 되돌아가는 문제도 이미 막혀 있다. 추가할 규칙은 두 가지다. 하나는 **포인터 제스처가 진행 중이면 스크롤 트리거 전환을 손을 뗄 때까지 미루는 것**이다. 오브 드래그, 팔레트 칩을 미니 필드로 끌어오는 중, 창 이동이 여기에 해당한다. AOSP는 키보드 때문에 PiP를 옮겨야 할 때도 사용자가 드래그 중이면 손을 뗄 때까지 기다린다([AOSP PipTouchHandler](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android14-release/libs/WindowManager/Shell/src/com/android/wm/shell/pip/phone/PipTouchHandler.java)). 다른 하나는 **애니메이션 중 반대 방향 트리거가 오면 현재 위치에서 방향만 뒤집는 것**이다. HIG의 "동작을 취소할 수 있게 하라"와 WWDC18의 "끊임없는 방향 전환과 중단 허용"이 이것을 요구한다. 미니 필드 자체를 탭해서 확대하는 동작은 넣지 않는다. 미니 필드의 탭은 오브 선택에 쓰이므로, 탭 하나에 두 의미를 싣게 된다.

## 빈 자리는 숨기지 말고 "도크 슬롯"으로 만든다

질문 (3)은 이 앱에서 부차적인 문제가 아니라 **화면에서 가장 큰 시각 요소**다. 전환이 약 68px 스크롤에서 일어나므로, 그 순간 360px 슬롯의 대부분이 아직 화면에 있다. 맨 위에서 버튼으로 최소화하면 슬롯 전체가 그대로 보인다. 플랫폼 패턴들은 실제 레이아웃을 줄이거나(접히는 툴바, iOS 26 액세서리) 페이지를 떠나서(YouTube, PiP) 구멍을 없앤다. 앞 절의 이유로 둘 다 불가능하므로, 남은 길은 구멍을 **의도된 자리**로 바꾸는 것이다.

다음은 이 보고서의 설계 제안이며, 출처가 있는 플랫폼 패턴은 아니다. 스페이서를 `aria-hidden` 빈 `div`에서 **필드와 같은 크기의 희미한 원형 윤곽("도크 슬롯")**으로 바꾼다. 가운데에는 확대 아이콘과 "미니 창으로 떠 있음 · 눌러서 되돌리기" 같은 짧은 문구를 둔다. 슬롯의 불투명도는 전환 진행값 `--m`에 묶는다. 필드가 떠나는 만큼 윤곽이 나타나므로 어느 프레임에서도 "아무것도 없는 구멍"이 보이지 않는다. 이 슬롯은 세 가지 일을 한다. 첫째, 복귀 애니메이션에 눈에 보이는 목적지를 줘서 WWDC18이 말한 대칭 경로를 완성한다. 둘째, 접근 가능한 버튼으로서 확대 트리거가 하나 더 생긴다. 셋째, 스크롤 범위를 일정하게 유지하는 기존 스페이서의 역할을 그대로 이어받는다. 슬롯 높이는 바꾸지 않는다. 다른 대안은 검토 후 버렸다. 슬롯을 접는 방식은 136px 페이지에서 되먹임과 깜빡임을 되살리고, 슬롯에 스트립 뷰를 띄우는 방식은 같은 믹스를 두 표현으로 동시에 보여줘 혼란스럽다. 스트립 뷰로 최소화할 때는 슬롯의 모양도 따라간다. 이때 인라인 도크는 약 52px 높이의 가로 막대이므로, 슬롯은 원이 아니라 같은 크기의 막대 윤곽이 된다. 이 경우에도 슬롯 높이는 떠나기 직전 도크의 높이로 고정한다.

## 던지면 가장자리로: 속도 투영과 임계 감쇠 스프링

질문 (2)의 핵심은 WWDC18의 한 문장이다. Apple은 드래그 중 위치만 보고 가장 가까운 모서리를 고르면 PiP를 "화면 절반 넘게" 끌어야 해서 실패한다고 했다. 대신 놓는 순간의 속도와 감속률로 "가상의 투영 위치"를 만들고, 그 위치에서 가장 가까운 모서리로 보낸다([WWDC18](https://developer.apple.com/videos/play/wwdc2018/803/)). 오픈소스 재현 코드의 투영식은 `(v/1000)·r/(1−r)`이고 r = 0.998이다. **약 0.5초 × 속도**에 해당하므로 1000px/s의 가벼운 플릭이 약 500px을 투영해 폰 화면 폭을 건너간다. 같은 재현 코드는 감쇠비 1.0, response 0.4초 스프링에 놓을 때의 속도를 초기 속도로 넘긴다([fluid-interfaces Pip.swift](https://github.com/nathangitter/fluid-interfaces/blob/master/FluidInterfaces/FluidInterfaces/Pip.swift)). Android PiP는 더 빠르게 정착한다. 마찰 1.9로 투영하면 약 0.125초 × 속도이고, 투영 위치가 중점을 넘는지로 좌우를 고른다([AOSP PhysicsAnimator](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android14-release/libs/WindowManager/Shell/src/com/android/wm/shell/animation/PhysicsAnimator.kt)). 스프링은 강성 700의 무반동 스프링(response 약 0.24초)이다([AOSP PipMotionHelper](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android14-release/libs/WindowManager/Shell/src/com/android/wm/shell/pip/phone/PipMotionHelper.java)). 화면 가장자리에 숨기기도 Android 코드에 수치로 남아 있다. 수평 속도가 18000px/s(물리 픽셀)를 넘거나 창 폭의 절반 이상이 화면 밖으로 나간 채 놓이면 숨긴다. 숨긴 창은 탭 한 번으로 즉시 꺼낸다([AOSP PipTouchHandler](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android14-release/libs/WindowManager/Shell/src/com/android/wm/shell/pip/phone/PipTouchHandler.java); [Android PiP 디자인 가이드](https://developer.android.com/design/ui/mobile/guides/home-screen/picture-in-picture)).

사용자는 "자유롭게 움직이는 창"을 요청했으므로, 스냅은 그 요청을 바꾸는 **명시적 변경**이다. 그래서 iOS식 네 모서리가 아니라 **Android식 좌우 가장자리 스냅**을 권한다. 가로는 투영으로 왼쪽·오른쪽 끝을 고르고, 세로는 사용자가 놓은 곳(약한 관성 + 경계 클램프)을 존중한다. 그러면 세로 배치의 자유는 그대로 남고 "던지면 붙는" 물리감만 더해진다. 허용 영역의 위쪽 경계는 뷰포트 상단이 아니라 **sticky 팔레트 띠 아래**여야 한다. 지금 CSS 기본값 `top: calc(196px + safe-area)`가 그 경계 역할을 하고, 칩을 미니 필드로 끌어오는 동선이 이 띠에 의존한다. 아래쪽은 safe area와 홈 인디케이터 영역에서 띄운다. 속도는 최근 약 100ms의 `pointermove` 샘플로 구한다. 마지막 샘플이 60–80ms 이상 오래됐으면(멈췄다가 뗀 경우) 0으로 보고, 크기는 4000–8000px/s로 자른다. 이 세 값은 출처 있는 상수가 아니라 추정치이므로 기기에서 조정한다. 지금 핸들은 누르는 즉시 드래그를 시작하는데, 약 6px의 슬롭을 넣으면 탭과 더블탭을 쓸 수 있게 된다. 참고로 @use-gesture의 탭 판정은 3px([@use-gesture options](https://use-gesture.netlify.app/docs/options/))이고, Framer Motion의 방향 잠금은 10px([framer-motion drag controls](https://unpkg.com/framer-motion@12.7.3/dist/es/gestures/drag/VisualElementDragControls.mjs))이다. 스프링이 도는 중에 다시 잡으면 즉시 멈추고 현재 화면 위치에서 드래그를 이어 가야 한다.

크기 조절은 사용자 요청대로 연속 그립을 유지한다. 다만 Android 14 설정에서는 모서리 드래그 리사이즈가 기본으로 꺼져 있다는 점을 기억해야 한다([AOSP Shell config.xml](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android14-release/libs/WindowManager/Shell/res/values/config.xml)). 이동하려다 실수로 키우는 문제 때문이라는 설명은 검색 요약 수준의 보도에만 있다([9to5Google](https://9to5google.com/2021/06/09/android-12-picture-in-picture-drag/)). sleep-orbit의 그립은 이동 핸들과 분리돼 있어 위험이 작지만, 지금 32×32px인 히트 영역은 44px로 넓힌다. WCAG 2.5.8의 최소 24px은 이미 충족하고, 44px은 2.5.5(AAA) 수준이다([W3C 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)). 가장자리 스냅을 넣으면 리사이즈도 **붙은 가장자리 반대쪽으로** 커져야 한다. 지금은 left/top을 고정하고 오른쪽·아래로 커지므로, 오른쪽에 붙은 창은 화면 밖으로 밀려나며 `maxW` 클램프에 걸린다. WCAG 2.5.7은 드래그 동작마다 드래그 없는 대안을 요구한다([W3C 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)). 가장 싼 해법은 Android처럼 핸들 더블탭으로 크기 프리셋을 순환하고, 포커스된 핸들에서 화살표 키로 반대쪽 가장자리로 보내는 것이다. 프리셋 스냅(짧은 변의 약 30/45/60%)은 추정치 기반의 선택 사항이다. 스냅과 스프링은 `prefers-reduced-motion`에서 오버슈트 없이 즉시 또는 짧은 페이드로 처리한다([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)).

```ts
// 놓을 때: 투영으로 좌/우 결정, 세로는 자유 + 약한 관성. 수치는 기기에서 조정할 추정치.
const project = (v: number, r = 0.998) => (v / 1000) * r / (1 - r) // Apple 투영 ≈ 0.5s × v (px/s)
function release(p: { x: number; y: number; w: number; h: number }, v: { vx: number; vy: number }, b: Bounds) {
  const cx = p.x + p.w / 2 + project(v.vx)
  const x = cx < (b.left + b.right) / 2 ? b.left : b.right - p.w
  const y = clamp(p.y + project(v.vy) * 0.4, b.top, b.bottom - p.h) // b.top = 팔레트 띠 아래
  springTo({ x, y }, v) // 감쇠비 1, ω = 2π/0.35s, 해석해 x(t)=T+(x0+(v0+ωx0)t)e^(−ωt)로 프레임 독립
}
```

## 웹 구현: 진행값 하나로 도는 손수 짠 FLIP이 모든 타깃을 덮는다

질문 (4)의 후보 기법은 지원 범위와 이 위젯의 특수성으로 걸러진다. 이 위젯은 rAF 루프가 오브를 매 프레임 움직이고 공간 오디오까지 구동하는 **살아 있는 컴포넌트**다. 같은 문서 내 View Transitions는 Chrome 111, Safari/iOS 18.0, Firefox 144부터 지원되므로 **iOS 15–17 WKWebView에서는 돌지 않는다**([caniuse: View Transitions](https://caniuse.com/view-transitions)). 이전 상태는 "정적 이미지 스냅샷"으로 찍히고 오버레이가 "모든 페이지 콘텐츠 위에" 놓인다([MDN: Using the View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using)). 그래서 전환 중에 오브가 얼어붙고 터치가 막힐 가능성이 크다. 다만 포인터 차단 범위는 MDN과 Chrome 블로그의 서술이 엇갈리므로 기기에서 확인이 필요하다([Chrome for Developers](https://developer.chrome.com/blog/view-transitions-in-2025)). React의 `<ViewTransition>`은 19.3에서 안정화됐다([React 19.3](https://react.dev/blog/2026/09/09/react-19-3)). 이 프로젝트에 설치된 React는 19.2.7이다. `^19.2.7` 범위가 19.3을 허용하므로 업데이트만 하면 쓸 수 있지만, 지금 상태로는 사용할 수 없다. CSS scroll-driven animations는 Chrome 115, Safari/iOS 26.0, Firefox 159(2026-10-27)에서 지원된다([caniuse: animation-timeline](https://caniuse.com/mdn-css_properties_animation-timeline_scroll); [WebKit: Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/); [MDN Firefox 159](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/159)). **iOS 15–18에서는 쓸 수 없다.** 검색 요약에 따르면 Chrome 가이드는 폴리필을 폴백으로 쓰지 말라고 권하지만, 원문은 직접 확인하지 못했다([Chrome scrollytelling 가이드](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/scrollytelling)). 더 근본적인 한계도 있다. CSS 타임라인은 JS로 실측한 목적지(사용자가 옮긴 창 위치)를 표현하지 못한다. Motion의 layout 애니메이션은 `domMax` 번들로 약 +38kb, 전체 컴포넌트로 약 43kb가 들고 내부적으로 transform을 쓴다([motion.dev](https://motion.dev/docs/react-reduce-bundle-size)). 그래서 아래의 이중 스케일 문제를 그대로 안고 온다.

| 기법 | iOS 15–17 | iOS 18.x | iOS 26+ | Android WebView | 오브 라이브 유지 | 판정 |
|---|---|---|---|---|---|---|
| rAF 진행값 모프(손수 짠 FLIP 변형) | 예 | 예 | 예 | 예 | 예 | **주 경로** |
| WAAPI transform FLIP + scale | 예 | 예 | 예 | 예 | 예(오브 수학 수정 필요) | 대안 |
| View Transitions | 아니오(즉시 폴백) | 예 | 예 | Chromium 111+ (추론) | 이전 스냅샷 정지 | 비권장 |
| CSS scroll-driven animations | 아니오 | 아니오 | 예 | Chromium 115+ (추론) | 예 | 지금은 불필요 |
| Motion `layout`/`layoutId` | 예 | 예 | 예 | 예 | 이중 스케일 | +~43kb, 비권장 |

Android WebView 열은 caniuse에 별도 행이 없어, Chromium 버전과 Play 스토어를 통한 WebView 업데이트(minSdk 24)를 근거로 **추론**한 값이다. WAAPI(`element.animate`)가 iOS 15에서 돈다는 것도 이번 노트에서 재검증하지 않은 배경지식이다. 다행히 권장 경로는 WAAPI 없이 rAF만 쓴다.

FLIP 자체는 First(시작 사각형)–Last(끝 사각형)–Invert–Play로 레이아웃 변경을 transform으로 바꾸는 기법이다([Paul Lewis: FLIP](https://aerotwist.com/blog/flip-your-animations/)). 그러나 교과서적 FLIP을 이 앱에 그대로 적용하면 두 군데서 깨진다. 첫째는 **이중 스케일**이다. `getBoundingClientRect()`는 transform이 적용된 렌더링 크기를, `offsetWidth`는 레이아웃 크기를 돌려준다([MDN: Determining dimensions](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Object_Model/Determining_the_dimensions_of_elements)). 그래서 필드에 `scale(s)`를 걸면 오브 루프(`OrbitField.tsx:88`, `Orb.tsx:100`)가 반지름을 r·s로 계산하고, 스케일된 부모 안에서 r·s²에 그려진다. `mixer.css`가 미니 크기를 transform이 아니라 실제 width로 바꾸는 이유가 주석에 바로 이 문제로 적혀 있다. 둘째는 **움직이는 목적지**다. 스크롤로 복귀할 때도, 버튼 확대가 맨 위로 부드럽게 스크롤할 때도, 돌아갈 슬롯은 애니메이션 도중 계속 움직인다. 시작할 때 한 번 잰 Last로 키프레임을 고정하면 마지막 프레임에 어긋난다. 그렇다고 흐름 안에서 width를 애니메이션하면 매 프레임 아래 콘텐츠가 밀리고 스크롤 범위가 바뀐다.

두 문제를 함께 푸는 방법은 다음과 같다. 전환하는 동안 도크를 항상 `position: fixed`로 두고(슬롯이 흐름을 지킨다), 진행값 `m`을 0→1 또는 1→0으로 시간에 따라 움직인다. 그리고 **매 프레임 슬롯의 현재 뷰포트 사각형과 창의 목표 사각형을 새로 읽어 보간**한다. 위치는 `translate3d`, 크기는 필드의 실제 `width`로 정한다. 작은 고정 요소의 레이아웃만 다시 계산되므로 비용이 작고, 오브 루프는 지금처럼 매 프레임 렌더링 폭을 읽으니 **오브 위치 계산을 바꿀 필요가 없다**. 오브와 헤드 크기, 창 패딩, 핸들, 배경 같은 미니 전용 스타일은 지금처럼 클래스로 단번에 바꾸지 말고 `calc(인라인값 + (미니값 − 인라인값) · var(--m))`로 같은 진행값에 묶는다. 그러면 첫 프레임에 오브가 툭 작아지는 현상이 사라진다. 방향이 바뀌면 현재 `m`에서 다시 출발하므로 경로는 자동으로 대칭이고 중단할 수 있다. 같은 진행값을 나중에 스크롤로 구동하면 그대로 연속 축소가 된다. 스크롤로 슬롯을 따라가는 복귀 구간에서는 비동기 스크롤 때문에 약 한 프레임 지연이 생길 수 있다. 하지만 300ms 동안만이고 끝나면 흐름 안으로 들어가므로 실사용에서 문제될 가능성은 낮다. 이것도 기기에서 확인할 항목이다.

```ts
// FieldDock.tsx 스케치 — m: 0=인라인, 1=미니. 매 프레임 실측한 두 사각형 사이를 보간한다.
const ease = (t: number) => 1 - (1 - t) ** 3 // ease-out cubic. Material 표준 곡선이 필요하면 bezier 솔버로 교체
function runMorph(to: 0 | 1) {
  cancelAnimationFrame(morphRaf.current)
  const from = m.current                                        // 역전 시 현재 값에서 출발
  const dur = (to ? 250 : 300) * Math.abs(to - from)
  const t0 = performance.now()
  dock.classList.add('is-morphing')                             // fixed + left/top 0 + 블러 끔
  const step = (now: number) => {
    const t = dur ? Math.min((now - t0) / dur, 1) : 1
    const k = (m.current = from + (to - from) * ease(t))
    const a = slotFieldRect(), b = miniFieldRect()               // a는 스크롤 중이면 움직이는 목표
    dock.style.setProperty('--m', String(k))                      // 크롬·오브 크기·슬롯 불투명도
    dock.style.transform = `translate3d(${lerp(a.x, b.x, k) - padX(k)}px, ${lerp(a.y, b.y, k) - padY(k)}px, 0)`
    field.style.width = `${lerp(a.w, b.w, k)}px`
    if (t < 1) morphRaf.current = requestAnimationFrame(step)
    else commit(to) // 인라인 복귀(스페이서 제거, 같은 높이라 점프 없음) 또는 is-mini 확정, 인라인 스타일 정리
  }
  morphRaf.current = requestAnimationFrame(step)
}
```

스트립 뷰에서는 필드가 `display: none`이므로 `field.style.width` 보간이 아무 효과도 없다. 스트립 상태의 최소화와 확대는 같은 루프에서 필드 대신 **도크 상자 자체**(위치 + 폭)를 슬롯 막대와 미니 알약 사이로 보간한다. 다시 말해 `slotFieldRect`/`miniFieldRect`를 뷰에 따라 필드 사각형이나 도크 사각형으로 바꾸기만 하면 된다. 보간 대상만 바뀌는 셈이다. 또 하나 빠뜨리면 안 되는 부분이 있다. 지금 `measureSlot()`은 미니가 아닐 때 스크롤마다 도크의 `getBoundingClientRect()`로 슬롯 위치를 다시 잰다. 모프 중에는 도크가 fixed + translate 상태이고, 버튼 확대의 부드러운 스크롤이 스크롤 이벤트를 계속 일으킨다. 그래서 `slot.top/h`가 오염되고 임계값이 흔들린다. **슬롯 기하는 스페이서(도크 슬롯) 요소에서 읽고, 모프 중에는 재측정을 멈춰야 한다.**

이 방식에는 지켜야 할 함정이 세 가지 더 있다. MDN은 `transform`, `filter`, `backdrop-filter`, `will-change`, `contain`을 가진 조상이 `fixed` 자손의 containing block이 된다고 경고한다([MDN: Containing block](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Display/Containing_block)). 따라서 도크의 조상에는 이런 속성을 절대 걸지 않는다. 지금 `backdrop-filter`가 걸린 `.mixer-top`은 형제라서 괜찮다. React 포털로 미니 창을 `body`에 옮기는 흔한 해법은 **쓰면 안 된다.** 트리 위치가 바뀌면 `OrbitField`가 다시 마운트되고, 그 rAF 루프가 구동하던 공간 오디오와 `liveAngles` 상태가 끊긴다. 지금처럼 같은 DOM 노드에서 클래스만 바꾸는 구조를 유지해야 한다. `backdrop-filter: blur(12px)`는 움직이는 동안 매 프레임 뒤를 다시 샘플링하므로 저사양 GPU에서 가장 비싼 항목이다. 노트의 근거는 Gecko·Flutter 버그 보고라서 Chromium WebView 실측은 아니다([Bugzilla 1732817](https://bugzilla.mozilla.org/show_bug.cgi?id=1732817)). 그래도 `is-morphing` 동안 블러를 끄고 반투명 단색으로 대신하는 비용은 한 줄이다. web.dev의 원칙("opacity와 transform으로 제한하라")에서 벗어나는 것은 작은 고정 요소의 width 하나뿐이다([web.dev animations guide](https://web.dev/articles/animations-guide)).

## sleep-orbit 권장 설계와 단계별 구현 계획

최종 설계는 다음과 같다. 스크롤 트리거와 임계값, 히스테리시스, 엣지 트리거는 지금 그대로 둔다. 전환은 rAF 진행값 모프로 바꾼다. 미니로 갈 때는 250ms 동안 필드가 슬롯에서 창 위치(사용자가 마지막으로 둔 곳)로 날아가며 줄어든다. 동시에 창 테두리·핸들·배경이 나타나고, 슬롯에는 윤곽이 떠오른다. 돌아올 때는 같은 경로를 300ms 동안 거꾸로 밟아, 스크롤과 함께 움직이는 슬롯 안으로 내려앉는다. 최소화 버튼, 슬롯 탭, 확대 버튼은 모두 같은 모프를 탄다. 스트립 뷰 상태의 최소화와 확대도 1단계에서 같은 루프를 타되, 필드 대신 도크 상자를 보간하고 슬롯은 막대 모양으로 남긴다. 별도 설계가 필요한 것은 같은 모드 안에서 궤도↔스트립을 바꾸는 토글뿐이다. 이 토글에서는 도크 단위에서 상자 크기를 보간하고, 내용은 Material의 "fade through"로 교차시킨다. 기본값은 300ms이고, 관계가 강하지 않은 요소 사이의 전환에 쓰는 패턴이다([Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)). 미니 상태의 스트립 창은 음악 앱의 미니 바에 해당하므로, 나중에 이 형태에만 상·하단 띠 스냅을 주는 것도 고려할 만하다. `prefers-reduced-motion`에서는 모프를 건너뛰고 즉시 전환하거나 150ms 불투명도 교차만 한다. 오브 루프는 이미 이 설정을 존중하므로 일관된다.

| 단계 | 범위 | 파일 | 완료 기준(검증) |
|---|---|---|---|
| 1. 전환 자체 (불만의 핵심 해소) | rAF 진행값 모프(궤도 뷰는 필드, 스트립 뷰는 도크 상자 보간), `--m` 기반 크롬·오브 크기 보간, 도크 슬롯 버튼(궤도는 원, 스트립은 막대), 중간 역전, 제스처 중 전환 지연, reduced-motion, 모프 중 블러 끔. `measureSlot()`은 슬롯 요소에서 읽고 모프 중에는 멈춤. 미니 기본 위치를 CSS `right` 대신 JS left/top으로 정규화 | `FieldDock.tsx`, `mixer.css` | Playwright로 전환 중 매 프레임 필드(또는 도크) 사각형을 샘플링해 프레임 간 위치 급변이 없는지 확인(두 뷰 모두). 68px/41px 경계와 버튼 확대 중 스크롤에서 깜빡임 없음. iOS 15 시뮬레이터와 저사양 Android 실기기에서 60fps에 가까운지 확인 |
| 2. 창 물리 | 6px 슬롭, 100ms 속도 샘플링, Apple식 투영 + 좌우 가장자리 스냅(세로 자유), 임계 감쇠 스프링, 다시 잡으면 중단, 팔레트 띠 아래로 허용 영역, 가장자리 기준 리사이즈, 그립 44px, 핸들 더블탭 크기 순환, 화살표 키 | `FieldDock.tsx` (스프링·투영은 순수 함수로 분리해 단위 테스트) | 투영·스냅 선택 함수 단위 테스트(정지 후 놓기 = 가까운 쪽, 플릭 = 반대쪽). 회전·`visualViewport` 변화 후 창이 화면 안에 있음 |
| 3. 선택 사항 | 가장자리 숨기기(24px 이상 탭 노출, 탭으로 복귀, 오디오 계속), 스트립 컨테이너 트랜스폼, 크기 프리셋 스냅, 페이지가 약 300px 이상 스크롤되면 `m`을 스크롤로 구동하는 연속 모드 + 스크롤 종료 시 스냅 | 동일 | 숨김 상태에서 공간 오디오가 끊기지 않음 |

1단계만으로도 지적된 부자연스러움, 즉 순간이동과 의미 없는 구멍이 해소된다. 2단계부터는 사용자가 요청한 "자유 이동"을 가장자리 스냅으로 **바꾸는** 결정이 들어가므로, 앱 소유자가 동의한 뒤에 진행한다. 투영 계수, 세로 관성 계수, 속도 상한, 히스테리시스 폭, 프리셋 비율은 모두 출처 있는 상수가 아니라 추정치다. 코드에 조정 가능한 상수로 두고 실기기에서 맞춘다.

## Conclusion

이 조사에서 가장 쓸모 있는 결론은 "연속이 이산보다 낫다"는 일반론이 아니다. 지금의 부자연스러움은 **두 UI 계열을 섞은 데서 온 것으로 보인다**는 해석(추론이다), 그리고 136px짜리 짧은 페이지라는 조건이 해법의 등급을 결정한다는 점이다. 따라서 고쳐야 할 것은 트리거가 아니라 **경로와 빈 자리**다. 트리거는 이미 히스테리시스와 엣지 판정까지 잘 갖춰져 있다. 경로는 슬롯과 창을 잇는 대칭 모프로, 빈 자리는 돌아갈 곳을 보여주는 도크 슬롯으로 해결된다.

구현 측면의 함의는 하나다. 지금 코드가 이중 스케일을 피하려고 transform 대신 실제 width를 택한 결정은 옳았고, 전환에서도 그 결정을 지키면 된다. 매 프레임 실측 사각형을 보간하는 진행값 하나가 움직이는 목적지, 중단과 역전, reduced-motion, 오브 루프와의 공존을 함께 해결한다. 그리고 그 진행값을 시간 대신 스크롤로 구동하는 순간 Material식 연속 축소로 넘어갈 수 있다. 새로운 브라우저 API는 iOS 최소 버전이 26으로 오를 때 다시 검토해도 늦지 않다.
