---
name: project-perf-constraints
description: 온:On 성능 제안을 판단할 때 쓰는 기준 — WebView 하한선, 의존성 12개 유지, gzip이 아니라 raw 파싱 시간이 척도
metadata:
  type: project
---

온:On 성능 관련 제안은 다음 세 가지를 통과해야 한다.

1. **구형 Android WebView(≈100)가 하한선이다.** `dvh`(Chrome 108+)와 `color-mix()`(111+)가
   없는 실기기에서 화면이 깨진 전례가 있어 폴백이 들어가 있다. 최신 API 전제 제안은 쓸 수 없다.
2. **런타임 의존성 12개를 장점으로 본다.** 라이브러리 추가는 그만한 값어치를 수치로 보여야 한다.
   가상화·디바운스 같은 건 브라우저/React 기본으로 먼저 푼다.
3. **gzip 번들 크기는 이 앱에서 의미 없는 숫자다.** Capacitor로 APK 안에 파일이 들어가므로
   네트워크가 없다. 판단 기준은 raw JS의 파싱·컴파일·실행 시간뿐이다.

**Why:** 1번과 2번은 사용자가 직접 세운 제약이고, 3번은 2026-08-16 리뷰에서 측정으로 확인했다
(504KB raw의 ScriptDuration이 6x CPU throttle에서 163ms).

**How to apply:** 번들 관련 제안을 할 때 "gzip 몇 KB 줄어든다"로 논증하지 말고 시작 시간
밀리초로 논증한다. 절대값이 3초 예산 대비 몇 %인지까지 붙인다.

관련: [[feedback-review-style]], [[user-profile]]
