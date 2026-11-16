import { registerPlugin } from '@capacitor/core';

/** 안드로이드 쪽 PlayReviewPlugin(android/app/src/main/java/com/jdblabs/onexpense). */
const PlayReview = registerPlugin<{ requestReview(): Promise<void> }>('PlayReview');

/** 구글 Play 리뷰 창을 띄운다. 흐름이 끝나면 resolve하고(별점을 줬는지는 알 수 없다), Play 스토어가 없는 등
 *  요청 단계에서 실패하면 reject한다. 웹에서는 부르지 않는다 — 언제 부를지는 db/reviewPrompt.ts가 정한다. */
export function requestPlayReview(): Promise<void> {
  return PlayReview.requestReview();
}
