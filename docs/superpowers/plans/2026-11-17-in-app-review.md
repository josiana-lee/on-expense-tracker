# 앱 안 Play 리뷰 요청 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 처음 쓴 날부터 7일이 지난 사용자가 새 기록을 추가하면 구글 Play 리뷰 창을 딱 한 번 띄우고, 설정 › 정보에 스토어로 가는 줄을 둔다.

**Architecture:** 안드로이드 쪽에 Play 리뷰 라이브러리를 부르는 작은 Capacitor 플러그인(`PlayReview`)을 직접 둔다. 웹 쪽은 "물을지" 판단(순수 함수 + Dexie 조회 + `localStorage` 표시)을 `src/db/reviewPrompt.ts` 한 곳에 모으고, 입력 탭과 달력 시트의 **새 기록 저장** 분기에서만 부른다.

**Tech Stack:** React 19 + TS, Dexie 4, Vitest 4(jsdom + fake-indexeddb), Capacitor 8, Java, `com.google.android.play:review:2.0.2`

**Spec:** `docs/superpowers/specs/2026-11-17-in-app-review-design.md`

## Global Constraints

- 기다리는 기간: 처음 쓴 날부터 **7일** (`7 * 24 * 60 * 60 * 1000` ms).
- "처음 쓴 날" = `importId`가 없는 지출 중 가장 이른 `createdAt`.
- 한 번 부르면 끝. 표시는 `localStorage`에 둔다(Dexie에 두지 않는다 — 백업에 실리지 않게, `src/db/fxRates.ts`와 같은 이유).
- 리뷰 창 앞뒤로 앱 문구 없음. 실패해도 사용자에게 알리지 않고 저장 흐름을 바꾸지 않는다.
- 리뷰 창을 여는 버튼은 만들지 않는다. 설정 줄은 스토어 페이지를 연다.
- 웹(`isNative === false`)에서는 리뷰 창도 설정 줄도 없다.
- 커밋은 경로를 지정해서. `docs/promo/`, `.claude/agent-memory/`는 커밋하지 않는다. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **저장을 빠르게 두 번** — 대기 중에 두 번째 저장이 오면 리뷰 창을 두 번 부르면 안 된다. → Task 2 테스트 `동시에 두 번 불러도 한 번만 띄운다`.
2. **Play 스토어가 없거나 직접 설치한 앱** — 플러그인이 실패해도 저장은 정상, 표시는 남아 다시 시도하지 않는다. → Task 2 테스트 `띄우기가 실패해도 표시는 남는다`.
3. **`localStorage`를 못 쓰는 환경** — 읽기·쓰기가 던져도 저장이 깨지면 안 되고, 묻지 않는 쪽으로 기운다. → Task 2 테스트 `localStorage가 던지면 묻지 않는다`.
4. **가져오기만 한 사람** — 3천 건을 가져왔어도 직접 적은 기록이 없으면 묻지 않는다. → Task 2 테스트 `가져온 기록만 있으면 묻지 않는다`.
5. **백업에서 복원한 오래된 기록** — 원래 `createdAt`이 7일 전이면 바로 대상이다. → Task 2 테스트 `오래전에 만든 기록이 있으면 묻는다`.

---

### Task 1: Play 리뷰 네이티브 플러그인과 JS 연결

**Files:**
- Modify: `android/app/build.gradle` (dependencies 블록)
- Create: `android/app/src/main/java/com/jdblabs/onexpense/PlayReviewPlugin.java`
- Modify: `android/app/src/main/java/com/jdblabs/onexpense/MainActivity.java`
- Create: `src/lib/playReview.ts`

**Interfaces:**
- Produces: `requestPlayReview(): Promise<void>` (`src/lib/playReview.ts`) — 네이티브 플러그인 `PlayReview.requestReview()`를 부른다. 리뷰 흐름이 끝나면 resolve, 요청 단계에서 실패하면 reject. 웹에서는 부르지 않는다(부르는 쪽이 `isNative`로 거른다).

- [ ] **Step 1: 의존성 추가** — `android/app/build.gradle` dependencies에 `implementation 'com.google.android.play:review:2.0.2'`.

- [ ] **Step 2: `PlayReviewPlugin.java` 작성** — `@CapacitorPlugin(name = "PlayReview")`, `@PluginMethod public void requestReview(PluginCall call)`.
  `ReviewManagerFactory.create(getContext()).requestReviewFlow()` → 성공이면 `launchReviewFlow(getActivity(), reviewInfo)`의 완료 리스너에서 `call.resolve()`(결과와 상관없이 — API가 리뷰 여부를 알려주지 않는다), 요청 실패면 `call.reject("review flow unavailable")`. 클래스 주석에 "평가 여부는 알 수 없다 · 버튼으로 부르지 않는다"를 한국어로 남긴다.

- [ ] **Step 3: `MainActivity`에 등록** — `onCreate(Bundle)`을 오버라이드해서 `registerPlugin(PlayReviewPlugin.class);`를 `super.onCreate(savedInstanceState);` **앞에** 둔다.

