# HOP (find_prop) — system context for the agent team

Single source of truth for every agent in `./.claude/agents/`. Read this before touching any repo. Facts were verified on 2026-09-18; when you find one that is wrong, fix it here (tech-writer owns this file, anyone may correct a fact).

## Product in one paragraph

HOP (ชื่อใน `package.json` คือ `hob`, appName บนมือถือคือ `HOP`) คือ **ฐานข้อมูลทรัพย์ให้เช่า/ขายสำหรับนายหน้าอสังหาฯ ไทย** สร้างมาแทนแอป AppSheet เดิมชื่อ "WUT Demo" (โครงสร้างข้อมูลต้นแบบ: [docs/appsheet-analysis.md](appsheet-analysis.md)) ทรัพย์แบ่ง 4 หมวด — ที่อยู่อาศัย · เชิงพาณิชย์ · เชิงอุตสาหกรรม · ที่ดิน — ฟอร์มราว 50 ฟิลด์ เอนทิตีหลักคือ `properties` มี state machine เดียวที่ชัดเจนคือ `deal_status`: **`open` → `rented` | `sold`** (บังคับด้วย CHECK constraint ใน `supabase/property-deal-status.sql`, ค่าเริ่มต้น `open`)

เป็น **SaaS หลายองค์กร (multi-org) ที่เก็บเงินจริง**: แพ็กเกจ/ที่นั่ง (seats) · ช่วงทดลอง (trial) · รางวัลชวนเพื่อน (referral) · ชำระเงินผ่าน **PunPay** ผู้ใช้หนึ่งคนอยู่ได้หลายองค์กรและสลับไปมาได้ สิทธิ์มี **8 ระดับ**: `owner` · `manager` · `associate` · `analyst` · `survey` · `temporary` · `social` · `trainee` (คำอธิบายเต็มใน `src/lib/roles.ts` และ [docs/roles-spec.md](roles-spec.md))

**ข้อมูลอ่อนไหวที่ไหลอยู่ในระบบ**: ข้อมูลติดต่อเจ้าของทรัพย์ (ชื่อ/เบอร์) · บ้านเลขที่และเลขที่ห้อง · พิกัดแผนที่ · ยอดเงินและรายการชำระเงิน บทบาทระดับล่าง (`associate`, `analyst`, ...) **ต้องมองไม่เห็น** ข้อมูลติดต่อ/บ้านเลขที่/พิกัดของทรัพย์ที่คนอื่นลงไว้ — และการซ่อนนั้นต้องบังคับที่ฐานข้อมูล ไม่ใช่ที่ UI

ตลาด/ภาษา: ไทยล้วน ทั้ง UI, README, คอมเมนต์ในโค้ด, commit message และข้อความผลทดสอบ

