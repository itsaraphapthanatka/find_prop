---
name: HOP
description: ฐานข้อมูลทรัพย์ให้เช่า/ขายสำหรับทีมนายหน้าอสังหาฯ ไทย — ใช้ได้ทั้งหน้างานบนมือถือและที่ออฟฟิศบนจอใหญ่
colors:
  ink-violet: "#7132f5"
  ink-violet-deep: "#5741d8"
  ink-violet-subtle: "#f3eefe"
  ink-violet-tint: "#faf8ff"
  ink: "#101114"
  muted: "#6b7280"
  line: "#e5e7eb"
  line-soft: "#f0f1f4"
  bg: "#f7f7f9"
  surface: "#ffffff"
  danger: "#d92d20"
  danger-subtle: "#fdecea"
  success: "#149e61"
  success-subtle: "#e7f6ef"
  paper: "#faf9f6"
  paper-ink: "#14131a"
  paper-dim: "#67636f"
  paper-hair: "#ebe8e0"
typography:
  display:
    fontFamily: "IBM Plex Sans Thai, Segoe UI, Leelawadee UI, Tahoma, system-ui, sans-serif"
    fontSize: "clamp(24px, 3.6vw, 36px)"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "IBM Plex Sans Thai, Segoe UI, Leelawadee UI, Tahoma, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    letterSpacing: "-0.4px"
  title:
    fontFamily: "IBM Plex Sans Thai, Segoe UI, Leelawadee UI, Tahoma, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "IBM Plex Sans Thai, Segoe UI, Leelawadee UI, Tahoma, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "IBM Plex Sans Thai, Segoe UI, Leelawadee UI, Tahoma, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  kicker:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.22em"
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  pill: "999px"
  circle: "50%"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "14px"
  "2xl": "20px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "7px 16px"
    typography: "{typography.body}"
  button-hover:
    backgroundColor: "{colors.ink-violet-tint}"
    textColor: "{colors.ink-violet}"
  button-primary:
    backgroundColor: "{colors.ink-violet}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "7px 16px"
  button-primary-hover:
    backgroundColor: "{colors.ink-violet-deep}"
    textColor: "{colors.surface}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
  button-sm:
    padding: "4px 12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.paper-dim}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  chip-toggle:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "20px"
    padding: "5px 14px"
  chip-toggle-on:
    backgroundColor: "{colors.ink-violet}"
    textColor: "{colors.surface}"
    rounded: "20px"
    padding: "5px 14px"
  chip:
    backgroundColor: "{colors.ink-violet-subtle}"
    textColor: "{colors.ink-violet}"
    rounded: "20px"
    padding: "2px 10px"
  status-pill:
    backgroundColor: "{colors.danger-subtle}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: "1px 10px"
  status-pill-on:
    backgroundColor: "{colors.success-subtle}"
    textColor: "{colors.success}"
    rounded: "{rounded.md}"
    padding: "1px 10px"
  stat-tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "12px 14px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "10px 18px"
  nav-item-active:
    backgroundColor: "{colors.ink-violet-subtle}"
    textColor: "{colors.ink-violet}"
    padding: "10px 18px"
---

# Design System: HOP

## Overview

**Creative North Star: "แผงควบคุมภาคสนาม" (The Field Console)**

HOP ไม่ใช่เว็บที่คนมาเยี่ยมชม มันคือแผงควบคุมที่คนเปิดค้างไว้ทั้งวัน — บนมือถือขณะยืนอยู่หน้าโกดัง
และบนจอใหญ่ขณะนั่งดูว่าทีมมีทรัพย์อะไรในมือ ความงามของมันคือความแม่นยำ: ข้อมูลหนาแน่นแต่อ่านออก
ปุ่มที่กดถูกตั้งแต่ครั้งแรกเพราะเป้าใหญ่พอ และสถานะที่บอกตัวเองได้โดยไม่ต้องเดา

