# HOB บนมือถือ (Capacitor)

เว็บกับแอปใช้โค้ดชุดเดียวกัน — Capacitor ห่อหน้าเว็บ (dist/) ลงแอป native
รองรับทั้ง **Android** (`android/`) และ **iOS** (`ios/`) จากโค้ดเบสเดียว

## ติดตั้งแอปครั้งแรก (ลงมือเองครั้งเดียว)

เปิดลิงก์นี้จากมือถือ Android แล้วแตะติดตั้ง — ชี้ APK ตัวล่าสุดเสมอ ส่งต่อให้ทีมได้เลย:

**https://github.com/itsaraphapthanatka/find_prop/releases/download/app-latest/hob.apk**

(ครั้งแรกต้องอนุญาต "ติดตั้งจากแหล่งที่ไม่รู้จัก" — ปกติของแอปนอก Play Store)

## การอัปเดตหลังจากนั้น = ไม่ต้องต่อคอมอีก

- **แก้ส่วนเว็บ** (หน้า/สไตล์/logic) → push → แอปโหลดเองผ่าน live-update (เปิดแอป 2 ครั้ง)
- **แตะส่วน native** (เพิ่มปลั๊กอิน, แก้ android/) → บั๊ม `versionCode` + `versionName` ใน
  `android/app/build.gradle` → push → **แอปทุกเครื่องเด้งแถบ "เวอร์ชันใหม่พร้อมติดตั้ง"**
  แตะดาวน์โหลดแล้วติดตั้งทับได้ทันที (ลายเซ็นตรงกันเสมอเพราะใช้กุญแจกลาง
  `android/app/debug.keystore` จาก repo — **ห้ามลบ/สร้างใหม่** ไม่งั้นติดตั้งทับกันไม่ได้)
- ทางสำรอง: GitHub → Actions → run ล่าสุด → Artifacts → `hob-debug-apk`

CI ไม่ใช้ secret ใดๆ: ค่า public ของ Supabase (URL + anon key ซึ่งออกแบบให้อยู่ใน
bundle ได้ ด่านความปลอดภัยจริงคือ RLS) ถูกดึงจาก bundle ของเว็บ prod โดยตรง
จึงตรงกับเว็บเสมอ — ดู `.github/workflows/android-apk.yml`

## ไฟล์/โฟลเดอร์ที่เกี่ยวข้อง

| ที่ | คืออะไร |
|---|---|
| `capacitor.config.ts` | `appId: com.hobproperty.app` — **ถาวรหลังขึ้น store** เปลี่ยนก่อนเผยแพร่เท่านั้น |
| `android/` | โปรเจกต์ native (commit ทั้งโฟลเดอร์ — ไฟล์ generated ถูก ignore ให้แล้ว) |
| `resources/logo.png` | ต้นฉบับไอคอน — แก้แล้วรัน `npx @capacitor/assets generate --android --assetPath resources --iconBackgroundColor '#7132f5' --splashBackgroundColor '#7132f5'` |
| `.env.local` | ค่า build ในเครื่อง (มี `VITE_API_BASE` ชี้เว็บ prod) — **ห้าม commit** |

## สิ่งที่ต่างจากเว็บ (โดยตั้งใจ)

- **service worker ปิดในแอป** (`src/main.tsx`) — กันปัญหาแคชค้าง/จอขาวหลังอัปเดต
  ผลคือเฟสนี้แอปยังไม่มี offline cache (เว็บ/PWA ยังมีตามเดิม)
- **ปุ่มพูดซ่อนอัตโนมัติ** — WebView ไม่มี Web Speech API (VoiceButton เช็คให้เอง)
- **เรียก AI ข้ามโดเมน** — แอปรันจาก `https://localhost` จึงเรียก API ผ่าน
  `VITE_API_BASE` และ `api/ai.js` เปิด CORS ให้เฉพาะ origin ของแอป
- **แอปตามเว็บอัตโนมัติ (live-update)** — ตอนเปิดแอปจะเช็ค `/app-update.json` บนเว็บ prod
  ถ้าเว็บเป็นโค้ดคนละ commit กับที่รันอยู่ จะโหลดมารอแล้วสลับใช้ตอนเปิดแอปครั้งถัดไป
  (ฝั่งแอป `src/lib/appUpdate.ts` / ฝั่ง build `scripts/update-zip.mjs`)
  — **ข้อยกเว้น**: push ที่แตะโฟลเดอร์ `android/` หรือเพิ่มปลั๊กอิน ต้องติดตั้ง APK รอบใหม่
  — **kill switch**: เอา `app-update.json` ออกจากเว็บ = แอปทุกเครื่องหยุดอัปเดตทันที
  — bundle ใหม่ที่พังจนเปิดไม่ขึ้น ปลั๊กอินย้อนกลับเวอร์ชันเดิมให้เอง

## ฟีเจอร์ native (เฟส 2)

- **ถ่ายรูปทรัพย์ด้วยกล้อง** — ปุ่ม "ถ่ายรูปด้วยกล้อง" ใต้ช่องรูปในฟอร์ม (โผล่เฉพาะในแอป)
  ย่อรูปเหลือกว้าง 1600px ฝั่งเครื่องก่อนอัปโหลดเข้า bucket เดิม (`src/lib/native.ts`)
