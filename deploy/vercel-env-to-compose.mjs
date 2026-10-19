// แปลงไฟล์จาก `vercel env pull` → บรรทัด KEY='value' สำหรับ deploy/.env (docker compose env_file)
//   node deploy/vercel-env-to-compose.mjs <vercel.env> <deploy/.env.example>  > import.env
// stdout = เฉพาะบรรทัดที่นำเข้า · stderr = สรุปชื่อค่า (ไม่พิมพ์ค่าจริงเด็ดขาด)
//
// รูปแบบของ Vercel: KEY="value" โดย escape แค่ newline เป็น \n — ไม่ escape " และ \ ข้างใน
// จึงเอาข้อความระหว่าง =" ตัวแรกกับ " ตัวสุดท้ายแบบตรงตัว (ห้าม unescape — JSON ของ FCM มี \n ใน private_key อยู่แล้ว)
// แล้วครอบด้วย '...' ซึ่ง compose อ่านตรงตัว (ไม่แปล $ ไม่แปล \n)
import fs from 'node:fs'

// ค่าที่เป็นของเครื่องนี้ (ช่วง staging/ย้ายจริงตั้งต่างจาก Vercel) — ไม่ทับ
export const BOX_ONLY = new Set(['WEB_PORT', 'COMPOSE_PROFILES', 'CLOUDFLARE_TUNNEL_TOKEN', 'ENABLE_CRON', 'PUBLIC_APP_URL', 'INVITE_WEB_BASE'])

export function convert(vercelText, exampleText) {
  const wanted = new Set([...exampleText.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]).filter((k) => !BOX_ONLY.has(k)))
  const found = new Map()
  for (const line of vercelText.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (!m) continue
    let raw = m[2]
    if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1)
    found.set(m[1], raw)
  }
  const lines = [], imported = [], empty = [], manual = [], missing = []
  for (const key of wanted) {
    if (!found.has(key)) { missing.push(key); continue }
    const v = found.get(key)
    if (v === '') { empty.push(key); continue }
    if (v.includes("'") || v.includes('\r')) { manual.push(key); continue }
    if (v.trimStart().startsWith('{')) {
      try { JSON.parse(v) } catch { manual.push(key); continue } // JSON หลายบรรทัด → Vercel ทำให้กำกวม กรอกเองปลอดภัยกว่า
    }
    lines.push(`${key}='${v}'`)
    imported.push(key)
  }
  return { lines, imported, empty, manual, missing }
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  const [vercelFile, exampleFile] = process.argv.slice(2)
  if (!vercelFile || !exampleFile) { console.error('ใช้: node deploy/vercel-env-to-compose.mjs <vercel.env> <deploy/.env.example>'); process.exit(2) }
  const r = convert(fs.readFileSync(vercelFile, 'utf8'), fs.readFileSync(exampleFile, 'utf8'))
  process.stdout.write(r.lines.join('\n') + (r.lines.length ? '\n' : ''))
  const say = (icon, title, keys) => keys.length && console.error(`${icon} ${title}: ${keys.join(', ')}`)
  say('✅', 'นำเข้า', r.imported)
  say('⬜', 'ใน Vercel เป็นค่าว่าง (น่าจะตั้งเป็น Sensitive) — กรอกเองบนเครื่อง', r.empty)
  say('✍️', 'รูปแบบพิเศษ (มี \' หรือ JSON หลายบรรทัด) — กรอกเองบนเครื่อง', r.manual)
  say('➖', 'ไม่มีใน Vercel (ไม่ใช้ก็ปล่อยว่างได้)', r.missing)
  console.error(`ไม่ทับค่าของเครื่อง: ${[...BOX_ONLY].join(', ')}`)
  if (!r.lines.length) process.exit(1)
}