ระบบนี้จึงเงียบโดยตั้งใจ พื้นขาว เส้นขอบบางเทาอ่อน ตัวอักษรเล็กแต่คมด้วยฟอนต์ไทยที่ออกแบบมาเพื่อ
ความหนาแน่น สีเกือบทั้งหน้าจอเป็นกลาง — เพื่อให้ **ม่วงหมึก** ที่โผล่มาน้อยครั้งมีความหมายทุกครั้ง
ที่โผล่ ความรู้สึกที่ต้องการคือ **อุ่นมือ เข้าถึงง่าย** ไม่ใช่เครื่องมือขององค์กรที่ต้องอบรมก่อนใช้:
มุมโค้ง เป้าแตะใหญ่ ไม่มีเส้นตารางแข็ง ๆ ระหว่างแถว

สิ่งที่ระบบนี้ตั้งใจไม่เป็น: **เว็บอสังหาฯ ไทยทั่วไป** (สีจัด แบนเนอร์เยอะ กรอบรูปหนา โปรโมชั่นทับกัน)
และ **SaaS ฝรั่งทั่วไป** (gradient ม่วง-ฟ้า ไอคอนเส้นบาง การ์ดลอยเยอะ สวยแต่บอกไม่ได้ว่าเจ้าไหน)
นอกจากสองอย่างนี้ ระบบไม่ได้ปิดกั้นทิศทางอื่นไว้ล่วงหน้า

> **ข้อที่ยังไม่ตัดสิน — บันทึกไว้ตามที่เห็นจริง**
> โปรเจกต์นี้มี token สองชุดที่อยู่กันคนละโลก: **แอป** ใช้เทาอมเย็น (`bg #f7f7f9`, `ink #101114`)
> ส่วน **หน้า landing** ใช้กระดาษอุ่นที่ scope ไว้ใน `.landing` (`paper #faf9f6`, `paper-ink #14131a`,
> `paper-hair #ebe8e0`) บวกฟอนต์ mono สำหรับ kicker ทั้งสองโลกใช้ม่วงหมึกร่วมกันเป็นสะพานเดียว
> เจ้าของยังไม่ได้ตัดสินว่าตั้งใจแยกหรือควรรวม — **อย่าถือเป็นกฎ และอย่ารวมเองเงียบ ๆ**
> งานที่แตะทั้งสองฝั่งให้ถามก่อน

**Key Characteristics:**
- หนาแน่นแต่อ่านออก — body 14px, label 12–13px, ข้อมูลเยอะต่อหน้าจอโดยตั้งใจ
- แบนเมื่อพัก มีเงาเมื่อโต้ตอบ — เส้นขอบ 1px คือโครงสร้างจริง
- ม่วงหมึกใช้น้อย ใช้เมื่อมีความหมาย
- เป็นกลางเกือบทั้งหมด สีมีความหมายเฉพาะ danger/success
- มุมโค้งทั่วถึง ไม่มีมุมฉาก — ความอุ่นมาจากรูปทรง ไม่ใช่จากสี
- ฟอนต์ไทยเป็นพลเมืองชั้นหนึ่ง ไม่ใช่ fallback ของฟอนต์ละติน

## Colors

จานสีเป็นกลางเกือบทั้งหมดโดยตั้งใจ — มีสีเดียวที่เป็นเสียงของแบรนด์ และอีกสองสีที่พูดเฉพาะตอนมีเรื่อง

### Primary
- **ม่วงหมึก / Ink Violet** (`#7132f5`): เสียงเดียวของระบบ ใช้กับสิ่งที่ผู้ใช้กำลังทำหรือต้องทำต่อ —
  ปุ่ม primary, เมนูที่ active, chip ที่เลือกอยู่, focus ring, `.brand-accent`, kicker บน landing
  ไม่ใช่สีตกแต่ง ไม่ใช้กับพื้นหลังใหญ่ ไม่ใช้กับข้อความยาว
- **ม่วงหมึกเข้ม / Ink Violet Deep** (`#5741d8`): สถานะ hover ของปุ่ม primary เท่านั้น
- **ม่วงหมึกจาง / Ink Violet Subtle** (`#f3eefe`): พื้นของสิ่งที่ถูกเลือกอยู่แต่ไม่ได้กำลังถูกกด —
  เมนู active, `.chip`, `.count-badge`
