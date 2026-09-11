import { supabase } from './supabase'
import { API_BASE } from './native'
import { parseLatLng, roundLatLng, type LatLng } from './latlng'

// แกะพิกัดจากลิงก์/ข้อความที่ผู้ใช้กรอกในฟอร์ม
//  • ลิงก์เต็ม / "lat, lng" → แกะที่ browser ทันที (parseLatLng)
//  • ลิงก์ย่อ maps.app.goo.gl (ไม่มีพิกัดในตัวลิงก์) → ให้ /api/resolve-latlng กางให้
export async function resolveMapUrl(input: string): Promise<LatLng | null> {
  const s = (input || '').trim()
  if (!s) return null

  const local = parseLatLng(s)
  if (local) return roundLatLng(local)

  // ไม่ใช่ลิงก์ → แกะเองไม่ได้และ server ก็ช่วยไม่ได้
  if (!/^https?:\/\//i.test(s)) return null

  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return null
    const res = await fetch(`${API_BASE}/api/resolve-latlng`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url: s }),
    })
    if (!res.ok) return null
    const j = (await res.json().catch(() => null)) as { lat: number | null; lng: number | null } | null
    return j && typeof j.lat === 'number' && typeof j.lng === 'number' ? { lat: j.lat, lng: j.lng } : null
  } catch {
    return null
  }
}
