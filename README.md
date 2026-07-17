# HOB — ฐานข้อมูลทรัพย์ให้เช่า/ขาย

Web app ทดแทนแอป AppSheet "WUT Demo" — จัดการข้อมูลโกดัง โรงงาน โชว์รูม ออฟฟิศ ครัวกลาง
(โครงสร้างข้อมูลต้นแบบ: [docs/appsheet-analysis.md](docs/appsheet-analysis.md))

**Stack:** React + Vite + TypeScript · Supabase (PostgreSQL + Storage) · Leaflet/OpenStreetMap

## ฟีเจอร์

- 📋 **รายการทรัพย์** — ค้นหา, ดูรายละเอียดครบทุกฟิลด์, ปุ่มลัดโทร/SMS/เปิด Google Maps
- 📝 **ฟอร์ม** — เพิ่ม/แก้ไขทรัพย์ ครบ ~50 ฟิลด์ตามต้นแบบ, dropdown แบบ "เลือกหรือพิมพ์เพิ่ม",
  multi-select (คุณสมบัติ/การใช้งาน), อัปโหลดรูปขึ้น Supabase Storage
- 🗺️ **แผนที่** — ปักหมุดทรัพย์ทั้งหมดจากพิกัด, popup สรุป + เปิดรายละเอียด
- 🧭 **แผนเยี่ยมชม** — จัดรูทพาลูกค้าดูทรัพย์ (เรียงลำดับจุดแวะ + เปิดเส้นทางใน Google Maps)
  และเมื่อลูกค้าเปลี่ยน requirement ให้ **AI** สแกนทรัพย์ทั้งระบบหาตัวที่ตรงให้ทันที
  พร้อมชี้จุดแวะเดิมที่ไม่ตรงแล้ว
- 📊 **ชอร์ตลิสต์เปรียบเทียบ** — เลือกทรัพย์ 2–4 รายการ ให้ **AI** เขียนบทวิเคราะห์
  จุดเด่น/ข้อควรพิจารณา/คำแนะนำ ลงเอกสารเปรียบเทียบสวย ๆ พิมพ์/บันทึก PDF เสนอลูกค้าได้เลย
- 📥 **นำเข้าข้อมูล** — อัปโหลด Excel/CSV (เช่น export จาก AppSheet/Google Sheets เดิม)
  จับคู่หัวคอลัมน์กับฟิลด์อัตโนมัติ รองรับวันที่ พ.ศ./เลขมีคอมมา ตรวจรหัสซ้ำ
  (เลือกข้ามหรืออัปเดตทับ) พร้อมเทมเพลต CSV ให้ดาวน์โหลด

## วิธีตั้งค่า (ครั้งแรก)