- **ม่วงหมึกบาง / Ink Violet Tint** (`#faf8ff`): พื้น hover ที่แทบไม่มีสี — ปุ่มปกติและเมนูตอนเอาเมาส์ชี้
  และเป็นพื้นหัวตารางของ `.data-table`

### Neutral
- **หมึก / Ink** (`#101114`): ข้อความหลักทุกชิ้น ดำอมน้ำเงินเล็กน้อย ไม่ใช่ดำสนิท
- **เทาเงียบ / Muted** (`#6b7280`): label, ค่ารอง, ไอคอนที่ยังไม่ active, placeholder
- **เส้น / Line** (`#e5e7eb`): เส้นขอบและเส้นคั่นทุกชิ้น — นี่คือโครงสร้างจริงของระบบ ไม่ใช่เงา
- **เส้นจาง / Line Soft** (`#f0f1f4`): เส้นคั่นภายในที่ไม่อยากให้เด่นเท่าขอบนอก
- **พื้นแอป / Bg** (`#f7f7f9`): พื้นหลังของ viewport ที่การ์ดสีขาวลอยอยู่บน
- **พื้นผิว / Surface** (`#ffffff`): พื้นของการ์ด แถว แผง ฟอร์ม ทุกชิ้น
  หมายเหตุ: ปัจจุบันเขียนเป็น `#fff` ตรง ๆ ในซีเอสเอส **ยังไม่มี custom property** ของตัวเอง

### Tertiary — สีสถานะ
- **แดงเตือน / Danger** (`#d92d20`) กับพื้น `#fdecea`: ฟิลด์บังคับ, ปุ่มลบ, `.status-pill` สถานะปิด
- **เขียวสำเร็จ / Success** (`#149e61`) กับพื้น `#e7f6ef`: `.status-pill.on` สถานะเปิด/สำเร็จ

### หน้า landing (scope `.landing`)
- **กระดาษ / Paper** (`#faf9f6`) · **หมึกกระดาษ / Paper Ink** (`#14131a`) ·
  **เทากระดาษ / Paper Dim** (`#67636f`) · **เส้นกระดาษ / Paper Hair** (`#ebe8e0`)
  ชุดนี้อุ่นกว่าชุดแอปอย่างเห็นได้ ใช้เฉพาะใต้ `.landing` ดูหมายเหตุใน Overview

### Named Rules

**กฎเสียงเดียว (The One Voice Rule).** ม่วงหมึกอยู่บนหน้าจอได้ไม่เกิน ~10% ของพื้นที่
ถ้าหน้าไหนมีม่วงสองก้อนที่ไม่เกี่ยวกัน แปลว่าก้อนหนึ่งผิด — ความหายากของมันคือประเด็นทั้งหมด

**กฎสีมีเรื่องเล่า (The Color-Has-News Rule).** แดงกับเขียวใช้ได้เฉพาะตอนที่มีเรื่องจริงต้องบอก
(ผิดพลาด · บังคับ · ปิดดีลแล้ว) ห้ามใช้จัดหมวดหมู่หรือตกแต่ง ทรัพย์ที่ปกติต้องไม่มีสีอะไรเลย

## Typography

**Display / Body Font:** IBM Plex Sans Thai (fallback: Segoe UI, Leelawadee UI, Tahoma, system-ui)
โหลดจาก Google Fonts น้ำหนัก 400/500/600/700
**Label/Mono Font:** IBM Plex Mono (น้ำหนัก 500/600) — ใช้เฉพาะ kicker บน landing

**Character:** ฟอนต์ไทยที่ออกแบบมาให้อ่านออกที่ขนาดเล็ก หัวตัวอักษรชัด วรรณยุกต์ไม่ชนกัน
จึงรองรับความหนาแน่นระดับ 12–14px ได้โดยไม่ล้า เลือกคู่นี้เพราะไทยกับละตินมาจากตระกูลเดียวกัน
ตัวเลขและคำอังกฤษที่ปนอยู่ในข้อมูลทรัพย์จึงไม่กระโดด

