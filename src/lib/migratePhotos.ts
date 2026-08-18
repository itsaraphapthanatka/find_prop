import { supabase } from './supabase'
import { API_BASE } from './native'

// ย้ายรูป migrated (ลิงก์ Drive ภายนอก) เข้าถังของระบบ — เรียก serverless /api/migrate-photos
// ทำเป็น "ชุด" (เซิร์ฟเวอร์คืน cursor + done) แล้ววนเรียกจนจบ กัน timeout ของ serverless

export interface MigrateBatch {
  done: boolean
  next_after: string
  scanned: number
  migrated_rows: number
  uploaded_images: number
  skipped_rows: number
  failed_images: number
}

export interface MigrateTotals {
  scanned: number
  migrated_rows: number
  uploaded_images: number
  skipped_rows: number
  failed_images: number
}

async function migrateBatch(after: string): Promise<MigrateBatch> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('ต้องเข้าสู่ระบบก่อน')
  const res = await fetch(`${API_BASE}/api/migrate-photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ after }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error || `เกิดข้อผิดพลาด (${res.status})`)
  return json as MigrateBatch
}

/**
 * วนย้ายรูปทั้งองค์กรจนจบ — เรียก onProgress หลังจบแต่ละชุดเพื่ออัปเดตตัวเลขให้ผู้ใช้เห็นความคืบหน้า
 * กันวนไม่รู้จบ: หยุดเมื่อ done หรือ cursor ไม่ขยับ (ป้องกันเคสเซิร์ฟเวอร์ส่ง next_after เดิม)
 */
export async function runPhotoMigration(onProgress?: (t: MigrateTotals) => void): Promise<MigrateTotals> {
  const total: MigrateTotals = { scanned: 0, migrated_rows: 0, uploaded_images: 0, skipped_rows: 0, failed_images: 0 }
  let after = ''
  for (let guard = 0; guard < 1000; guard++) {
    const b = await migrateBatch(after)
    total.scanned += b.scanned
    total.migrated_rows += b.migrated_rows
    total.uploaded_images += b.uploaded_images
    total.skipped_rows += b.skipped_rows
    total.failed_images += b.failed_images
    onProgress?.(total)
    if (b.done) break
    if (!b.next_after || b.next_after === after) break // cursor ไม่ขยับ = จบ (กันวนไม่รู้จบ)
    after = b.next_after
  }
  return total
}
