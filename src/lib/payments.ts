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
  if (!res.ok) {
    // แนบ detail จากเซิร์ฟเวอร์ด้วย (เช่น ข้อความ error จริงจากฐานข้อมูล) — ช่วยไล่ปัญหาการจ่ายเงิน
    const msg = json?.error || `เกิดข้อผิดพลาด (${res.status})`
    throw new Error(json?.detail ? `${msg} — ${json.detail}` : msg)
  }
  return json as T
}

// 'test' = แพ็กเกจทดสอบ ฿1 (ได้สิทธิ์ 'เริ่มต้น' 1 เดือน) — ⚠️ ลบก่อนเปิดใช้จริง
export type PlanKey = 'starter' | 'pro' | 'test'

// ── ราคาแพ็กเกจ — super admin ตั้งได้จากหน้า Super Admin (ตาราง plan_prices) ──
export interface PlanPrice { monthly: number; yearly: number }
export type PlanPrices = Record<'starter' | 'pro', PlanPrice>
// fallback ถ้าตารางยังไม่ถูกสร้าง/โหลดไม่สำเร็จ — ต้องตรงกับ api/_lib/prices.js
export const DEFAULT_PRICES: PlanPrices = {
  starter: { monthly: 990, yearly: 10098 },
  pro: { monthly: 1290, yearly: 13158 },
}

/** โหลดราคาจริงจาก DB — ไม่ throw (ใช้ fallback แทน) เพื่อไม่ให้หน้าราคาพังเพราะเน็ต/ตารางยังไม่มี */
export async function fetchPlanPrices(): Promise<PlanPrices> {
  try {
    const { data } = await supabase.from('plan_prices').select('plan,monthly,yearly')
    const out: PlanPrices = {
      starter: { ...DEFAULT_PRICES.starter },
      pro: { ...DEFAULT_PRICES.pro },
    }
    for (const r of data ?? []) {
      const key = r.plan as keyof PlanPrices
      if (out[key] && Number(r.monthly) > 0 && Number(r.yearly) > 0) {
        out[key] = { monthly: Number(r.monthly), yearly: Number(r.yearly) }
      }
    }
    return out
  } catch {
    return DEFAULT_PRICES
  }
}

/** สร้างรายการชำระเงิน → คืน checkout_url ให้พาผู้ใช้ไปจ่าย (ยอดเงินคำนวณฝั่งเซิร์ฟเวอร์) */
export function createCharge(plan: PlanKey, cycle: 'monthly' | 'yearly'): Promise<Charge> {
  return authedPost<Charge>('create-charge', { plan, cycle })
}

/** ถามเซิร์ฟเวอร์ว่าจ่ายแล้วหรือยัง (เซิร์ฟเวอร์ยืนยันกับ PunPay + อัปเกรดให้ถ้าจ่ายจริง) */
export function verifyCharge(chargeId: string): Promise<VerifyResult> {
  return authedPost<VerifyResult>('verify-charge', { charge_id: chargeId })
}