### Hierarchy
- **Display** (700, `clamp(24px, 3.6vw, 36px)`, lh 1.18, ls -0.025em): หัวข้อ section บน landing เท่านั้น
- **Headline** (700, 18px, ls -0.4px): ชื่อหน้าใน `.view-header h1` และแบรนด์บน `.topbar`
- **Title** (600, 15px): หัวการ์ด ชื่อทรัพย์ในแถว หัวข้อย่อยในฟอร์ม
- **Body** (400, 14px): ข้อความทั่วไป ค่าในฟิลด์ ปุ่ม เนื้อในตาราง
- **Label** (400, 12–13px, สี muted): ป้ายกำกับฟิลด์ ค่ารอง คำอธิบายใต้ตัวเลข
- **Kicker** (600, 12px, ls 0.22em, uppercase, mono, สีม่วงหมึก): ป้ายเหนือหัวข้อบน landing

**ตัวเลขเด่น** (`.stat-value`): 26px/700/ls -0.6px — ใช้เฉพาะตัวเลขสรุปบน dashboard tile

### Named Rules

**กฎสิบสี่ (The 14px Rule).** body คือ 14px ทั่วทั้งแอป เล็กกว่านั้นคือ label เท่านั้น
ถ้าอยากให้อะไรเด่นขึ้น ใช้น้ำหนัก (600/700) หรือสี ไม่ใช่เพิ่มขนาด — ความหนาแน่นคือฟีเจอร์
หน้าจอที่มีตัวอักษรห้าขนาดคือหน้าจอที่ออกแบบพลาด

**กฎวรรณยุกต์ (The Thai Diacritic Rule).** ข้อความไทยต้องการที่ว่างแนวตั้งมากกว่าละติน
line-height ของเนื้อความไม่ต่ำกว่า 1.5 และห้ามใช้ `text-transform: uppercase` กับข้อความไทย
(mono kicker เป็นอังกฤษล้วนจึงใช้ได้)

## Layout

โครงหลักของแอปเป็น **topbar เต็มความกว้าง + sidebar 190px + พื้นที่เนื้อหาที่เลื่อนเอง** —
`.main` เป็น flex, `.content` ถือ overflow ไว้ ทำให้ topbar กับ sidebar นิ่งขณะเลื่อนรายการยาว
`.view-header` เป็น sticky อยู่บนสุดของเนื้อหา

**คอนเทนเนอร์:** ฟอร์มจำกัดที่ 680px · หน้าทีมที่ 760px · ช่องค้นหาบน topbar ที่ 420px
รายการและแผนที่กินเต็มความกว้าง

**จังหวะระยะ:** ช่องไฟเล็ก ๆ ถี่ ๆ — 4/6/8/12/14px สำหรับภายในคอมโพเนนต์ และ 20px
สำหรับ padding ขอบหน้า (`.prop-list` ใช้ `12px 20px 24px`) ระยะห่างระหว่างแถวในรายการคือ 10px

**Breakpoints ที่ใช้จริง:** 480 · 560 · 640 · 720 · 760 · 860px
จุดตัดหลักคือ **720px** — ต่ำกว่านั้น sidebar กลายเป็นแถบล่าง ตารางกลายเป็นการ์ด
ระบบนี้ไม่มี breakpoint desktop ขนาดใหญ่ เพราะจอใหญ่ใช้ที่ว่างด้วยการเพิ่มคอลัมน์ ไม่ใช่ขยายทุกอย่าง

**Responsive สำหรับข้อมูลตาราง:** `.data-table` คงสภาพ table-cell บนจอใหญ่ และสลับเป็นการ์ดใน
media query — คอมเมนต์ในซีเอสเอสเตือนไว้ว่าการใส่ flex บน `td` ทำให้ตารางพังและปุ่มหลุดออกนอกการ์ด

## Elevation & Depth

