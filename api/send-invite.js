// Vercel Serverless Function — สร้างคำเชิญลูกทีม + ส่งอีเมลเชิญอัตโนมัติ (Resend)
// - ตรวจสิทธิ์ + สร้างคำเชิญผ่าน RPC create_team_invite (ตรวจ admin/ลิมิตในตัว)
// - ส่งอีเมลผ่าน Resend ถ้าตั้ง RESEND_API_KEY ไว้ · ไม่ได้ตั้ง → คืนลิงก์ให้คัดลอกส่งเอง (emailed:false)
// ⚠️ ส่งอีเมลจริงต้องตั้ง INVITE_FROM เป็นอีเมลบนโดเมนที่ verify กับ Resend แล้ว
//    (ไม่ตั้ง = ใช้ onboarding@resend.dev ซึ่งส่งได้เฉพาะอีเมลเจ้าของบัญชี Resend — ไว้ทดสอบ)

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
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const email = String(req.body?.email ?? '').trim()
  if (!url || !anonKey) return res.status(500).json({ error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า Supabase' })
  if (!token) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' })
  if (!email) return res.status(400).json({ error: 'ต้องระบุอีเมล' })

  const auth = { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // 1) สร้างคำเชิญผ่าน RPC (ตรวจ admin + ลิมิต Free ในตัว) → คืน token
  let inviteToken
  try {
    const r = await fetch(`${url}/rest/v1/rpc/create_team_invite`, {
      method: 'POST', headers: auth, body: JSON.stringify({ p_email: email }),
    })
    const out = await r.json().catch(() => null)
    if (!r.ok) return res.status(400).json({ error: (out && (out.message || out.hint)) || 'สร้างคำเชิญไม่สำเร็จ' })
    inviteToken = typeof out === 'string' ? out : out?.token
  } catch {
    return res.status(502).json({ error: 'สร้างคำเชิญไม่สำเร็จ' })
  }
  if (!inviteToken) return res.status(500).json({ error: 'ไม่ได้รับรหัสคำเชิญ' })

  const webBase = process.env.INVITE_WEB_BASE || 'https://hob-alpha.vercel.app'
  const link = `${webBase}/#/login?invite=${inviteToken}`

  // ชื่อองค์กร (ใส่ในอีเมล)
  let orgName = 'องค์กร'
  try {
    const ir = await fetch(`${url}/rest/v1/rpc/invite_info`, {
      method: 'POST', headers: auth, body: JSON.stringify({ p_token: inviteToken }),
    })
    const info = ((await ir.json().catch(() => [])) || [])[0]
    if (info?.org_name) orgName = info.org_name
  } catch { /* ไม่มีชื่อก็ใช้ค่า default */ }

  // 2) ส่งอีเมลผ่าน Resend (ถ้าตั้งค่าไว้)
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return res.status(200).json({ ok: true, link, emailed: false, reason: 'no_resend' })

  const from = process.env.INVITE_FROM || 'HOP <onboarding@resend.dev>'
  const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))
  const html = `<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#101114;max-width:480px">
    <h2 style="margin:0 0 8px">คุณได้รับเชิญเข้าร่วม ${esc(orgName)}</h2>
    <p style="color:#555">เข้าร่วมเป็นลูกทีมบน <b>HOP</b> — สมัครหรือเข้าสู่ระบบด้วยอีเมล <b>${esc(email)}</b> แล้วกดยอมรับได้เลย</p>
    <p style="margin:22px 0"><a href="${link}" style="display:inline-block;background:#7132f5;color:#fff;padding:11px 22px;border-radius:9px;text-decoration:none;font-weight:600">เข้าร่วม ${esc(orgName)}</a></p>
    <p style="color:#999;font-size:12.5px">หรือเปิดลิงก์นี้: <br>${esc(link)}</p>
  </div>`
  try {
    const er = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: `คำเชิญเข้าร่วม ${orgName} บน HOP`, html }),
    })
    const eout = await er.json().catch(() => ({}))
    if (!er.ok) {
      return res.status(200).json({ ok: true, link, emailed: false, reason: eout?.message || `resend ${er.status}` })
    }
    return res.status(200).json({ ok: true, link, emailed: true })
  } catch {
    return res.status(200).json({ ok: true, link, emailed: false, reason: 'resend_error' })
  }
}