- [ ] **Step 4: `src/lib/playReview.ts` 작성** — `registerPlugin<{ requestReview(): Promise<void> }>('PlayReview')`로 만든 객체를 감싼 `requestPlayReview()`.

- [ ] **Step 5: 빌드 확인**

Run: `pnpm typecheck && pnpm android:apk`
Expected: 타입 오류 없음, `BUILD SUCCESSFUL`.

- [ ] **Step 6: Commit**

```bash
git add android/app/build.gradle android/app/src/main/java/com/jdblabs/onexpense/PlayReviewPlugin.java android/app/src/main/java/com/jdblabs/onexpense/MainActivity.java src/lib/playReview.ts
git commit -m "Add a native bridge to the Play in-app review flow"
```

---

### Task 2: 물을지 판단하고 새 기록 저장 뒤에 부르기

**Files:**
- Create: `src/db/reviewPrompt.ts`
- Test: `src/db/reviewPrompt.test.ts`
- Modify: `src/screens/input/InputScreen.tsx` (save의 성공 경로, `flash(...)` 직후)
- Modify: `src/components/EntrySheet.tsx` (맨 아래 두 분기 — 새 할부 `onDone(\`${months}개월 할부로 저장했어!\`)`, 새 지출 `onDone(\`${won(amount)}원 저장했어!\`)` — 에서만)

**Interfaces:**
- Consumes: `requestPlayReview()` (Task 1), `isNative` (`src/lib/platform.ts`), `db` (`src/db/db.ts`)
- Produces:
  - `REVIEW_WAIT_MS = 604_800_000`, `REVIEW_ASKED_KEY = 'onexpense.reviewAsked'`, `REVIEW_DELAY_MS = 800`
  - `shouldAskForReview(firstOwnAt: number | null, now: number): boolean`
  - `firstOwnRecordAt(): Promise<number | null>` — `importId` 없는 지출의 최소 `createdAt`. `db.expenses.each`로 훑는다(배열로 모으지 않는다).
  - `maybeAskForReview(opts?: { now?: number; native?: boolean; launch?: () => Promise<void> }): Promise<boolean>` — 띄웠으면 `true`. 기본값은 `Date.now()`, `isNative`, `requestPlayReview`.
  - `askForReviewSoon(): void` — `REVIEW_DELAY_MS` 뒤에 `maybeAskForReview()`를 부르고 결과·오류를 버린다. 화면은 이것만 부른다.
  - `resetReviewPromptForTest(): void` — 진행 중 표시를 지운다.

`maybeAskForReview` 순서(경합 때문에 정해 둔다): 네이티브 아님 → `false` / 진행 중이거나 표시가 있으면 → `false` / 진행 중 표시를 **await 전에** 켠다 / `firstOwnRecordAt()` → `shouldAskForReview`가 거짓이면 진행 중 표시를 끄고 `false` / `localStorage`에 표시(`String(now)`)를 쓴다 / `launch()`를 기다리되 실패는 삼킨다 / `true`. `localStorage` 읽기·쓰기는 try/catch로 감싸고, 읽기가 던지면 "이미 물었다"로 본다.

- [ ] **Step 1: 실패하는 테스트 작성** — `beforeEach`에서 `localStorage.clear()`와 `resetReviewPromptForTest()`. 기록은 `addExpense({ amount: 1000, categoryId: 'c', paymentMethodId: 'p' })`로 넣고, 과거로 돌릴 땐 `db.expenses.update(id, { createdAt: ... })`. `launch`는 `vi.fn(() => Promise.resolve())`, 시각은 `const T = Date.now()`.

```ts
describe('shouldAskForReview', () => {
  it('기록이 없으면 묻지 않는다', () => expect(shouldAskForReview(null, T)).toBe(false));
  it('7일이 안 됐으면 묻지 않는다', () => expect(shouldAskForReview(T, T + REVIEW_WAIT_MS - 1)).toBe(false));
  it('딱 7일이면 묻는다', () => expect(shouldAskForReview(T, T + REVIEW_WAIT_MS)).toBe(true));
});

describe('maybeAskForReview', () => {
  it('처음 쓴 지 7일이 지났으면 한 번 띄우고 표시를 남긴다');
  // addExpense 1건 → maybeAskForReview({ now: T + REVIEW_WAIT_MS, native: true, launch }) === true,
  // launch 1회, localStorage.getItem(REVIEW_ASKED_KEY) !== null
  it('한 번 띄운 뒤에는 다시 띄우지 않는다');            // 두 번째 호출 false, launch 총 1회
  it('웹에서는 띄우지 않는다');                          // native: false → false, launch 0회, 표시 없음
  it('7일이 안 됐으면 띄우지 않고 표시도 안 남긴다');      // now: T + 1000 → false, 표시 null
  it('가져온 기록만 있으면 묻지 않는다');                  // addExpense({ ..., importId: 'imp-1' }) 3건, now 한참 뒤 → false
  it('가져온 기록은 처음 쓴 날 계산에서 빠진다');          // importId 기록 createdAt을 8일 전으로, 직접 기록은 지금 → firstOwnRecordAt()이 직접 기록의 createdAt
  it('오래전에 만든 기록이 있으면 묻는다');                // 직접 기록 createdAt을 T - REVIEW_WAIT_MS로, now: T → true
  it('동시에 두 번 불러도 한 번만 띄운다');                // Promise.all([maybe(...), maybe(...)]) → [true, false] 순서 무관 하나만 true, launch 1회
  it('띄우기가 실패해도 표시는 남는다');                    // launch = () => Promise.reject(new Error('x')) → true(던지지 않음), 표시 남음, 다음 호출 false
  it('localStorage가 던지면 묻지 않는다');                // vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error() }) → false, launch 0회
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/db/reviewPrompt.test.ts`
Expected: FAIL — `./reviewPrompt` 모듈을 찾지 못함.

