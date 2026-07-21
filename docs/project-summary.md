# HUP — สรุปโครงการ

> เดิมชื่อ "Find Prop" แล้วเปลี่ยนเป็น "FinProp" แล้วเปลี่ยนอีกครั้งเป็นชื่อสุดท้าย **"HUP"**
> (package.json `name: "hob"`, `appId: com.hobproperty.app`)

Web + mobile app ทดแทนแอป AppSheet "WUT Demo" ทั้งหมด — ระบบจัดการทรัพย์ให้เช่า/ขาย
สำหรับทีมนายหน้า/เอเจนซี่ (โกดัง โรงงาน โชว์รูม ออฟฟิศ ครัวกลาง) พื้นที่กรุงเทพฯ/สมุทรปราการ
ตอนนี้ขายเป็น SaaS หลายองค์กร (multi-tenant) ไม่ใช่แค่แอปภายในทีมเดียวแล้ว

> โครงสร้างข้อมูลต้นแบบจากแอป AppSheet เดิม: [appsheet-analysis.md](appsheet-analysis.md)
> สรุปฟีเจอร์ทั้งระบบแบบละเอียด (ปรับปรุงล่าสุด 18 ก.ค. 2026): [FEATURES.md](FEATURES.md)
> คู่มือแอปมือถือ/Android (Capacitor): [MOBILE.md](MOBILE.md)

## Stack

- **Frontend:** React 18 + TypeScript + Vite, `react-router-dom` (HashRouter)
- **Backend:** Supabase (PostgreSQL + Auth + Storage + RLS + RPC functions)
- **แผนที่:** Leaflet / react-leaflet (OpenStreetMap tiles)
- **AI:** LLM self-hosted (vLLM, `gemma-4-12b`, GPU ของทีมเอง) — เรียกผ่าน serverless proxy
  `api/ai.js` บน Vercel เท่านั้น ไม่มี client SDK ฝั่งหน้าเว็บ
- **Import:** SheetJS (`xlsx`, pinned จาก CDN tarball ของ SheetJS ไม่ใช่ npm registry)
- **PWA:** vite-plugin-pwa (Workbox runtime caching, offline-capable, ติดตั้งเป็นแอปได้)
- **Mobile:** Capacitor (Android) — เว็บกับแอปใช้โค้ดชุดเดียวกัน, live-update ผ่าน
  `@capgo/capacitor-updater`, build/แจก APK ผ่าน GitHub Actions (ไม่ต้องมี Android Studio)
- **Deploy:** Vercel (web + `/api/ai` serverless function)

## ฟีเจอร์ที่ทำเสร็จแล้ว

### 1. รายการทรัพย์ + ฟอร์ม (แกนหลัก)
- ค้นหา/กรองทุกฟิลด์ (ประเภททรัพย์, เช่า/ขาย, จังหวัด, ช่วงราคา), responsive
  (การ์ดบนมือถือ, ตารางบนจอใหญ่), deep-link ตัวกรองจาก Dashboard
- ฟอร์มเพิ่ม/แก้ไข ครบ ~50 ฟิลด์, dropdown "เลือกหรือพิมพ์เพิ่ม" + multi-select,
  อัปโหลดรูปหลายรูปขึ้น Supabase Storage, ปักพิกัดจากแผนที่ในฟอร์มได้โดยตรง

### 2. บันทึกทรัพย์ด้วยเสียง + AI กรอกฟอร์ม
- พูดเล่ารายละเอียดทรัพย์ → AI (`aiExtractProperty()` ใน `src/lib/ai.ts`) แกะเป็นฟิลด์
  กรอกฟอร์มอัตโนมัติ, เข้าใจตัวเลขพูดเป็นคำไทย ("แปดหมื่นห้า" → 85000)
- ถอดเสียงด้วย Web Speech API ในเบราว์เซอร์ (`VoiceButton` + `useSpeech` hook) —
  ซ่อนปุ่มอัตโนมัติถ้าเบราว์เซอร์/WebView ไม่รองรับ (เช่นในแอป Capacitor)

### 3. แผนที่ (MapPage)
- **หมุดตามประเภททรัพย์**: สี + ไอคอนต่างกันตามประเภท (`PIN_STYLE` — โรงงาน/โชว์รูม/โกดัง/
  ออฟฟิศ/ครัวกลาง), ประเภทอื่นใช้สี fallback
