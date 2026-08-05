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

// คอนโซลของทีมงาน (เห็นทุกองค์กร/สวมสิทธิ์/ตั้งราคา) ไม่ควรอยู่ในเอกสารที่ส่ง "ลูกค้า"
// — เอกสารนักลงทุนพูดถึงได้ เพราะเป็นส่วนหนึ่งของการตรวจสอบธุรกิจ
const TEAM_ONLY = [
  { re: /Super ?Admin/i, why: 'พูดถึงคอนโซลทีมงาน (Super Admin)' },
  { re: /สวมสิทธิ์/, why: 'พูดถึงการสวมสิทธิ์องค์กรของทีมงาน' },
]

// เอกสารที่ส่งออกไปนอกทีมได้ — ห้ามบอกโครงสร้างภายในทุกฉบับ
// customerFacing = ห้ามพูดถึงคอนโซลทีมงานด้วย
const PUBLIC_DOCS = [
  { file: 'docs/TRAINING.html', name: 'คู่มือลูกค้า', customerFacing: true },
  { file: 'docs/FEATURES.html', name: 'เอกสารฟีเจอร์', customerFacing: true },
  { file: 'docs/INVESTOR.html', name: 'เอกสารนักลงทุน', customerFacing: false },
]
for (const { file, name, customerFacing } of PUBLIC_DOCS) {
  check(`มี${name} (${file})`, existsSync(file))
  if (!existsSync(file)) continue
  const t = textOf(file)
  for (const { re, why } of [...LEAKS, ...(customerFacing ? TEAM_ONLY : [])]) {
    const hit = t.match(re)
    check(`${name}ไม่${why}`, !hit, hit?.[0])
  }
  check(`${name}มี footer`, /<footer>/.test(t))
  check(`${name}: footer ไม่มีที่อยู่ไฟล์`, !/ไฟล์นี้อยู่ที่/.test(t))
  check(`${name}มีสารบัญ`, /class="toc"/.test(t))
}

// ── เอกสารนักลงทุน: ตัวเลขที่ยังไม่รู้ต้องขึ้นป้าย "กรอก" ไม่ใช่เขียนตัวเลขลอยๆ ──
// (การใส่ตัวเลขลูกค้า/รายได้ที่ไม่มีที่มา แล้วส่งให้นักลงทุน = ความเสี่ยงทางกฎหมาย)
if (existsSync('docs/INVESTOR.html')) {
  const t = textOf('docs/INVESTOR.html')
  check('เอกสารนักลงทุนมีคำเตือนให้กรอกตัวเลขจริงก่อนนำเสนอ', /ต้องกรอกด้วยตัวเลขจริงก่อนส่งให้นักลงทุน/.test(t))
  check('มีช่องรอกรอก (traction/ตลาด/เงินที่ระดม)', (t.match(/class="fill"/g) ?? []).length >= 15,
    String((t.match(/class="fill"/g) ?? []).length))
  check('ระบุว่าตัวเลขตลาดต้องมีแหล่งอ้างอิง', /แหล่งอ้างอิง/.test(t))
  check('ตัวเลขประสิทธิภาพระบุว่าวัดในสภาพแวดล้อมของเราเอง', /วัดในสภาพแวดล้อมของเราเอง/.test(t))
}

// ── เอกสารทีมงานก็ไม่ต้องบอกที่อยู่ไฟล์ (เปิดได้จากเว็บเหมือนกัน) ──
// แต่ยอมให้พูดถึง path/ตารางได้ เพราะเป็นเอกสารเชิงเทคนิคของทีม
const TEAM_DOC = 'docs/SYSTEM.html'
if (existsSync(TEAM_DOC)) {
  check('เอกสารทีมงานไม่บอกที่อยู่ไฟล์ตัวเอง', !/ไฟล์นี้อยู่ที่/.test(textOf(TEAM_DOC)))
}

// ── เอกสารภายใน: ต้องไม่ขึ้น production ──
// ต้องตรงกับ PRIVATE_DOCS ใน vite.config.ts (docsPlugin ไม่ก๊อปไฟล์กลุ่มนี้ไป dist)
const PRIVATE_DOCS = ['investor.html']
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
const rewrites = vercel.rewrites ?? []
const redirects = vercel.redirects ?? []
const viteCfg = readFileSync('vite.config.ts', 'utf8')

for (const f of PRIVATE_DOCS) {
  const slug = f.replace(/\.html$/i, '')
  check(`vite.config.ts กันไม่ให้ ${f} ขึ้น build`, viteCfg.includes(`'${f}'`))
  check(`ไม่มี rewrite ให้ /docs/${slug} (จะกลายเป็นเผยแพร่)`,
    !rewrites.some((r) => JSON.stringify(r).includes(slug)))
  check(`ไม่มี redirect ที่พาไป /docs/${slug}`,
    !redirects.some((r) => JSON.stringify(r).includes(slug)))
  // ถ้าเพิ่ง build ไว้ ต้องไม่มีไฟล์นี้ใน dist
  if (existsSync('dist/docs')) {
    check(`dist/docs ไม่มี ${slug}.html (ไม่ถูกเผยแพร่)`, !existsSync(`dist/docs/${slug}.html`))
  }
}

// ── เอกสารสาธารณะทุกไฟล์ต้องเปิดได้ด้วย URL ที่ไม่มี .html ──
// (ชื่อไฟล์ต้องเป็นพิมพ์เล็กหลัง build + ต้องมี rewrite ใน vercel.json)
for (const f of readdirSync('docs').filter((f) => f.endsWith('.html'))) {
  if (PRIVATE_DOCS.includes(f.toLowerCase())) continue
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