- [ ] **Step 3: `src/db/reviewPrompt.ts` 구현** — 위 Interfaces와 순서대로. 파일 머리 주석에 왜 7일·한 번·`localStorage`인지와 "구글은 평가 여부를 알려주지 않는다"를 한국어로.

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/db/reviewPrompt.test.ts`
Expected: PASS, 13개.

- [ ] **Step 5: 화면에 연결** — `InputScreen`의 save 성공 경로(`flash(...)` 다음 줄)와 `EntrySheet`의 맨 아래 두 분기(새 할부·새 지출, `onDone` 다음 줄)에서 `askForReviewSoon()`. 고치기·할부 다시 나누기·일시불로 바꾸기 분기에는 넣지 않는다.

- [ ] **Step 6: 전체 확인**

Run: `pnpm typecheck && pnpm test`
Expected: 오류 없음, 기존 테스트 포함 전부 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/db/reviewPrompt.ts src/db/reviewPrompt.test.ts src/screens/input/InputScreen.tsx src/components/EntrySheet.tsx
git commit -m "Ask for a Play review once, a week after first use"
```

---

### Task 3: 설정 › 정보에 "Play 스토어에서 평가하기"

**Files:**
- Modify: `src/data/appInfo.ts` (`supportEmail` 아래)
- Modify: `src/screens/settings/SettingsScreen.tsx` (정보 카드, "문의하기" 줄 바로 아래)

**Interfaces:**
- Produces: `APP_INFO.playStoreUrl = 'https://play.google.com/store/apps/details?id=com.jdblabs.onexpense'`

- [ ] **Step 1: `APP_INFO.playStoreUrl` 추가** — 주석: 설정의 평가 줄이 여는 주소, 리뷰 창을 여는 버튼은 두지 않는다(구글 지침).

- [ ] **Step 2: 줄 추가** — `isNative && APP_INFO.playStoreUrl`일 때만. 개인정보처리방침 줄과 같은 모양(`<a className={\`${styles.row} ${styles.rowLink}\`} href=... target="_blank" rel="noopener noreferrer">` + `rowLabel` "Play 스토어에서 평가하기" + chevron). `rowValue`는 두지 않는다.

- [ ] **Step 3: 확인**

Run: `pnpm typecheck && pnpm test`
Expected: 오류 없음, 전부 PASS.
웹 미리보기(`pnpm dev`)의 설정 › 정보에는 줄이 **없어야** 한다(웹이므로).

- [ ] **Step 4: Commit**

```bash
git add src/data/appInfo.ts src/screens/settings/SettingsScreen.tsx
git commit -m "Link to the Play Store listing from settings"
```

---

### Task 4: 에뮬레이터에서 네이티브 확인

**Files:** 없음 (확인만)

- [ ] **Step 1: 디버그 APK를 에뮬레이터에 설치** — AVD `Pixel_3a_API_34_extension_level_7_arm64-v8a`. **사용자 폰에는 설치하지 않는다**(Play 설치본과 서명이 달라 지우고 깔아야 하고, 그러면 가계부 데이터가 사라진다).

Run: `pnpm android:apk` 후 `adb -e install -r android/app/build/outputs/apk/debug/app-debug.apk`
Expected: `Success`.

- [ ] **Step 2: 확인할 것**
  - 기록 추가가 평소대로 저장되고 토스트가 뜬다(리뷰 플러그인이 실패해도 앱이 멈추지 않는다 — 에뮬레이터에 Play 스토어가 없으면 여기서 실패하는 게 정상).
  - 설정 › 정보에 "Play 스토어에서 평가하기"가 보이고, 누르면 스토어(또는 브라우저)로 나간다.
  - `adb logcat`에 `PlayReview` 관련 크래시가 없다.

리뷰 창이 실제로 뜨는지는 Play에서 받은 앱에서만 확인할 수 있다 → v26 내부 테스트에서 본다(이 계획 밖: 번들·출시 노트·버전 올리기).