ระบบนี้ **แบนเมื่อพัก** พื้นผิวทุกชิ้นวางราบบนพื้น `#f7f7f9` และแยกตัวเองด้วย **เส้นขอบ 1px สี `#e5e7eb`**
ไม่ใช่ด้วยเงา ค่า `--shadow` (`0 1px 2px rgba(0,0,0,0.03)`) จางจนแทบมองไม่เห็นโดยตั้งใจ —
มันคือรอยแยกบาง ๆ ให้ขอบไม่ดูแปะติดพื้น ไม่ใช่การยกของขึ้น

**เงาคือภาษาของการโต้ตอบ** `--shadow-lg` ปรากฏเฉพาะตอนที่บางอย่างกำลังเกิดขึ้น: แถวทรัพย์ตอน hover
(พร้อม `translateY(-1px)`), drawer, dropdown, การ์ดล็อกอิน, bottom sheet — ทั้งหมดคือของที่ลอยเหนือ
บริบทเดิมชั่วคราว

### Shadow Vocabulary
- **รอยแยก / hairline** (`box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03)`): พื้นผิวที่พักอยู่ ใช้คู่กับเส้นขอบ 1px เสมอ
- **ยกขึ้น / lifted** (`box-shadow: 0 8px 30px rgba(16, 17, 20, 0.12)`): hover ของแถวที่กดได้, overlay ทุกชนิด
- **เรืองม่วง / accent glow** (`box-shadow: 0 8px 24px rgba(113, 50, 245, 0.32)`): เฉพาะ CTA หลักบน landing
  ขยายเป็น `0 12px 30px rgba(113, 50, 245, 0.42)` ตอน hover — ห้ามใช้ในแอป

### Named Rules

**กฎเงาคือสถานะ (The Shadow-Is-State Rule).** ของที่นิ่งใช้เส้น ของที่กำลังโต้ตอบหรือลอยอยู่ใช้เงา
การ์ดที่มีเงาแรงตั้งแต่ตอนพักคือการโกหกผู้ใช้ว่ามีอะไรเกิดขึ้น

## Shapes

ภาษารูปทรงคือ **มุมโค้งทั่วถึง ไม่มีมุมฉาก** — นี่คือที่มาของความรู้สึกอุ่นมือในระบบที่สีเป็นกลางเกือบหมด

- **10px** คือรัศมีที่ใช้จริงมากที่สุด (ช่องกรอก, ปุ่มเล็ก, `.status-pill`, รูปย่อ)
- **12px** คือค่าใน `--radius` (การ์ด, แถวรายการ, ปุ่ม, `.stat-tile`)
- **8px / 6px** สำหรับของชิ้นเล็กภายในการ์ด · **16–20px** สำหรับแผงใหญ่และ bottom sheet
- **20px / 999px** สำหรับ chip และ pill ทุกชนิด · **50%** สำหรับ avatar และจุดบนแผนที่

เส้นขอบเป็น 1px ทึบเสมอ ไม่มีเส้นประ ไม่มีเส้นคู่ ช่องกรอกและปุ่มใช้เส้นเดียวกันที่สี `line`
แล้วเปลี่ยนเป็นม่วงหมึกตอน focus

### Named Rules

**กฎรางเมนู (The Nav Rail Rule).** เมนูข้างใช้รัศมี `0 22px 22px 0` — โค้งเฉพาะด้านขวา
ทำให้แถบที่ active ดูเหมือนรางที่ยื่นออกมาจากขอบจอ ไม่ใช่ปุ่มที่ลอยอยู่กลางแถบ
นี่คือลายเซ็นของ HOP ห้ามแทนด้วยสี่เหลี่ยมมุมโค้งเท่ากันทุกด้าน

**กฎสิบหรือสิบสอง (The 10-or-12 Rule).** รัศมีใหม่ต้องเป็น 10px หรือ 12px เว้นแต่เป็น pill หรือวงกลม
ปัจจุบันระบบมีรัศมีปนกันถึง 12 ค่า — นั่นคือหนี้ ไม่ใช่แบบแผนที่ต้องทำตาม

## Components