- **ตำแหน่งแบบ native** — ปุ่มตำแหน่งฉันในแผนที่ใช้ปลั๊กอิน Geolocation
  ขอสิทธิ์ระบบให้เองและแม่นกว่า WebView
- **พิมพ์เอกสารเปรียบเทียบ / บันทึกเป็น PDF** — ปุ่มพิมพ์ในหน้าเปรียบเทียบเรียก
  ระบบพิมพ์ของ Android ผ่านปลั๊กอิน local `WebPrintPlugin.java`
  (window.print() ใช้ใน WebView ไม่ได้ — ฝั่งเว็บเรียกผ่าน `printPage()` ใน src/lib/native.ts)

## Push แจ้งเตือนแผนเยี่ยมชม (ติดตั้งแล้ว — v1.3)

ทุกเช้า 07:00 น. ระบบยิงแจ้งเตือน "พรุ่งนี้มีแผนเยี่ยมชม" ให้สมาชิกองค์กรที่มีแผนวันพรุ่งนี้
(แตะแจ้งเตือน → เปิดหน้าแผนเยี่ยมชม) — ชิ้นส่วน: แอปเก็บ FCM token ลงตาราง
`device_tokens` หลังล็อกอิน (`src/lib/push.ts` + `supabase/push.sql`) แล้ว Vercel Cron
เรียก `api/push-cron.js` เป็นคนส่งผ่าน Firebase

ตั้งค่าฝั่งเซิร์ฟเวอร์ (ครั้งเดียว) — Vercel → Settings → Environment Variables:

| ตัวแปร | เอามาจาก |
|---|---|
| `FCM_SERVICE_ACCOUNT` | Firebase → ⚙️ Project settings → Service accounts → **Generate new private key** → คัดลอกเนื้อไฟล์ .json ทั้งก้อน |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` (secret) |
| `CRON_SECRET` | สตริงสุ่มยาวๆ ตั้งเอง (Vercel แนบให้ cron อัตโนมัติ) |

ทดสอบยิงทันที (หลังตั้ง env + มีเครื่องล็อกอิน+อนุญาตแจ้งเตือนแล้ว):

```
curl "https://hob-alpha.vercel.app/api/push-cron?test=1" -H "Authorization: Bearer <CRON_SECRET>"
```

## iOS (โปรเจกต์ `ios/`)

รันบน **iOS Simulator** ได้แล้ว (พิสูจน์: หน้า login ขึ้นครบ) — build/รันเองในเครื่อง:

```
npm run build && npx cap sync ios
npx cap open ios          # เปิด Xcode → เลือก simulator → กด ▶
# หรือสั่งตรง:
xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO build
```

พร้อมแล้วบน iOS: ปุ่มพิมพ์/บันทึก PDF (Swift `WebPrintPlugin` ใน `AppDelegate.swift`,
แนวนอน), กล้อง, GPS, live-update ส่วนเว็บ, สิทธิ์กล้อง/ตำแหน่งใน `Info.plist`

### ⚠️ ข้อจำกัด iOS ที่ต่างจาก Android แบบสำคัญ

- **ลงเครื่องจริง / TestFlight / App Store ต้องมี Apple Developer Program ($99/ปี)** —
  ต่างจาก Android ที่แจกไฟล์ .apk ให้ติดตั้งตรงได้ **iOS ไม่มีการ sideload**
  ดังนั้น**ระบบดาวน์โหลด APK ในแอป + GitHub Releases ใช้กับ iOS ไม่ได้**
  (โค้ดกันไว้แล้ว — แถบ "ดาวน์โหลด APK" เด้งเฉพาะ Android)
- **แต่ live-update ส่วนเว็บยังทำงานบน iOS** — แก้หน้า/สไตล์/logic แล้ว push
  แอป iOS ก็ตามเว็บเองเหมือน Android (ไม่ต้องผ่าน review) ที่ต้องผ่าน App Store
  คือเฉพาะการเปลี่ยนโค้ด native เท่านั้น
- **Push บน iOS ยังไม่ทำงาน** จนกว่าจะมี Apple Developer account แล้ว: สร้าง APNs Auth Key
  → อัปขึ้น Firebase (Cloud Messaging → Apple app config) → เปิด capability
  Push Notifications ใน Xcode (โค้ดฝั่ง JS/ปลั๊กอินพร้อมแล้ว)

## แผนเฟส 3 — ขึ้น Store

- Google Play ($25 ครั้งเดียว) → App Store ($99/ปี — ควรมี push ก่อนยื่น
  กันโดนปัดตกเกณฑ์ 4.2 "เว็บห่อเฉยๆ")
- iOS ขึ้น store ต้อง build แบบเซ็น (Apple Developer) ผ่าน Xcode → Archive →
  Distribute หรือตั้ง CI แบบ macOS runner + fastlane (ทำเมื่อมีบัญชี Apple แล้ว)

## ทางเลือก: build ในเครื่อง (ยังไม่จำเป็น)

ติดตั้ง Android Studio → เปิดโฟลเดอร์ `android/` (หรือ `npx cap open android`)
→ Run บน emulator/เครื่องจริง — เครื่องนี้ยังไม่มี Android SDK จึงใช้เส้นทาง CI แทน
