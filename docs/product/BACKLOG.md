# HOP (find_prop) backlog

Ordered by what to do next · owner = agent role · source = QA report / ticket / PRD

ทุกข้อด้านล่างมาจากการสำรวจตอน bootstrap ทีม (2026-09-18) — ยังไม่ผ่านการจัดลำดับโดย product-manager และยังไม่มีรายงาน QA เต็มรูปแบบ

## P0 — users blocked, money or data at risk
| # | Item | Owner | Notes |
|---|---|---|---|
| 1 | ยืนยันว่า RLS policy จริงบน Supabase ตรงกับ `supabase/*.sql` | `security-engineer` | **เป็นความเสี่ยง ยังไม่ใช่เหตุการณ์ที่ยืนยันแล้ว** — มีไฟล์ `.sql` 60+ ไฟล์ ไม่มี `migrations/` ไม่มีลำดับที่เขียนไว้ และหลายไฟล์ policy ทับซ้อนกัน (`multiorg-stage1/2`, `visibility-*`, `logs-scope`, `impersonate`, `*-fix.sql`) แอปเป็น multi-org ที่มี PII และเงิน จึงควรตรวจก่อนงานอื่น · **ต้องอ่านอย่างเดียว ห้ามเขียนใส่ฐานข้อมูลที่ใช้งานจริง** |

## P1 — wrong behaviour
| # | Item | Owner | Notes |
|---|---|---|---|
| 1 | `npm run test:docs` ไม่ผ่าน 2 จาก 54 | `devops-engineer` | ขาด rewrite ใน `vercel.json`: `/docs/costs` และ `/docs/presentation` — เทสต์คาดว่าเอกสารทุกชิ้นเปิดได้ด้วย URL ที่ไม่มี `.html` · แก้ที่ `vercel.json` ไม่ใช่แก้เทสต์ เว้นแต่ยืนยันว่าสองหน้านี้ตั้งใจไม่เปิดสาธารณะ (`docs/COSTS.*` ถูก gitignore ไว้ — น่าจะตั้งใจ ต้องถามเจ้าของก่อน) |
| 2 | `npm run test:shortlist` ไม่ผ่าน 4 จาก 201 | `web-dev` | ข้อความบนหน้า landing ไม่ตรงกับที่เทสต์คาด: ลิงก์มีวันหมดอายุ + ยกเลิกได้ · ลูกค้าไม่เห็นข้อมูลติดต่อเจ้าของ · ตรึงราคาตามวันที่เสนอ · มีฟีเจอร์บันทึกชอร์ตลิสต์ · ต้องตัดสินก่อนว่าฟีเจอร์หายหรือข้อความหาย |
| 3 | วาง baseline ของชุดทดสอบ UI | `test-engineer` | ชุด playwright ทั้ง 8 ตัวยังไม่เคยรันตอน bootstrap — `/test-all` เป็นงานแรกที่ควรทำ |

## P2 — quality, debt, docs
| # | Item | Owner | Notes |
|---|---|---|---|
| 1 | เพิ่ม CI ที่รัน `npx tsc -b` + ชุด pure-node selftest | `devops-engineer` | ตอนนี้มี workflow เดียวคือ `android-apk.yml` ที่ build APK — ของที่แดงอยู่ (P1 ข้อ 1–2) จึงไม่มีอะไรจับได้เลย |
| 2 | เอา `dev-dist/` ออกจาก git | `devops-engineer` | 4 ไฟล์ service worker ที่เป็น build output ถูก track อยู่ (`registerSW.js`, `sw.js`, `workbox-*.js`) — ควรเข้า `.gitignore` |
| 3 | ทำให้ `supabase/` มีลำดับ migration ที่รันซ้ำได้ | `architect` | หนี้ทางสถาปัตยกรรมข้อใหญ่ที่สุด · เป็นต้นตอของ P0 ข้อ 1 · ต้องมี ADR ก่อนลงมือ |
| 4 | สกัด design token จาก `src/styles.css` + `propertyStyle.tsx` | `ui-designer` | ยังไม่มี design system เป็นไฟล์เดียว และธีมต่อองค์กรเปลี่ยนสีได้ (`src/lib/branding.ts`) — คอมโพเนนต์ใหม่จึงห้าม hard-code สี |
| 5 | เขียน `CLAUDE.md` ของโปรเจกต์ | `tech-writer` | ยังไม่มี · ควรลิงก์มาที่ `docs/PROJECT-CONTEXT.md` แทนการเขียนซ้ำ |

## Ideas (not yet assessed)
- add via `/prd <idea>`; product-manager prioritises
