---
name: feedback-review-style
description: 코드 리뷰 요청 시 사용자가 원하는 방식 — 수정 없이 심각도 분류 보고, 주장에는 실측 근거
metadata:
  type: feedback
---

리뷰를 요청하면 코드를 고치지 말고 심각도(CRITICAL/HIGH/MEDIUM/LOW/GOOD) 분류로만 보고한다.
"리뷰만 해줘"라고 명시하면 파일을 단 한 줄도 수정하지 않는다.

**Why:** 사용자가 직접 판단하고 고치는 쪽을 선호한다. 출시 직전 시점에 에이전트가 임의로
건드리면 검증 범위가 다시 벌어진다.

**How to apply:**
- 레이아웃/폰트 크기 같은 주장은 "넘칠 수 있다" 수준으로 두지 말고 실제 폰트 메트릭이나
  패딩 계산으로 수치를 제시한다. (fontTools로 woff2 advance를 재는 식의 검증을 환영했다)
- `pnpm typecheck` / `pnpm test` / `pnpm build`가 통과한다는 사실과, 변경된 코드에 실제
  테스트가 있는지는 구분해서 말한다. 확인 안 한 건 확인했다고 쓰지 않는다.
- GOOD 항목도 반드시 넣는다 — 유지할 판단이 뭔지 알고 싶어 한다.

관련: [[user-profile]]