## Repos
| Repo | Path | Stack | Verified checks |
|---|---|---|---|
| HOP web + mobile + api | `.` | React 18 · Vite 5 · TypeScript 5.5 · Capacitor 7 (iOS+Android) · Vercel serverless (api/*.js) · Supabase Postgres + Storage · Leaflet | `npx tsc -b` · `npm run test:roles` · `npm run test:seats` · `npm run test:auth` · `npm run test:draft` · `npm run test:import` · `npm run test:latlng` · `npm run test:referral` · `npm run test:upload` |

เป็น **repo เดียว** ไม่ใช่ multi-repo — เว็บ, แอปมือถือ และ API อยู่ด้วยกันหมด

Owner(s): `itsaraphap <itsaraphap.top@gmail.com>` (263 commits ทั้งหมด — คนเดียว, 2026-07-17 ถึง 2026-09-14). Default branch: `main`. Shared docs: `docs` (`product/` PRD + BACKLOG, `adr/`, `design/`, `tickets/`, `runbooks/`, `qa/`, `releases/`).

## Architecture map

**Entry point**: `index.html` → `src/main.tsx` → `src/App.tsx` (React Router 6)

**ชั้นของโค้ด** (ไม่ใช่ layered architecture แบบเคร่งครัด — เป็น SPA ที่แยกตามหน้าที่):
- `src/pages/` — 18 หน้า: `ListPage` · `FormPage` (+ `form/`) · `MapPage` · `DashboardPage` · `ComparePage` · `FollowUpPage` · `ImportPage` · `TeamPage` · `PlansPage` · `UpgradePage` · `ProfilePage` · `LoginPage` · `LandingPage` · `SharePage` · `LogsPage` · `SuperAdminPage` · `SuperStatsPage`
- `src/lib/` — 31 โมดูลที่เป็น "สมอง" ของแอป (`supabase.ts`, `auth.tsx`, `roles.ts`, `plan.ts`, `payments.ts`, `push.ts`, `upload.ts`, `ai.ts`, `latlng.ts`, `importProps.ts`, `appUpdate.ts`, `deviceSession.ts`, `orgSwitch.ts`, `activityLog.ts`, ...)
- `src/components/` (13) · `src/hooks/` (6) · `src/types.ts` · `src/labels.ts`

**ฝั่งเซิร์ฟเวอร์**: Vercel serverless functions ใน `api/*.js` — **JavaScript ESM ล้วน ไม่ผ่าน `tsc`** มี 11 endpoint + ตัวช่วยร่วมใน `api/_lib/` (`seats.js`, `plan.js`, `prices.js`, `latlng.js`, `settings.js`)

| endpoint | หน้าที่ |
|---|---|
| `/api/ai` | เรียกโมเดล AI (maxDuration 60s) |
| `/api/create-charge` · `/api/verify-charge` · `/api/punpay-webhook` | เส้นทางเงิน (PunPay) |
| `/api/create-member` · `/api/send-invite` | เชิญ/สร้างสมาชิกทีม |
| `/api/push-cron` | cron รายวัน 00:00 UTC (maxDuration 60s, กันด้วย `CRON_SECRET`) |
| `/api/resolve-latlng` · `/api/backfill-latlng` | ดึง/เติมพิกัดจากลิงก์ Google Maps |
| `/api/migrate-photos` · `/api/stats` | งานข้อมูล/สถิติ |

**Auth pattern**: React context ที่ `src/lib/auth.tsx` — Supabase session (+ OAuth Google) แล้วโหลด `Profile` ที่มี `role` ของ org ที่ active อยู่ · การจดเครื่องเดียวอยู่ที่ `src/lib/deviceSession.ts` (ล็อกอินซ้อนจะเตะเครื่องเก่าออก)

> ⚠️ **เส้นแบ่งความปลอดภัยที่สำคัญที่สุดของโปรเจกต์นี้**
> `src/lib/roles.ts` เขียนกำกับตัวเองไว้ว่า *"ที่นี่ใช้สำหรับซ่อน/ปิดปุ่มและข้อความอธิบาย **ไม่ใช่ด่านความปลอดภัย**"*
> **ด่านจริงคือ RLS policy ใน `supabase/*.sql`** การแก้ตรรกะสิทธิ์ต้องแก้ทั้งสองฝั่งให้ตรงกันเสมอ และข้อเสนอใด ๆ ที่ย้ายการบังคับสิทธิ์มาไว้ฝั่ง client ต้องถูกปฏิเสธ

**Data layer**: Supabase JS client (`src/lib/supabase.ts`) เรียกตรงจาก client เป็นหลัก — ความปลอดภัยจึงพึ่ง RLS ทั้งหมด; งานที่ต้องใช้ `SUPABASE_SERVICE_ROLE_KEY` ถึงย้ายไปอยู่ใน `api/`

**i18n**: ไม่มีระบบ i18n — ข้อความไทย hard-code อยู่ในคอมโพเนนต์และ `src/labels.ts`

**Background jobs**: Vercel cron เดียว — `/api/push-cron` ทุกวัน 00:00 UTC (07:00 เวลาไทย)

**External services**: Supabase (DB + Storage) · Vercel (hosting + functions + cron) · PunPay (ชำระเงิน) · OpenStreetMap/Leaflet (แผนที่) · Resend + SMTP (อีเมล) · FCM (push) · โมเดล AI ผ่าน `AI_API_URL`

**มือถือ**: Capacitor 7 ห่อ `dist/` ตัวเดียวกับเว็บ — **ไม่มีโค้ด native แยก** `appId: com.hobproperty.app` (เปลี่ยนไม่ได้หลังเผยแพร่) · live-update คุมเองที่ `src/lib/appUpdate.ts` โดยตั้ง `CapacitorUpdater: { autoUpdate: false }` ไว้ตั้งใจ

## Environments

- **Production**: `https://hob-alpha.vercel.app` (เป็น fallback ที่ hard-code ไว้ใน `src/lib/native.ts` และ `api/send-invite.js`) · ฐานข้อมูลคือ Supabase project ที่โฮสต์ไว้ **Agents never call, deploy to, or migrate production.**

- **Local dev**: `npm run dev` → Vite ที่ **http://localhost:5173** · ฮาร์เนสของฟอร์มสำหรับเทสต์ UI อยู่ที่ `dev/form-harness.html` · ตอนเขียนไฟล์นี้ไม่มี service ใดรันค้างอยู่

- **Isolated test recipe** (what testers and devs use; must not touch dev or prod data):

  ```bash
  # 1) ชุด pure-node — hermetic จริง ไม่แตะเครือข่ายหรือฐานข้อมูลใด ๆ
  #    (แบบแผน: esbuild bundle โมดูลเป้าหมาย แล้ว import มา assert ด้วย fake store)
  npm run test:draft && npm run test:import && npm run test:latlng \
    && npm run test:seats && npm run test:roles && npm run test:referral \
    && npm run test:auth && npm run test:upload

  # 2) ชุด UI (playwright) — ต้องมี dev server ค้างไว้ก่อน
  npm run dev &            # http://localhost:5173
  npm run test:ui          # dev/form-harness.html
  npm run test:edit && npm run test:seats-ui && npm run test:roles-ui \
    && npm run test:auth-ui && npm run test:lightbox
  kill %1                  # teardown: ปิด dev server
  ```

> ⚠️ **ไม่มีฐานข้อมูลสำหรับทดสอบแยก** — ไม่มี `supabase/config.toml` ไม่มี `supabase/migrations/` ไม่มี Docker/compose ทุกอย่างชี้ไปที่ Supabase project ที่โฮสต์ไว้ตัวเดียว
> ผลคือ **ทดสอบอะไรที่เขียนลงฐานข้อมูลแบบแยกสภาพแวดล้อมไม่ได้** เทสต์ที่ปลอดภัยคือชุด pure-node (ไม่แตะ DB) และชุด UI ที่วิ่งบนฮาร์เนส
> ห้าม api-tester / e2e-tester / security-engineer ยิงคำสั่งเขียนหรือลบใส่ Supabase ที่ใช้งานจริง หากงานใดจำเป็นต้องมี DB แยก ให้ **หยุดแล้วรายงานเจ้าของก่อน** อย่าเดาเอาเอง

  Port allocation for temporary services: 5173 = Vite dev (ตัวเดียวที่ใช้จริงตอนนี้) · ถ้าต้องเปิด service ชั่วคราวเพิ่ม ให้ใช้ 55440+ และปิดทุกครั้งเมื่อเสร็จ

## Conventions for the team

- Reports and documents addressed to the owner are written in Thai; code identifiers, paths, commands, and HTTP details stay in English.
- **คอมเมนต์ในโค้ดและ commit message เขียนภาษาไทย** ตามแบบที่ repo นี้ใช้มาตลอด 263 commits — คอมเมนต์ไทยในโค้ดนี้อธิบาย *"ทำไม"* ไม่ใช่ *"ทำอะไร"* และถือเป็นเอกสารที่มีน้ำหนัก **การแก้ที่ลบคอมเมนต์เหล่านี้ทิ้งถือว่าทำข้อมูลหาย** (ตัวอย่างที่ดี: `src/lib/native.ts` อธิบายว่าทำไมห้ามปล่อย `API_BASE` ว่างในแอป พร้อมวันที่ที่เคยพังจริง)
- Never `git add/commit/push/stash/checkout/reset` unless the user explicitly asks in that turn. Never edit `.env*`, never print secret values, never add secrets to tracked files.
- **ตัวแปรลับห้ามขึ้นต้นด้วย `VITE_`** — Vite ฝังทุกตัวที่ขึ้นต้นด้วย `VITE_` ลงไปใน bundle ฝั่ง client ตัวที่ต้องอยู่ฝั่งเซิร์ฟเวอร์เท่านั้น: `AI_API_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `PUNPAY_SECRET_KEY` · `PUNPAY_WEBHOOK_SECRET` · `RESEND_API_KEY` · `SMTP_PASS` · `CRON_SECRET` · `FCM_SERVICE_ACCOUNT` (ที่ขึ้นต้น `VITE_` ได้มีแค่ `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE`)
- **แก้สิทธิ์ = แก้สองที่** `supabase/*.sql` (ด่านจริง) และ `src/lib/roles.ts` (UI) ห้ามแก้ข้างเดียว
- **เกณฑ์ผ่านขั้นต่ำก่อนส่งงาน**: `npx tsc -b` ต้องเขียว และชุด pure-node selftest ต้องไม่แดงเพิ่มจาก baseline ด้านล่าง
- **ไม่มี ESLint/Prettier ในโปรเจกต์** — เขียนตามสไตล์ไฟล์ข้างเคียง อย่าเพิ่ม formatter เองโดยไม่ถามเจ้าของ
- เปลี่ยนชื่อไฟล์ใน `docs/` เมื่อไร ต้องแก้ rewrite/redirect ใน `vercel.json` ด้วย (มี `npm run test:docs` คอยตรวจอยู่)
- Documents: PRD `docs/product/PRD-<slug>.md`, ADR `docs/adr/ADR-NNN-<slug>.md`, tickets `docs/tickets/BUG-NNN-<slug>.md`, runbooks `docs/runbooks/`, release notes `docs/releases/`, backlog `docs/product/BACKLOG.md`, team chart `docs/TEAM.md`, lessons `docs/LEARNINGS.md`.

**เอกสารที่มีอยู่แล้ว — ให้ลิงก์ ห้ามเขียนซ้ำ**: [FEATURES.md](FEATURES.md) · [GUIDE.md](GUIDE.md) · [MOBILE.md](MOBILE.md) · [roles-spec.md](roles-spec.md) · [seats-pricing.md](seats-pricing.md) · [hop-form-spec.md](hop-form-spec.md) · [appsheet-analysis.md](appsheet-analysis.md) · [project-summary.md](project-summary.md) · `SYSTEM.html` · `TRAINING.html` · `INVESTOR.html` · `PRESENTATION.html`
`docs/COSTS.md` และ `docs/COSTS.html` อยู่ใน `.gitignore` เพราะมีโครงสร้างต้นทุน — **อ้างถึงได้ แต่ห้ามคัดลอกเนื้อหาลงไฟล์ที่ commit**

## Known state / hygiene red flags

1. **ไม่มีเครื่องมือ migration ที่เรียงลำดับ** — `supabase/` มีไฟล์ `.sql` กระจาย **60+ ไฟล์** ไม่มี `migrations/` ไม่มี `config.toml` ลำดับการรันเป็นความรู้ที่ไม่ได้เขียนไว้ที่ไหน และมีหลายไฟล์ที่ policy ทับซ้อนกัน (`multiorg-stage1/2`, `visibility-*`, `logs-scope`, `impersonate`, `*-fix.sql` อีกหลายตัว) **ผลที่ตามมา: policy จริงบน production อาจไม่ตรงกับที่อ่านได้จากไฟล์** นี่คือหนี้ทางสถาปัตยกรรมข้อใหญ่ที่สุดของโปรเจกต์
2. **ไม่มี CI ที่รัน typecheck หรือ selftest** — มี workflow เดียวคือ `.github/workflows/android-apk.yml` ที่ build APK เท่านั้น ของที่แดงอยู่ (ข้อ 4) จึงไม่มีอะไรจับได้
3. **`dev-dist/` ถูก commit ลง git** — 4 ไฟล์ service worker (`registerSW.js`, `sw.js`, `workbox-*.js`) ซึ่งเป็น build output ควรเข้า `.gitignore`
4. **selftest แดงอยู่ 2 ชุดบน `main` ที่สะอาด** — ดูหัวข้อ Baseline
5. ไม่มีไฟล์ `.env` จริงถูก track (มีแต่ `.env.example` ซึ่งไม่มีค่าจริง) — ข้อนี้ **สะอาด**
6. dependency ตัวเดียวที่ไม่ได้ pin ผ่าน registry ปกติคือ `xlsx` ที่ดึงจาก `https://cdn.sheetjs.com/...tgz` โดยตรง (ตั้งใจ — SheetJS ย้ายออกจาก npm) ให้รู้ไว้ตอนตรวจ supply chain
7. ไม่มี `CLAUDE.md` ในโปรเจกต์

## Baseline

ยังไม่มีรายงาน QA เต็มรูปแบบใน `docs/qa/` — นี่คือ baseline ที่วัดจริงตอน bootstrap (2026-09-18, บน `main` สะอาด ไม่มีไฟล์ค้าง, Node v24.9.0 / npm 11.6.0):

| check | ผล |
|---|---|
| `npx tsc -b` | ✅ ผ่าน (exit 0) |
| `npm run test:auth` | ✅ ผ่าน 29 ข้อ |
| `npm run test:roles` | ✅ ผ่าน 169 ข้อ |
| `npm run test:seats` | ✅ ผ่าน 59 ข้อ |
| `npm run test:draft` | ✅ ผ่าน 25 ข้อ |
| `npm run test:latlng` | ✅ ผ่าน 25 ข้อ |
| `npm run test:import` | ✅ ผ่าน |
| `npm run test:referral` | ✅ ผ่าน |
| `npm run test:upload` | ✅ ผ่าน 33 ข้อ |
| `npm run test:docs` | ❌ **ไม่ผ่าน 2 จาก 54** (exit 1) |
| `npm run test:shortlist` | ❌ **ไม่ผ่าน 4 จาก 201** (exit 1) |

**รายละเอียดที่แดง — อย่ารายงานว่าเป็นของใหม่ที่เพิ่งพัง:**

- `test:docs` — ขาด rewrite ใน `vercel.json` สองเส้น: `/docs/costs` และ `/docs/presentation` (เทสต์คาดว่าเอกสารทุกชิ้นต้องเปิดได้ด้วย URL ที่ไม่มี `.html`)
- `test:shortlist` — ข้อความบนหน้า landing ไม่ตรงกับที่เทสต์คาด 4 ข้อ: ลิงก์มีวันหมดอายุ + ยกเลิกได้ · ลูกค้าไม่เห็นข้อมูลติดต่อเจ้าของ · ตรึงราคาตามวันที่เสนอ · มีฟีเจอร์บันทึกชอร์ตลิสต์

**ยังไม่ได้ทดสอบเลยตอน bootstrap**: ชุด UI ทั้งหมดที่ต้องใช้ playwright + dev server (`test:ui`, `test:edit`, `test:nav`, `test:seats-ui`, `test:roles-ui`, `test:auth-ui`, `test:lightbox`, `test:stats`) · `npm run build` เต็มรูปแบบ · แอปมือถือบนอุปกรณ์จริงหรือ simulator · RLS policy จริงบน Supabase

งานแรกที่ควรทำคือ `/test-all` เพื่อปิดช่องว่างชุด UI ให้ baseline ครบ