- **Legend chips**: แสดงจำนวนแต่ละประเภท กดเพื่อกรองหมุดบนแผนที่ (กดซ้ำเพื่อล้างตัวกรอง)
- **ตำแหน่งปัจจุบัน**: ปุ่ม locate ใช้ Geolocation (native บนแอป, browser บนเว็บ) แสดงจุดสีน้ำเงิน
  + วงความแม่นยำ
- โหมด "ปักหมุด" คลิกวางแล้วไปหน้าฟอร์มพร้อมพิกัดทันที (คงจากรอบก่อน)

### 4. แผนเยี่ยมชม (Visit Plans) — ใหม่
- สร้างแผนต่อลูกค้า เลือกทรัพย์เป็นจุดแวะ จัดลำดับได้ (`src/pages/PlansPage.tsx`)
- เปิดเส้นทางทั้งหมดใน Google Maps คลิกเดียว (ไม่ระบุ origin — ใช้ตำแหน่งปัจจุบันของเครื่องเริ่มนำทาง)
- **AI จับคู่ requirement ใหม่**: ลูกค้าเปลี่ยนความต้องการ → AI สแกนทรัพย์ทั้งระบบ
  แนะนำตัวที่ตรง + ชี้จุดแวะเดิมที่ไม่ตรงแล้ว, รองรับพิมพ์/พูด requirement

### 5. ชอร์ตลิสต์เปรียบเทียบ (ComparePage) — ใหม่
- เลือกทรัพย์ 2–4 รายการเทียบสเปกเป็นตาราง, AI เขียนบทวิเคราะห์จุดเด่น/ข้อควรพิจารณา/คำแนะนำ
- พิมพ์/บันทึก PDF หัวกระดาษ HUP ส่งลูกค้าได้ทันที

### 6. นำเข้าข้อมูล Excel/CSV (ImportPage) — ใหม่
- อัปโหลด .xlsx/.xls/.csv → จับคู่คอลัมน์อัตโนมัติ (แก้เองได้) → นำเข้า
- รองรับวันที่ พ.ศ./รูปแบบ Excel/เลขมีคอมมา, ตรวจรหัสทรัพย์ซ้ำ (ข้าม/อัปเดตทับ),
  มีเทมเพลต CSV ให้ดาวน์โหลด, lazy-load เพื่อไม่ให้ SheetJS โหลดในทุกหน้า
- ล็อกกิจกรรมการนำเข้าอัตโนมัติ (จำนวน insert/update/skip/fail)

### 7. Dashboard สรุปภาพรวม (DashboardPage) — ใหม่
- ตัวเลขพอร์ต (มูลค่าเช่า/ขายรวม, ทรัพย์ใหม่เดือนนี้ + sparkline 6 เดือน), นัดเยี่ยมชมใกล้ถึง
- สัดส่วนประเภททรัพย์/เช่า-ขาย (กราฟแท่งมือเขียนเอง ไม่ใช้ chart library),
  ทำเลยอดนิยม, ค่าเช่าเฉลี่ยต่อ ตร.ม. ต่อประเภท + ชี้ทรัพย์ถูก/แพงกว่าค่าเฉลี่ย
- สุขภาพข้อมูล (ขาดรูป/พิกัด/ราคา/เบอร์โทร/ข้อมูลค้างเก่า >90 วัน)
- **AI วิเคราะห์พอร์ตรายวัน** (แคช 1 ครั้ง/วันต่อองค์กร)

### 8. ผู้ช่วย AI แชทลอยทุกหน้า (Assistant) — ใหม่
- ปุ่มลอย "✨" เปิดแชท ถามข้อมูลทรัพย์/แผนเยี่ยมชมจากข้อมูลจริงเท่านั้น (ไม่มโน)
- **สั่งงานผ่านแชท** (ต้องกดยืนยันก่อนทำจริงเสมอ): เพิ่ม/ถอดทรัพย์จากรูท, สร้างแผนเยี่ยมชม,
  เปิดหน้าเปรียบเทียบ — validate action กับ ID จริงก่อนรัน (`sanitizeAction()`)
