import { isNative } from '../lib/platform';
import { requestPlayReview } from '../lib/playReview';
import { db } from './db';

/* 앱 안에서 구글 Play 리뷰 창을 언제 띄울지 — 처음 쓴 날부터 7일이 지난 뒤 새 기록을 추가했을 때, 딱 한 번.
 *
 * - 한 번뿐인 이유: 사용자가 별점을 줬는지 구글이 알려주지 않는다. "평가한 사람만 다시 안 나오게"는 할 수 없어서,
 *   한 번 부르면 평가했든 닫았든 다시 부르지 않는다.
 * - 7일인 이유: 충분히 써 본 사람에게 묻는다. "처음 쓴 날"은 직접 적은 기록(importId 없음) 중 가장 이른
 *   createdAt이다. 다른 가계부에서 3천 건을 가져온 날 바로 묻지 않는다. 백업에서 복원한 기록은 원래 createdAt을
 *   들고 오므로 오래 쓴 사람으로 본다.
 * - 표시를 localStorage에 두는 이유: Dexie에 두면 백업에 실려 다른 폰으로 옮겨진다. 지워져도 한 번 더 묻는 게
 *   전부라 잃을 것이 없다(db/fxRates.ts와 같은 판단).
 *
 * 창 앞뒤로 앱은 아무것도 묻지 않는다("마음에 드세요?", "별 5개?" 금지 — 구글 지침). 실패해도 사용자에게 알리지
 * 않는다. */

export const REVIEW_WAIT_MS = 7 * 24 * 60 * 60 * 1000;
export const REVIEW_ASKED_KEY = 'onexpense.reviewAsked';
/** 저장 직후 "저장했어!" 토스트가 먼저 보이도록 잠깐 기다린다. */
export const REVIEW_DELAY_MS = 800;

export function shouldAskForReview(firstOwnAt: number | null, now: number): boolean {
  return firstOwnAt !== null && now - firstOwnAt >= REVIEW_WAIT_MS;
}

/** 직접 적은 지출 중 가장 이른 createdAt. 없으면 null. 기록이 많을 수 있어 배열로 모으지 않고 훑는다. */
export async function firstOwnRecordAt(): Promise<number | null> {
  let first: number | null = null;
  await db.expenses.each((r) => {
    if (r.importId === undefined && (first === null || r.createdAt < first)) first = r.createdAt;
  });
  return first;
}

/** 이미 물었는가. 읽을 수 없으면 물은 것으로 본다 — 모르면 묻지 않는 쪽이 매번 묻는 것보다 낫다. */
function alreadyAsked(): boolean {
  try {
    return globalThis.localStorage?.getItem(REVIEW_ASKED_KEY) != null;
  } catch {
    return true;
  }
}

function markAsked(now: number): void {
  try {
    globalThis.localStorage?.setItem(REVIEW_ASKED_KEY, String(now));
  } catch {
    /* 못 남기면 다음 기록 때 한 번 더 부를 뿐이다. 구글도 짧은 기간에 여러 번 부르면 창을 안 띄운다. */
  }
}

/** 판단부터 띄우기까지 진행 중인가. 저장을 빠르게 두 번 하면 두 호출이 겹치는데, 첫 await 전에 켜서 막는다. */
let inFlight = false;

/** 조건이 맞으면 리뷰 창을 띄우고 true. 띄우기가 실패해도 던지지 않는다. */
export async function maybeAskForReview(opts?: {
  now?: number;
  native?: boolean;
  launch?: () => Promise<void>;
}): Promise<boolean> {
  const { now = Date.now(), native = isNative, launch = requestPlayReview } = opts ?? {};
  if (!native || inFlight || alreadyAsked()) return false;
  inFlight = true;
  try {
    if (!shouldAskForReview(await firstOwnRecordAt(), now)) return false;
    markAsked(now);
    await launch().catch(() => {});
    return true;
  } finally {
    inFlight = false;
  }
}

/** 새 기록을 저장한 화면이 부른다. 저장 흐름을 막지 않도록 기다리지 않고, 결과와 오류는 버린다. */
export function askForReviewSoon(): void {
  setTimeout(() => {
    maybeAskForReview().catch(() => {});
  }, REVIEW_DELAY_MS);
}

export function resetReviewPromptForTest(): void {
  inFlight = false;
}