1. สร้างโปรเจกต์ที่ [supabase.com](https://supabase.com) (แผนฟรีพอ)
2. เปิด **SQL Editor** ในโปรเจกต์ → รันตามลำดับ:
   [`supabase/schema.sql`](supabase/schema.sql) (ตาราง `properties` + bucket รูป + ตัวอย่าง JKP01)
   → [`supabase/auth.sql`](supabase/auth.sql) (ล็อกอิน + ลูกทีม)
   → [`supabase/org.sql`](supabase/org.sql) (ระบบองค์กร — แยกข้อมูลรายองค์กร)
   → [`supabase/super.sql`](supabase/super.sql) (super admin + subscription)
   → [`supabase/plans.sql`](supabase/plans.sql) (แผนเยี่ยมชมทรัพย์ — ใช้กับฟีเจอร์ AI)
3. ตั้งค่า Auth:
   - **Authentication → Sign In / Up → Email** → ปิด "Confirm email"
   - **Authentication → Users → Add user** → สร้างบัญชีของคุณ (ติ๊ก Auto Confirm)
   - รันใน SQL Editor (แก้อีเมล): `update public.profiles set role='admin', active=true where email='you@example.com';`
4. ไปที่ **Project Settings → API** คัดลอก Project URL และ anon public key
5. คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่าทั้งสอง:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

### เปิดใช้ฟีเจอร์ AI (แผนเยี่ยมชม + ชอร์ตลิสต์)

ฟีเจอร์ AI เรียกผ่าน serverless function (`api/ai.js`) เพื่อไม่ให้ API key หลุดไปฝั่ง client
— ใช้ได้เมื่อรันบน Vercel (หรือ `vercel dev`)

1. รัน [`supabase/plans.sql`](supabase/plans.sql) ใน SQL Editor (ถ้ายังไม่ได้รัน)
2. Vercel Dashboard → Project → **Settings → Environment Variables** เพิ่ม:
   - `AI_API_KEY` — คีย์ของ LLM API (จำเป็น)
   - `AI_API_URL` / `AI_MODEL` — ใส่เมื่อต้องการ override ค่า default
     (default: `https://consoletoken.aunjai.org/api/v1/chat/completions` / `gemma-4-12b`)
3. Redeploy หนึ่งครั้งเพื่อให้ env มีผล

function จะเช็คว่าเป็นผู้ใช้ที่ล็อกอิน (Supabase session) ก่อน forward ไปหา LLM ทุกครั้ง

### ระบบทีมและองค์กร

- ต้องล็อกอินก่อนถึงเห็น/แก้ข้อมูลทรัพย์ (บังคับที่ระดับฐานข้อมูลด้วย RLS)
- **องค์กร (organization)**: ข้อมูลทรัพย์และสมาชิกแยกเป็นรายองค์กร — สมาชิกเห็นเฉพาะขององค์กรตัวเอง
- ผู้ใช้ที่ล็อกอินแล้วยังไม่มีองค์กร → หน้า "สร้างองค์กร" (ผู้สร้างเป็นแอดมินขององค์กรนั้น)
- **แอดมิน** มีเมนู "ทีม": แก้ชื่อองค์กร, เพิ่มลูกทีมเข้าองค์กร (อีเมล+รหัสผ่านตั้งต้น ใช้ได้ทันที),
  ปิด/เปิดการใช้งานสมาชิก, ตั้ง/ลดแอดมิน
- ข้อมูลเดิมก่อนมีระบบองค์กรถูกย้ายเข้าองค์กรเริ่มต้นชื่อ "องค์กรของฉัน" อัตโนมัติ (เปลี่ยนชื่อได้ในหน้า "ทีม")

### Super Admin + Subscription

- ตั้ง super admin: `update public.profiles set is_super = true where email = 'you@example.com';`
- **super admin** มีเมนู "Super Admin": เห็นทุกองค์กร (จำนวนสมาชิก/ทรัพย์), กำหนดแพ็กเกจ
  (free / pro / enterprise), ตั้งวันหมดอายุ, ระงับ/เปิดใช้องค์กร
- องค์กรที่ถูก**ระงับ**หรือ**หมดอายุ** — สมาชิกล็อกอินได้แต่เจอหน้าแจ้งเตือน และอ่าน/เขียนข้อมูลทรัพย์ไม่ได้
  (บังคับที่ RLS ระดับฐานข้อมูล)
- แอดมินองค์กรแก้ subscription เองไม่ได้ (มี trigger กันที่ฐานข้อมูล) — เห็นแพ็กเกจ/วันหมดอายุของตัวเองในหน้า "ทีม"

## รันบนเครื่อง

```bash
npm install
npm run dev
```

เปิด http://localhost:5173

## Deploy ขึ้นออนไลน์ (Vercel)

1. push โค้ดขึ้น GitHub
2. ที่ [vercel.com](https://vercel.com) → **Add New Project** → เลือก repo นี้ (Vercel ตรวจพบ Vite เอง)
3. ใส่ Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
4. Deploy — ได้ URL `https://<ชื่อโปรเจกต์>.vercel.app`

> ⚠️ ตอนนี้ policy ในฐานข้อมูลเปิดให้ทุกคนที่มีลิงก์อ่าน/เขียนได้ (เหมือนแชร์แอป AppSheet ให้ทีม)
> ถ้าจะเปิดสาธารณะจริงควรเพิ่มระบบล็อกอิน (Supabase Auth) แล้วแก้ policy ใน `schema.sql`

## โครงสร้างโค้ด

```
src/
  App.tsx               เลย์เอาต์หลัก (topbar + sidebar + routes)
  labels.ts             ป้ายชื่อฟิลด์ภาษาไทย + ตัวเลือก enum ตามแอปต้นแบบ
  types.ts              ชนิดข้อมูล Property
  lib/supabase.ts       client + ชื่อ bucket
  hooks/useProperties.ts  โหลด/ลบข้อมูล
  pages/ListPage.tsx    รายการ + ค้นหา + action ต่อแถว
  pages/FormPage.tsx    ฟอร์มเพิ่ม/แก้ไข
  pages/MapPage.tsx     แผนที่ Leaflet
  components/PropertyDetail.tsx  แผงรายละเอียด
supabase/schema.sql     สคีมา + seed (รันครั้งเดียว)
docs/appsheet-analysis.md  ผลวิเคราะห์แอป AppSheet ต้นแบบ
```
