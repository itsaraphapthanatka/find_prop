# HOB บนมือถือ (Capacitor)

เว็บกับแอปใช้โค้ดชุดเดียวกัน — Capacitor ห่อหน้าเว็บ (dist/) ลงแอป native
เฟส 1 = Android เท่านั้น (iOS รอเฟสถัดไป ต้องใช้ Xcode + Apple Developer $99/ปี)

## วิธีได้ไฟล์ APK (ไม่ต้องลงอะไรในเครื่อง)

1. commit + push ไป `main` ตามปกติ
2. เปิด GitHub → แท็บ **Actions** → เลือก run ล่าสุดของ "Android APK"
3. ส่วน **Artifacts** ท้ายหน้า → ดาวน์โหลด `hob-debug-apk`
4. ส่งไฟล์เข้ามือถือ Android แล้วแตะติดตั้ง (ครั้งแรกต้องอนุญาต
   "ติดตั้งแอปจากแหล่งที่ไม่รู้จัก" — ปกติของ APK ที่ไม่ได้มาจาก Play Store)

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
- **อัปเดตแอป = ติดตั้ง APK รอบใหม่** — deploy เว็บไม่ส่งผลถึงแอปที่ลงไปแล้ว

## แผนเฟสถัดไป

- เฟส 2: กล้องถ่ายรูปทรัพย์, ปลั๊กอิน Geolocation, Push แจ้งเตือนแผนเยี่ยมชม (FCM),
  live-update (เช่น Capgo) ให้แอปตามเว็บโดยไม่ต้องลง APK ใหม่
- เฟส 3: Google Play ($25 ครั้งเดียว) → App Store ($99/ปี — ต้องผ่านเกณฑ์ 4.2
  คือมีฟีเจอร์ native จากเฟส 2 ก่อน)

## ทางเลือก: build ในเครื่อง (ยังไม่จำเป็น)

ติดตั้ง Android Studio → เปิดโฟลเดอร์ `android/` (หรือ `npx cap open android`)
→ Run บน emulator/เครื่องจริง — เครื่องนี้ยังไม่มี Android SDK จึงใช้เส้นทาง CI แทน