- พูดถามด้วยไมค์ + โหมดอ่านคำตอบออกเสียง, จำบทสนทนาไว้ในเครื่อง (localStorage)
- **Relevance filtering** (`src/lib/relevance.ts`): คัดเฉพาะทรัพย์ที่เกี่ยวข้องกับคำถามก่อนส่งให้ AI
  (scoring ตามประเภท/ทำเล/โซน/รหัสทรัพย์) — ตอบไวขึ้น รองรับผู้ใช้พร้อมกันได้มากขึ้น

### 9. Design System ("Kraken") + PWA + Responsive
- สีหลัก purple `#7132f5`, ฟอนต์ IBM Plex Sans Thai, ปุ่ม radius 12px (คงจากรอบก่อน)
- ติดตั้งเป็นแอปได้ (manifest + icons + service worker), offline บางส่วน, bottom nav บนมือถือ

### 10. ระบบทีม/องค์กร/สิทธิ์ (คงจากรอบก่อน + เพิ่มเติม)
- Login (Supabase Auth), อนุมัติสมาชิก, role admin/member
- Multi-tenant ด้วย RLS, สร้างองค์กรเอง, เชิญสมาชิกจากหน้า "ทีม"
- Super admin: เห็นทุกองค์กร, ตั้งแพ็กเกจ/วันหมดอายุ/ระงับใช้งาน
- **Org filter dropdown** ทุกหน้า (รายการ/แผนที่/Dashboard/แผนเยี่ยมชม/Super Admin) —
  โหมดภาพรวมสำหรับ super admin กรองดูทีละองค์กรได้
- **Organization impersonation ("สวมสิทธิ์องค์กร") — ใหม่**: super admin คลิกชื่อองค์กรใน
  Super Admin page → ทำงานเสมือนสมาชิกองค์กรนั้นจริง (เพิ่ม/แก้/นำเข้าข้อมูลแทนลูกค้าได้) —
  กลไกอยู่ฝั่ง Postgres (`profiles.impersonate_org_id` + RPC `super_impersonate`,
  `current_org()` ถูกนิยามใหม่ให้คืนค่า org ที่สวมสิทธิ์อยู่) — มีแถบเตือนสีเหลือง +
  ปุ่ม "ออกจากสิทธิ์" ตลอดเวลาที่สวมสิทธิ์อยู่
- **Super เขียนข้อมูลแทนได้แม้ไม่สวมสิทธิ์** (`supabase/super-write.sql`) — ต้องเลือก org_id
  ที่ฟอร์มก่อนบันทึกเสมอ
- **ประวัติการใช้งาน / Activity Logs (LogsPage) — ใหม่**: บันทึกอัตโนมัติทุก
  create/update/delete ทรัพย์, แผนเยี่ยมชม, นำเข้าไฟล์, การใช้ AI — เฉพาะแอดมิน/super
  ดูได้ (RLS), เป็น audit trail ถาวร (ไม่มี policy แก้/ลบย้อนหลัง)
- ข้อมูลตัวอย่างสำหรับทดสอบ/เดโม: องค์กร "Demo Estate" + ทรัพย์ตัวอย่าง 10 รายการ
  (`supabase/demo-org.sql`)

### 11. Landing Page ขายแพลตฟอร์ม — ใหม่
- ผู้เยี่ยมชมทั่วไป (ยังไม่ล็อกอิน, เข้าทางเว็บ) เห็นหน้าขาย HUP เป็น SaaS:
  ฟีเจอร์เด่น 6 ด้าน, จุดแข็ง (ย้ายข้อมูลไว/RLS/PWA), แพ็กเกจ Free/Pro/Enterprise
  (ไม่โชว์ราคา — ติดต่อทีมขาย), ขั้นตอนเริ่มใช้ 3 ขั้น, ช่องทางติดต่อ
- ผู้ใช้ที่ล็อกอินค้างอยู่/เปิดจากแอปที่ติดตั้งแล้ว ข้ามหน้านี้ไปแอปโดยตรง
- ค่าติดต่อ (เบอร์/LINE/อีเมล) เป็น placeholder ที่ยังไม่ใส่ค่าจริง
  (`CONTACT` const ใน `src/pages/LandingPage.tsx`, มี TODO กำกับ)

