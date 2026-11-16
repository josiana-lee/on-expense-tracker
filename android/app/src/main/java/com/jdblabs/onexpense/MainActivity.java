package com.jdblabs.onexpense;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 앱 안에 직접 둔 플러그인은 브리지가 만들어지기 전(super.onCreate 앞)에 등록해야 한다.
        registerPlugin(PlayReviewPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
