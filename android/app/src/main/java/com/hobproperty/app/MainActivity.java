package com.hobproperty.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // ปลั๊กอิน local ต้องลงทะเบียนก่อน super.onCreate เสมอ
        registerPlugin(WebPrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
