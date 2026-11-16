package com.jdblabs.onexpense;

import androidx.appcompat.app.AppCompatActivity;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * 구글 Play의 앱 안 리뷰 창을 띄운다. 언제 띄울지는 웹 쪽(src/db/reviewPrompt.ts)이 정하고, 여기는 띄우기만 한다.
 *
 * - 사용자가 별점을 줬는지, 창이 실제로 떴는지는 알 수 없다. 구글이 일부러 알려주지 않는다. 그래서 흐름이 끝나면
 *   결과와 상관없이 resolve한다.
 * - 버튼으로 부르지 않는다. 구글이 짧은 기간에 여러 번 부르면 창을 안 띄우므로, 눌러도 아무 일 없는 버튼이 될 수
 *   있다. 설정의 평가 줄은 스토어 페이지를 연다.
 * - 창 앞뒤로 앱이 아무것도 묻지 않는다("마음에 드세요?", "별 5개?" 금지 — 구글 지침).
 */
@CapacitorPlugin(name = "PlayReview")
public class PlayReviewPlugin extends Plugin {

    @PluginMethod
    public void requestReview(PluginCall call) {
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager
            .requestReviewFlow()
            .addOnCompleteListener(request -> {
                if (!request.isSuccessful()) {
                    // Play 스토어가 없거나 Play에서 받지 않은 앱. 사용자에게 알릴 일이 아니다.
                    call.reject("review flow unavailable");
                    return;
                }
                AppCompatActivity activity = getActivity();
                // 요청을 주고받는 사이 사용자가 앱을 나갔으면 띄우지 않는다. 다른 앱 위로 튀어나오거나, 백그라운드
                // 시작 제한에 막혀 이 호출이 끝나지 않는다.
                if (activity == null || !activity.getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)) {
                    call.reject("app not in foreground");
                    return;
                }
                // 리스너는 메인 스레드에서 돈다. 여기서 던지면 잡을 곳이 없어 앱이 꺼진다 — 저장 직후에.
                try {
                    ReviewInfo info = request.getResult();
                    manager.launchReviewFlow(activity, info).addOnCompleteListener(flow -> call.resolve());
                } catch (Exception e) {
                    call.reject("review flow failed", e);
                }
            });
    }
}
