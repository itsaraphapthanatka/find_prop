// Vercel Serverless Function — ยอดสมัครใช้งานแบบสาธารณะ (หน้า /stats ไม่ต้องล็อกอิน)
//
// ทำไมต้องผ่าน API ไม่ให้หน้าเว็บยิง Supabase ตรงๆ:
//   1) ไม่ต้องฝังคีย์ใดๆ ในไฟล์ /stats.html
//   2) แคชที่ CDN ได้ (s-maxage) — คนกดรีเฟรชรัวๆ ก็ไม่ถึงฐานข้อมูล
//   3) ถ้าจะเปลี่ยน/ปิดตัวเลขภายหลัง แก้ที่นี่ที่เดียว
//
// ข้อมูลที่คืน = ผลรวมเท่านั้น (ดู supabase/public-stats.sql — RPC บังคับอีกชั้นว่าคืนแค่ตัวเลข)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return res.status(500).json({ error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า Supabase' })
  }

  try {
    const r = await fetch(`${url}/rest/v1/rpc/public_signup_stats`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    const data = await r.json().catch(() => null)
    if (!r.ok) {
      // ยังไม่ได้รัน supabase/public-stats.sql → บอกให้ชัด ไม่ใช่ 500 เปล่าๆ
      const missing = String(data?.code) === 'PGRST202'
      return res.status(missing ? 501 : 502).json({
        error: missing ? 'ยังไม่ได้ติดตั้งฟีเจอร์นี้ (รัน supabase/public-stats.sql)' : 'อ่านตัวเลขไม่สำเร็จ',
      })
    }
    // แคช 5 นาทีที่ CDN · ระหว่างรอค่าใหม่ยังเสิร์ฟค่าเดิมได้ 1 ชม. (ไม่ล่มแม้ DB ช้า)
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
    return res.status(200).json(data)
  } catch {
    return res.status(502).json({ error: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' })
  }
}
