// ตรวจคู่มือที่ขึ้น production — รัน: npm run test:docs
// เหตุผล: คู่มือลูกค้า (docs/TRAINING.html) เปิดได้จากเว็บจริง จึง "ห้ามบอกโครงสร้างภายใน"
// เช่นที่อยู่ไฟล์ในโปรเจกต์ ชื่อไฟล์ SQL ชื่อตาราง หรือ path ของโค้ด
import { readFileSync, existsSync, readdirSync } from 'node:fs'

const fails = []
let pass = 0
const check = (name, ok, extra = '') => (ok ? pass++ : fails.push(`${name}${extra ? ` [${extra}]` : ''}`))

/** ตัดบรรทัดรูป base64 ออก — ไม่ใช่ข้อความที่คนอ่าน และ pattern จะไปแมตช์มั่วในนั้น */
const textOf = (file) =>
  readFileSync(file, 'utf8').split('\n').filter((l) => !l.includes('base64')).join('\n')

// ── คำที่ห้ามมีในคู่มือ "ลูกค้า" (เปิดสาธารณะที่ /docs/training) ──
const LEAKS = [
  { re: /docs\/[A-Za-z_-]+\.html/, why: 'บอกที่อยู่ไฟล์คู่มือในโปรเจกต์' },
  { re: /\bsrc\/[a-z]/, why: 'บอก path ของซอร์สโค้ด' },
  { re: /supabase\/[a-z-]+\.sql/, why: 'บอกชื่อไฟล์ SQL' },
  { re: /\bapi\/[a-z-]+\.js/, why: 'บอกชื่อไฟล์ API' },
  { re: /scripts\/[a-z-]+\.mjs/, why: 'บอกชื่อไฟล์เทสต์' },
  { re: /properties_view|app_settings|memberships\b|member_areas/, why: 'บอกชื่อตาราง/วิวในฐานข้อมูล' },
  { re: /service[_ ]role|SUPABASE_[A-Z_]+|VITE_[A-Z_]+/, why: 'บอกชื่อคีย์/ตัวแปรลับ' },
  { re: /localhost:\d+/, why: 'ลิงก์เครื่อง dev' },
]

const CUSTOMER_DOC = 'docs/TRAINING.html'
check(`มีคู่มือลูกค้า (${CUSTOMER_DOC})`, existsSync(CUSTOMER_DOC))
if (existsSync(CUSTOMER_DOC)) {
  const t = textOf(CUSTOMER_DOC)
  for (const { re, why } of LEAKS) {
    const hit = t.match(re)
    check(`คู่มือลูกค้าไม่${why}`, !hit, hit?.[0])
  }
  check('คู่มือลูกค้ามี footer', /<footer>/.test(t))
  check('footer ไม่มีที่อยู่ไฟล์', !/ไฟล์นี้อยู่ที่/.test(t))
}

// ── เอกสารทีมงานก็ไม่ต้องบอกที่อยู่ไฟล์ (เปิดได้จากเว็บเหมือนกัน) ──
// แต่ยอมให้พูดถึง path/ตารางได้ เพราะเป็นเอกสารเชิงเทคนิคของทีม
const TEAM_DOC = 'docs/SYSTEM.html'
if (existsSync(TEAM_DOC)) {
  check('เอกสารทีมงานไม่บอกที่อยู่ไฟล์ตัวเอง', !/ไฟล์นี้อยู่ที่/.test(textOf(TEAM_DOC)))
}

// ── ทุกไฟล์ที่ขึ้น production ต้องเปิดได้ด้วย URL ที่ไม่มี .html ──
// (ชื่อไฟล์ต้องเป็นพิมพ์เล็กหลัง build + ต้องมี rewrite ใน vercel.json)
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
const rewrites = vercel.rewrites ?? []
for (const f of readdirSync('docs').filter((f) => f.endsWith('.html'))) {
  const slug = f.replace(/\.html$/i, '').toLowerCase()
  check(`มี rewrite ให้ /docs/${slug} (URL ไม่มี .html)`,
    rewrites.some((r) => r.source === `/docs/${slug}` && r.destination === `/docs/${slug}.html`))
}

if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass}):`)
  for (const f of fails) console.error(`   - ${f}`)
  process.exit(1)
}
console.log(`✅ คู่มือที่ขึ้น production: ผ่านทั้ง ${pass} ข้อ`)
