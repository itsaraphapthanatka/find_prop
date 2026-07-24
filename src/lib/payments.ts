import { supabase } from './supabase'
import { API_BASE } from './native'

export interface Charge {
  charge_id: string
  checkout_url: string
  amount: number
  currency: string
  status: string
}
export interface VerifyResult {
  paid: boolean
  status?: string
  plan?: string
  applied?: boolean
  expires?: string | null
}

async function authedPost<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('ต้องเข้าสู่ระบบก่อน')
  const res = await fetch(`${API_BASE}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error || `เกิดข้อผิดพลาด (${res.status})`)
  return json as T
}

// 'test' = แพ็กเกจทดสอบ ฿1 (ได้สิทธิ์ 'เริ่มต้น' 1 เดือน) — ⚠️ ลบก่อนเปิดใช้จริง
export type PlanKey = 'starter' | 'pro' | 'test'

/** สร้างรายการชำระเงิน → คืน checkout_url ให้พาผู้ใช้ไปจ่าย (ยอดเงินคำนวณฝั่งเซิร์ฟเวอร์) */
export function createCharge(plan: PlanKey, cycle: 'monthly' | 'yearly'): Promise<Charge> {
  return authedPost<Charge>('create-charge', { plan, cycle })
}

/** ถามเซิร์ฟเวอร์ว่าจ่ายแล้วหรือยัง (เซิร์ฟเวอร์ยืนยันกับ PunPay + อัปเกรดให้ถ้าจ่ายจริง) */
export function verifyCharge(chargeId: string): Promise<VerifyResult> {
  return authedPost<VerifyResult>('verify-charge', { charge_id: chargeId })
}
