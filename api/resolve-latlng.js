// Vercel Serverless Function — แกะพิกัดจากลิงก์แผนที่ 1 ลิงก์ (ใช้ตอนกรอกฟอร์มลงทรัพย์)
//
// ทำไมต้องผ่านเซิร์ฟเวอร์: ลิงก์ย่อ Google Maps (maps.app.goo.gl) ไม่มีตัวเลขพิกัดในตัวลิงก์
//   ต้องยิงตามลิงก์ไปกางก่อน (browser ทำข้ามโดเมนไม่ได้ + ต้องใช้ UA ที่ไม่ใช่เบราว์เซอร์ — ดู _lib/latlng.js)
// ไม่แตะฐานข้อมูล → แค่ยืนยันว่าล็อกอินอยู่ (กันเปิดเป็น proxy สาธารณะ) ใช้ได้ทุกบทบาท

import { resolveToLatLng, round6 } from './_lib/latlng.js'

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
  if (!url || !anonKey || !token) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' })

  // ยืนยันเซสชัน (บทบาทใดก็ได้ — แค่ต้องล็อกอิน)
  try {
    const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } })
    if (!u.ok) return res.status(401).json({ error: 'เซสชันไม่ถูกต้อง — เข้าสู่ระบบใหม่' })
  } catch {
    return res.status(502).json({ error: 'ตรวจสอบเซสชันไม่สำเร็จ' })
  }

  const mapUrl = String((req.body || {}).url || '').trim()
  if (!mapUrl) return res.status(400).json({ error: 'ต้องมีลิงก์แผนที่' })

  const coord = await resolveToLatLng(mapUrl).catch(() => null)
  if (!coord) return res.status(200).json({ lat: null, lng: null })
  const { lat, lng } = round6(coord)
  return res.status(200).json({ lat, lng })
}