### Buttons
- **Shape:** มุมโค้งปานกลาง (12px, `var(--radius)`) · สูงพอดีนิ้ว (`padding: 7px 16px`, font 14px/500)
- **Default:** พื้นขาว เส้นขอบ `line` ตัวอักษรสี `ink` เงา hairline — ปุ่มปกติดูเหมือนพื้นผิว ไม่ใช่การกระทำ
- **Hover:** พื้น `ink-violet-tint` เส้นขอบและตัวอักษรเปลี่ยนเป็นม่วงหมึก (transition 0.12s)
- **Primary:** พื้นม่วงหมึกเต็ม ตัวอักษรขาว · hover ลงเป็น `ink-violet-deep`
- **Danger:** ตัวอักษรแดง เส้นขอบ `#f3c6c2` · hover พื้น `danger-subtle` — ไม่เคยแดงเต็มปุ่ม
- **Ghost:** โปร่งใสไม่มีเส้นไม่มีเงา ใช้บน landing เป็นหลัก
- **sm:** `padding: 4px 12px`, font 13px · **Disabled:** `opacity: 0.55`
- **Focus:** `outline: 2px solid var(--ink-violet)` ที่ `outline-offset: 2px` — มองเห็นชัดเสมอ ห้ามถอด

### Chips
- **`.chip-toggle` (ตัวกรองที่กดได้):** pill 20px พื้นขาวเส้นขอบ `line` · hover เปลี่ยนขอบ+ตัวอักษรเป็นม่วง ·
  **`.on` = พื้นม่วงหมึกเต็ม ตัวอักษรขาว** — สถานะเลือกอ่านออกจากระยะไกล
- **`.chip` (ป้ายอ่านอย่างเดียว):** พื้น `ink-violet-subtle` เส้นขอบ `#e5daf9` ตัวอักษรม่วง padding เล็ก (2px 10px)
- **`.status-pill`:** 12px/700 พื้น `danger-subtle` ตัวอักษรแดงเป็นค่าเริ่มต้น · `.on` สลับเป็นคู่เขียว

### Cards / Containers
- **Corner:** 12px (`var(--radius)`) · **Background:** `surface` · **Border:** 1px `line`
- **Shadow:** hairline ตอนพัก เท่านั้น (ดู Elevation & Depth)
- **Padding:** 12–14px สำหรับ tile · 30px 28px สำหรับการ์ดล็อกอิน
- **`.prop-row` (แถวทรัพย์):** เป็นการ์ดที่กดได้ — hover ยกด้วย `translateY(-1px)` + เงา lifted
  และเปลี่ยนสีขอบเป็น `#d8dbe0` ไม่ใช่เป็นม่วง เพราะการชี้ยังไม่ใช่การเลือก

### Inputs / Fields
- **Style:** พื้นขาว เส้นขอบ 1px `line` รัศมี 10px `padding: 9px 12px` font 14px สืบทอดฟอนต์จาก body
- **Focus:** ขอบเปลี่ยนเป็นม่วงหมึก + `box-shadow: 0 0 0 3px rgba(113, 50, 245, 0.12)` — วงแหวนจาง ไม่ใช่เงา
- **Select:** ถอดลูกศรของระบบแล้ววาดใหม่เป็น SVG chevron สี `muted` ที่ขวา 12px
- **Textarea:** `min-height: 70px`, `resize: vertical` เท่านั้น
- **Label:** อยู่เหนือช่องเสมอ 13px สี `muted` · ดอกจันบังคับเป็นสี `danger`
- **ช่องค้นหาบน topbar:** ต่างจากช่องอื่น — พื้น `bg` (ไม่ใช่ขาว) เพื่อให้จมลงไปในแถบ

### Navigation
- **Sidebar (≥721px):** กว้าง 190px พื้นขาว เส้นขอบขวา 1px · ลิงก์ `padding: 10px 18px` font 14px
  รัศมี `0 22px 22px 0` พร้อม `margin-right: 10px`
  **active** = พื้น `ink-violet-subtle` ตัวอักษรและไอคอนม่วงหมึก น้ำหนัก 600 · **hover** = พื้น `ink-violet-tint`
  ไอคอนตอนไม่ active เป็นสี `muted` — ไอคอนติดตามสีข้อความเสมอ
