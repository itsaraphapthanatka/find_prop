package com.hobproperty.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// พิมพ์หน้าเว็บที่แสดงอยู่ผ่านระบบพิมพ์ของ Android (เลือกเครื่องพิมพ์หรือเซฟเป็น PDF ได้)
// จำเป็นเพราะ window.print() ใน Android WebView เป็น no-op — ฝั่งเว็บเรียกผ่าน
// printPage() ใน src/lib/native.ts ซึ่ง fallback มาที่ปลั๊กอินนี้เมื่ออยู่ในแอป
@CapacitorPlugin(name = "WebPrint")
public class WebPrintPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            PrintDocumentAdapter adapter = getBridge().getWebView().createPrintDocumentAdapter("HOB");
            printManager.print("HOB เอกสารเปรียบเทียบ", adapter, new PrintAttributes.Builder().build());
            call.resolve();
        });
    }
}
