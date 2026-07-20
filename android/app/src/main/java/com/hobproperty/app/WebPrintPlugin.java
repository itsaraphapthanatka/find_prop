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
            // ค่าเริ่มต้น A4 แนวนอน (ตารางเปรียบเทียบกว้าง) — ผู้ใช้เปลี่ยนเองใน dialog ได้
            PrintAttributes attrs = new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4.asLandscape())
                    .build();
            printManager.print("HOB เอกสารเปรียบเทียบ", adapter, attrs);
            call.resolve();
        });
    }
}
