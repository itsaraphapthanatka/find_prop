import { supabase } from './supabase'
import { API_BASE } from './native'

// เติมพิกัด lat/lng จาก map_url ผ่าน serverless /api/backfill-latlng
// (เซิร์ฟเวอร์กางลิงก์ย่อ maps.app.goo.gl ให้ก่อนแกะพิกัด — browser ทำเองไม่ได้)
// ทำเป็นชุด (cursor + done) แล้ววนเรียกจนจบ กัน serverless timeout

export interface BackfillTotals {
  scanned: number
  filled: number
  unresolved: number
}

interface BackfillBatch extends BackfillTotals {
  done: boolean
  next_after: string
}

async function backfillBatch(after: string): Promise<BackfillBatch> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('ต้องเข้าสู่ระบบก่อน')
  const res = await fetch(`${API_BASE}/api/backfill-latlng`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ after }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error || `เกิดข้อผิดพลาด (${res.status})`)
  return json as BackfillBatch
}

/** วนเติมพิกัดทั้งองค์กรจนจบ — onProgress รายงานยอดสะสมหลังจบแต่ละชุด */
export async function runLatLngBackfill(onProgress?: (t: BackfillTotals) => void): Promise<BackfillTotals> {
  const total: BackfillTotals = { scanned: 0, filled: 0, unresolved: 0 }
  let after = ''
  for (let guard = 0; guard < 2000; guard++) {
    const b = await backfillBatch(after)
    total.scanned += b.scanned
    total.filled += b.filled
    total.unresolved += b.unresolved
    onProgress?.(total)
    if (b.done) break
    if (!b.next_after || b.next_after === after) break // cursor ไม่ขยับ = จบ (กันวนไม่รู้จบ)
    after = b.next_after
  }
  return total
}