### 12. แอปมือถือ Android (Capacitor) — ใหม่
- เว็บกับแอป native ใช้โค้ดชุดเดียวกัน, `appId: com.hobproperty.app`
- **Build ผ่าน GitHub Actions** (`.github/workflows/android-apk.yml`) — ไม่ต้องมี Android Studio
  ในเครื่อง: push ขึ้น `main` → ไป GitHub Actions ดาวน์โหลด artifact `hob-debug-apk`
- **Live-update**: เปิดแอปแล้วเช็คโค้ดเว็บใหม่กว่าที่รันอยู่ไหม (`app-update.json`) → โหลดมารอ
  ใช้รอบเปิดถัดไป, กัน downgrade, มี kill-switch, auto-rollback ถ้า bundle ใหม่พัง —
  **ข้อยกเว้น**: เปลี่ยนแปลงใน `android/` หรือเพิ่ม native plugin ต้องออก APK ใหม่เสมอ
- ฟีเจอร์ native เฉพาะแอป: ถ่ายรูปด้วยกล้อง (ย่อ 1600px ก่อนอัปโหลด), ตำแหน่งปัจจุบันแบบ native
- ตั้งใจให้ต่างจากเว็บ: ปิด service worker ในแอป (กันจอขาวหลังอัปเดต), ปุ่มพูดซ่อนอัตโนมัติ
  (ไม่มี Web Speech API ใน WebView), เรียก AI ข้ามโดเมนผ่าน `VITE_API_BASE` + CORS
- **ยังไม่ได้ทำ**: Push notification (รอผู้ใช้ตั้งค่า Firebase project ~10 นาที),
  ขึ้น store จริง (เฟส 3 — Google Play $25 ครั้งเดียว / App Store $99/ปี), iOS (เฟสถัดไป)

## โครงสร้างฐานข้อมูล (ลำดับการรัน SQL — `supabase/`)

1. `schema.sql` — ตาราง `properties` (~50 คอลัมน์) + storage bucket + seed
2. `auth.sql` — ตาราง `profiles`, RLS, trigger สร้างโปรไฟล์อัตโนมัติ
3. `org.sql` — ตาราง `organizations`, ผูก org_id, RPC `create_organization`/`adopt_member`
4. `super.sql` — `is_super`/`plan`/`sub_status`/`sub_expires_at`, `org_ok()`, trigger กันแก้เอง
5. `plans.sql` — ตาราง `visit_plans` (จุดแวะแบบ jsonb), trigger auto-update `updated_at`
6. `impersonate.sql` — `profiles.impersonate_org_id`, `super_impersonate()` RPC,
   นิยาม `current_org()`/`super_overview()` ใหม่ให้รองรับการสวมสิทธิ์
7. `super-write.sql` — super เขียนข้อมูลแทนองค์กรอื่นได้โดยไม่ต้องสวมสิทธิ์ (ต้องระบุ org_id)
8. `logs.sql` — ตาราง `activity_logs` (audit trail, append-only, RLS จำกัดเฉพาะแอดมิน/super อ่าน)
9. `demo-org.sql` — องค์กร "Demo Estate" + ทรัพย์ตัวอย่าง 10 รายการสำหรับทดสอบ/เดโม

## โครงสร้างโค้ด (ที่เพิ่ม/เปลี่ยนจากรอบก่อน)