- **Topbar:** พื้นขาว เส้นล่าง 1px · แบรนด์ 18px/700 ที่มี `.brand-accent` เป็นม่วงหมึก
- **≤720px:** sidebar กลายเป็นแถบล่าง และป้ายเมนูสลับไปใช้ข้อความสั้น (`.nav-sm`)
- **Landing topbar:** ต่างจากแอป — sticky โปร่งแสง `rgba(250,249,246,0.72)` +
  `backdrop-filter: saturate(1.4) blur(14px)` และเส้นล่างโผล่มาเมื่อ `.scrolled`

### Stat Tile (ลายเซ็นบน dashboard)
พื้นขาว การ์ด 12px padding `12px 14px` · label 12px `muted` → ตัวเลข 26px/700 ที่ ls -0.6px →
คำอธิบาย 11.5px `muted` · มี sparkline วางลอยมุมขวาล่าง (`position: absolute; right: 10px; bottom: 10px`)
ตัวเลขตัดด้วย ellipsis ไม่ขึ้นบรรทัดใหม่ — ไทล์ต้องสูงเท่ากันทั้งแถวเสมอ

## Do's and Don'ts

### Do:
- **Do** ใช้เส้นขอบ 1px `#e5e7eb` เป็นตัวแยกพื้นผิว และเก็บเงาไว้ให้ hover/overlay เท่านั้น
- **Do** ให้ม่วงหมึกหมายถึง "สิ่งที่กำลังทำหรือต้องทำต่อ" เสมอ และเก็บไว้ไม่เกิน ~10% ของหน้าจอ
- **Do** เขียน body ที่ 14px และดันลำดับชั้นด้วยน้ำหนัก 600/700 แทนการเพิ่มขนาด
- **Do** ให้ line-height ของเนื้อความไทยไม่ต่ำกว่า 1.5 และทดสอบด้วยชื่อทรัพย์ที่ยาวจริง
- **Do** คงวงแหวน focus `outline: 2px solid` ที่ offset 2px บนทุกอย่างที่กดได้
- **Do** ใช้รัศมี 10px หรือ 12px สำหรับของใหม่ และ pill (20px/999px) สำหรับ chip เท่านั้น
- **Do** ออกแบบจุดตัด 720px ให้จริง: sidebar → แถบล่าง, ตาราง → การ์ด

### Don't:
- **Don't** ทำให้ HOP ดูเหมือนเว็บอสังหาฯ ไทยทั่วไป — ไม่มีแบนเนอร์โปรโมชั่น ไม่มีกรอบรูปหนา
  ไม่มีสีแดง/ส้ม/ทองเพื่อเรียกความสนใจ
- **Don't** ทำให้ดูเหมือน SaaS ฝรั่งทั่วไป — ไม่มี gradient ม่วง-ฟ้าเป็นพื้นใหญ่ ไม่มีการ์ดลอยเงาฟุ้ง
  ไม่มีไอคอนเส้นบางลอยกลางที่ว่าง
- **Don't** ใช้ `text-transform: uppercase` กับข้อความไทย
- **Don't** ใช้แดงหรือเขียวเพื่อจัดหมวดหมู่หรือตกแต่ง — สองสีนี้พูดได้เฉพาะเรื่องผิดพลาดกับเรื่องสำเร็จ
- **Don't** เพิ่มรัศมีค่าใหม่เข้าระบบ (ตอนนี้มีปนกัน 12 ค่าแล้ว — นั่นคือหนี้)
- **Don't** ใส่ `display: flex` บน `td` ของ `.data-table` บนจอใหญ่ — ทำตารางพังและปุ่มหลุดนอกการ์ด
- **Don't** ย้าย token ชุด `.landing` ไปรวมกับชุดแอป หรือกลับกัน โดยไม่ถามเจ้าของก่อน
