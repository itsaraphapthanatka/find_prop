// Vercel Serverless Function — สร้างบัญชีลูกทีมฝั่งเซิร์ฟเวอร์
// ใช้ service-role admin API สร้าง user แบบ email_confirm:true → ไม่ส่งอีเมลยืนยัน
// จึงไม่ติด "email rate limit" ของ SMTP ในตัว Supabase และลูกทีมล็อกอินได้ทันที
// ความปลอดภัย: ตรวจว่าผู้เรียกเป็นแอดมิน/super จริง แล้วดึงเข้า "องค์กรของผู้เรียก" เท่านั้น

export default async function handler(req, res) {
  const ALLOWED_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost:5173']
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน Vercel Environment Variables' })
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const { email, password, full_name } = req.body ?? {}
  const mail = String(email ?? '').trim()
  const name = String(full_name ?? '').trim()
  if (!token) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' })
  if (!mail || !password) return res.status(400).json({ error: 'ต้องมีอีเมลและรหัสผ่าน' })
  if (String(password).length < 6) return res.status(400).json({ error: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร' })

  const svc = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

  // 1) ยืนยันผู้เรียก (แอดมิน/super) + หา org ปลายทาง
  let callerId
  try {
    const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } })
    if (!u.ok) return res.status(401).json({ error: 'เซสชันไม่ถูกต้อง — เข้าสู่ระบบใหม่' })
    callerId = (await u.json())?.id
  } catch {
    return res.status(502).json({ error: 'ตรวจสอบเซสชันไม่สำเร็จ' })
  }
  if (!callerId) return res.status(401).json({ error: 'เซสชันไม่ถูกต้อง' })

  const profRes = await fetch(
    `${url}/rest/v1/profiles?id=eq.${callerId}&select=role,org_id,is_super,impersonate_org_id,active`,
    { headers: svc },
  )
  const caller = ((await profRes.json().catch(() => [])) || [])[0]
  if (!caller) return res.status(403).json({ error: 'ไม่พบโปรไฟล์ผู้เรียก' })
  const isSuper = caller.is_super === true
  const isAdmin = caller.role === 'admin' && caller.active === true
  if (!isSuper && !isAdmin) return res.status(403).json({ error: 'เฉพาะแอดมินเท่านั้นที่เพิ่มลูกทีมได้' })
  const targetOrg = (isSuper ? caller.impersonate_org_id : null) || caller.org_id
  if (!targetOrg) return res.status(400).json({ error: 'ยังไม่ได้เลือกองค์กร (super ต้องสวมสิทธิ์องค์กรก่อน)' })

  // แพ็กเกจ Free จำกัดลูกทีม 2 คน (super ไม่ติดลิมิต) — บังคับก่อนสร้างบัญชี
  if (!isSuper) {
    const oRes = await fetch(`${url}/rest/v1/organizations?id=eq.${targetOrg}&select=plan`, { headers: svc })
    const orgRow = ((await oRes.json().catch(() => [])) || [])[0]
    const pro = orgRow?.plan === 'pro' || orgRow?.plan === 'enterprise'
    if (!pro) {
      const mRes = await fetch(`${url}/rest/v1/profiles?org_id=eq.${targetOrg}&select=id`, { headers: svc })
      const members = (await mRes.json().catch(() => [])) || []
      if (members.length >= 2) {
        return res.status(403).json({
          error: 'แพ็กเกจ Free มีลูกทีมได้สูงสุด 2 คน — อัปเกรดเป็น Pro เพื่อเพิ่มได้ไม่จำกัด',
        })
      }
    }
  }

  // 2) สร้าง user (ยืนยันอีเมลเลย — ไม่ส่งอีเมล ไม่ติด rate limit)
  const createRes = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { ...svc, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: mail, password, email_confirm: true, user_metadata: { full_name: name } }),
  })
  const created = await createRes.json().catch(() => null)
  if (!createRes.ok) {
    const msg = created?.msg || created?.error_description || created?.error || `สร้างบัญชีไม่สำเร็จ (${createRes.status})`
    return res.status(400).json({ error: /already|registered|exists/i.test(msg) ? 'อีเมลนี้ถูกใช้แล้ว' : msg })
  }
  const newId = created?.id
  if (!newId) return res.status(500).json({ error: 'สร้างบัญชีแล้วแต่ไม่ได้รหัสผู้ใช้' })

  // 3) ดึงเข้าองค์กร + เปิดใช้งาน (upsert กันเคส trigger ยังไม่ทันสร้างโปรไฟล์)
  const upRes = await fetch(`${url}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: newId, email: mail, full_name: name || null, org_id: targetOrg, active: true, role: 'member',
    }),
  })
  if (!upRes.ok) {
    const e = await upRes.text().catch(() => '')
    return res.status(500).json({ error: `สร้างบัญชีแล้วแต่ดึงเข้าองค์กรไม่สำเร็จ: ${e.slice(0, 200)}` })
  }

  return res.status(200).json({ ok: true, id: newId })
}