```
src/
  pages/DashboardPage.tsx   Dashboard สรุปภาพรวม + AI insight
  pages/PlansPage.tsx       แผนเยี่ยมชม + AI จับคู่ requirement
  pages/ComparePage.tsx     ชอร์ตลิสต์เปรียบเทียบ + AI วิเคราะห์ + PDF
  pages/ImportPage.tsx      นำเข้า Excel/CSV (lazy-loaded)
  pages/LogsPage.tsx        ประวัติการใช้งาน (แอดมิน/super เท่านั้น)
  pages/LandingPage.tsx     หน้าขายแพลตฟอร์มสำหรับผู้เยี่ยมชมที่ยังไม่ล็อกอิน
  components/Assistant.tsx  ผู้ช่วย AI แชทลอย (ทุกหน้ายกเว้นฟอร์ม)
  components/VoiceButton.tsx + hooks/useSpeech.ts   ปุ่ม/hook ถอดเสียง Web Speech API
  hooks/useOrgFilter.tsx     dropdown กรององค์กรสำหรับโหมดภาพรวม super admin
  lib/ai.ts                  เรียก /api/ai (chat, extract-from-voice)
  lib/relevance.ts           คัดทรัพย์ที่เกี่ยวข้องก่อนส่งให้ AI
  lib/activityLog.ts         helper บันทึก activity log
  lib/importProps.ts         auto-map คอลัมน์ Excel/CSV + สร้างเทมเพลต
  lib/native.ts              เช็ค native/PWA + กล้อง/ตำแหน่งแบบ native (Capacitor)
  lib/appUpdate.ts           เช็ค/โหลด live-update bundle บนแอป native
api/ai.js                    Vercel serverless proxy → LLM self-hosted (ตรวจ auth ก่อนเสมอ)
scripts/update-zip.mjs       แพ็ก dist/ เป็น bundle+manifest สำหรับ live-update
capacitor.config.ts          ตั้งค่าแอป native (appId, webDir, updater)
android/                     โปรเจกต์ Android native (commit ทั้งโฟลเดอร์)
.github/workflows/android-apk.yml   CI build+แจก APK อัตโนมัติ (ไม่ใช้ secret)
docs/FEATURES.md             สรุปฟีเจอร์ทั้งระบบแบบละเอียด (แหล่งอ้างอิงหลัก)
docs/MOBILE.md               คู่มือแอปมือถือ/Android
```

(หน้า/ไฟล์เดิมจากรอบก่อน — ListPage, FormPage, MapPage, Combo, PropertyDetail, LoginPage,
TeamPage, SuperAdminPage, lib/supabase.ts, lib/auth.tsx, styles.css — ยังอยู่และทำงานเหมือนเดิม
เว้นแต่ที่ระบุการเปลี่ยนแปลงไว้ข้างต้น)

## สถานะปัจจุบัน / งานที่ยังไม่เสร็จ

- **Deploy**: เว็บ production อยู่ที่ `hob-alpha.vercel.app` (อ้างอิงจาก CI ของ Android)
  — ปัญหา env vars/deployment protection ที่เคยพบก่อนหน้านี้ (ตอนยังชื่อ finprop-alpha)
  ควรตรวจซ้ำว่ายังอยู่หรือแก้ไปแล้ว
- **Push notification บนแอป Android**: รอผู้ใช้ตั้งค่า Firebase project เอง (ต้องใช้บัญชี Google
  ของเจ้าของโปรเจกต์) — ยังไม่เริ่มทำ
- **ขึ้น Store จริง (เฟส 3)**: ยังไม่ได้ทำ — ต้องซื้อบัญชี Google Play ($25) / Apple Developer
  ($99/ปี, ควรมี push ก่อนยื่นเพื่อไม่ให้โดนปัดตกเกณฑ์ 4.2)
- **iOS**: ยังไม่เริ่ม (เฟสถัดไป, ต้องใช้ Xcode + Mac)
- **Landing page**: ค่าติดต่อ (เบอร์/LINE/อีเมล) ยังเป็น placeholder ต้องใส่ค่าจริง
- **schema.sql**: มี comment หัวไฟล์เหลือชื่อเดิม "Find Prop" (ไม่กระทบผู้ใช้ แค่ comment)

## หมายเหตุด้านความปลอดภัย

- Environment variables ฝั่ง client (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) เป็นค่า
  public โดยตั้งใจ — ด่านความปลอดภัยจริงคือ Row Level Security ไม่ใช่การซ่อนคีย์
- **คีย์/endpoint ของ LLM ไม่เคยอยู่ฝั่ง client** — ทุกการเรียก AI ผ่าน `api/ai.js` เท่านั้น
  ซึ่งตรวจ Supabase auth token ก่อนทุกครั้ง
- ข้อมูลทรัพย์ไม่ออกไปนอกระบบ — LLM รันบนเครื่อง/GPU ของทีมเอง (self-hosted vLLM)
- สิทธิ์เข้าถึงข้อมูลทั้งหมด (แยกองค์กร, อนุมัติสมาชิก, ระงับ subscription, สวมสิทธิ์องค์กร)
  บังคับที่ระดับฐานข้อมูลด้วย RLS ไม่ใช่แค่ซ่อนที่ฝั่ง client
- Activity log เป็น append-only — ไม่มี policy ให้แก้ไข/ลบย้อนหลัง แม้แต่แอดมิน
