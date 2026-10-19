// กุญแจถอดรหัสวิดีโอสอนใช้งาน (HLS AES-128) — ให้เฉพาะสมาชิกที่ล็อกอินและบัญชียังใช้งานอยู่
// ชิ้นวิดีโอใน /media/... เปิดสาธารณะได้เพราะเข้ารหัสไว้ทั้งหมด — ไม่มีกุญแจจากที่นี่ เอาลิงก์ไปเปิดที่อื่นก็เล่นไม่ได้
// กุญแจ 16 ไบต์ (hex) อยู่ใน env MEDIA_HLS_KEY บนเครื่องเท่านั้น — deploy/media-hls.sh สร้างและจดให้
import { cors, requireActiveUser } from './_lib/auth.js'

export default async function handler(req, res) {
  if (cors(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const hex = (process.env.MEDIA_HLS_KEY || '').trim()
  if (!/^[0-9a-f]{32}$/i.test(hex)) return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่าวิดีโอบนเซิร์ฟเวอร์' })

  const a = await requireActiveUser(req)
  if (!a.ok) return res.status(a.status).json({ error: a.error })

  res.setHeader('Cache-Control', 'no-store, private')
  res.setHeader('Content-Type', 'application/octet-stream')
  return res.status(200).send(Buffer.from(hex, 'hex'))
}
