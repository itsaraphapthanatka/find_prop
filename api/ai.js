// Vercel Serverless Function — proxy ไปยัง LLM API
// เหตุผลที่ต้อง proxy: API key ห้ามอยู่ฝั่ง client (bundle เปิดอ่านได้) จึงเก็บใน
// env ฝั่งเซิร์ฟเวอร์ (AI_API_KEY — ไม่มี prefix VITE_) และก่อน forward จะตรวจว่า
// ผู้เรียกเป็นผู้ใช้ที่ล็อกอินกับ Supabase ของแอปจริง กันคนนอกยืมใช้ LLM ฟรี

const MAX_BODY_CHARS = 120_000

export default async function handler(req, res) {
  // ── CORS: ให้แอปมือถือ (Capacitor) และ dev server เรียกข้ามโดเมนได้ ──
  // เว็บจริงเรียก same-origin อยู่แล้วจึงไม่ต้องอยู่ในรายการ / ความปลอดภัยจริงอยู่ที่
  // การตรวจ Supabase token ด้านล่าง — CORS แค่บอกเบราว์เซอร์ว่า origin ไหนคุยได้
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.AI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ยังไม่ได้ตั้งค่า AI_API_KEY ใน Vercel Environment Variables' })
  }

  // ── ตรวจว่าเป็นผู้ใช้ที่ล็อกอินจริง (ส่ง Supabase access token มาใน Authorization) ──
  const supaUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!supaUrl || !anonKey || !token) {
    return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อนใช้งาน AI' })
  }
  const svcAuth = { apikey: anonKey, Authorization: `Bearer ${token}` }
  let uid
  try {
    const userRes = await fetch(`${supaUrl}/auth/v1/user`, { headers: svcAuth })
    if (!userRes.ok) return res.status(401).json({ error: 'เซสชันไม่ถูกต้อง — กรุณาเข้าสู่ระบบใหม่' })
    uid = (await userRes.json())?.id
  } catch {
    return res.status(502).json({ error: 'ตรวจสอบเซสชันไม่สำเร็จ' })
  }

  // ── AI เป็นฟีเจอร์ Pro — เช็กแพ็กเกจองค์กรของผู้เรียก (super โหมดภาพรวมผ่านเสมอ) ──
  try {
    const pRes = await fetch(
      `${supaUrl}/rest/v1/profiles?id=eq.${uid}&select=is_super,org_id,impersonate_org_id`,
      { headers: svcAuth },
    )
    const prof = ((await pRes.json().catch(() => [])) || [])[0]
    const superOverview = prof?.is_super === true && !prof?.impersonate_org_id
    if (!superOverview) {
      const orgId = (prof?.is_super ? prof?.impersonate_org_id : null) || prof?.org_id
      let pro = false
      if (orgId) {
        const oRes = await fetch(`${supaUrl}/rest/v1/organizations?id=eq.${orgId}&select=plan`, { headers: svcAuth })
        const org = ((await oRes.json().catch(() => [])) || [])[0]
        pro = org?.plan === 'pro' || org?.plan === 'enterprise'
      }
      if (!pro) {
        return res.status(403).json({ error: 'ฟีเจอร์ AI เปิดใช้เฉพาะแพ็กเกจ Pro — อัปเกรดเพื่อใช้งาน' })
      }
    }
  } catch {
    return res.status(502).json({ error: 'ตรวจสอบแพ็กเกจไม่สำเร็จ' })
  }

  // ── ตรวจรูปแบบคำขอ ──
  const { messages, temperature } = req.body ?? {}
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages ไม่ถูกต้อง' })
  }
  const totalChars = messages.reduce((n, m) => n + String(m?.content ?? '').length, 0)
  if (totalChars > MAX_BODY_CHARS) {
    return res.status(400).json({ error: 'ข้อความยาวเกินไป' })
  }

  // ── forward ไปยัง LLM ──
  try {
    const upstream = await fetch(
      process.env.AI_API_URL || 'https://consoletoken.aunjai.org/api/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'gemma-4-12b',
          messages: messages.map((m) => ({ role: m.role, content: String(m.content ?? '') })),
          temperature: typeof temperature === 'number' ? temperature : 0.2,
          // เพดานความยาวคำตอบ — decode คือคอขวดของเซิร์ฟเวอร์ ถ้าปล่อยยาวไม่จำกัด
          // คำตอบเดียวที่เพี้ยนจะกินคิวของทุกคน (คำตอบ JSON ปกติ < 500 token)
          max_tokens: 800,
        }),
      },
    )
    const data = await upstream.json().catch(() => null)
    const content = data?.choices?.[0]?.message?.content
    if (!upstream.ok || typeof content !== 'string') {
      return res
        .status(upstream.ok ? 502 : upstream.status)
        .json({ error: data?.error?.message || `AI ตอบกลับผิดพลาด (${upstream.status})` })
    }
    return res.status(200).json({ content })
  } catch {
    return res.status(502).json({ error: 'เชื่อมต่อบริการ AI ไม่สำเร็จ' })
  }
}
