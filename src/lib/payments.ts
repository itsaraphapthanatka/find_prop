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

// 'test' = แพ็กเกจทดสอบ ฿1 (ได้สิทธิ์ Basic ระดับ 100 หนึ่งเดือน) — ⚠️ ปิดสวิตช์ก่อนเปิดใช้จริง
// 'starter' = แพ็ก Basic (คีย์เดิมใน DB — เปลี่ยนเฉพาะชื่อที่แสดง)
export type PlanKey = 'starter' | 'pro' | 'test'
/** ระดับแพ็กเกจ = โควตาทรัพย์สูงสุด · เกิน 500 = Enterprise (คุยกับทีมงาน) */
export type Tier = 100 | 250 | 500
export const TIERS: Tier[] = [100, 250, 500]

// ── ราคาแพ็กเกจ — super admin ตั้งได้จากหน้า Super Admin (ตาราง plan_prices: plan × tier) ──
export interface PlanPrice { monthly: number; yearly: number }
export type PlanPrices = Record<'starter' | 'pro', Record<Tier, PlanPrice>>
// fallback ถ้าตารางยังไม่ถูกสร้าง/โหลดไม่สำเร็จ — ต้องตรงกับ api/_lib/prices.js (รายปี = ลด 15%)
export const DEFAULT_PRICES: PlanPrices = {
  starter: {
    100: { monthly: 590, yearly: 6018 },
    250: { monthly: 790, yearly: 8058 },
    500: { monthly: 990, yearly: 10098 },
  },
  pro: {
    100: { monthly: 1190, yearly: 12138 },
    250: { monthly: 1390, yearly: 14178 },
    500: { monthly: 1590, yearly: 16218 },
  },
}

/** สวิตช์แพ็กเกจทดสอบ ฿1 (app_settings 'payment_test') — super เปิด-ปิดได้ · อ่านพลาด = ปิด */
export async function fetchPaymentTestEnabled(): Promise<boolean> {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'payment_test').maybeSingle()
    let v: unknown = data?.value ?? null
    if (typeof v === 'string') {
      try { v = JSON.parse(v) } catch { return false }
    }
    return Boolean(v && typeof v === 'object' && (v as { enabled?: boolean }).enabled === true)
  } catch {
    return false
  }
}

/** โหลดราคาจริงจาก DB — ไม่ throw (ใช้ fallback แทน) เพื่อไม่ให้หน้าราคาพังเพราะเน็ต/ตารางยังไม่มี */
export async function fetchPlanPrices(): Promise<PlanPrices> {
  const out: PlanPrices = JSON.parse(JSON.stringify(DEFAULT_PRICES)) as PlanPrices
  try {
    const { data } = await supabase.from('plan_prices').select('plan,tier,monthly,yearly')
    for (const r of data ?? []) {
      const key = r.plan as keyof PlanPrices
      const tier = Number(r.tier ?? 500) as Tier // แถวยุคก่อนมี tier = ระดับ 500
      if (out[key]?.[tier] && Number(r.monthly) > 0 && Number(r.yearly) > 0) {
        out[key][tier] = { monthly: Number(r.monthly), yearly: Number(r.yearly) }
      }
    }
    return out
  } catch {
    return out
  }
}

/** สร้างรายการชำระเงิน → คืน checkout_url ให้พาผู้ใช้ไปจ่าย (ยอดเงินคำนวณฝั่งเซิร์ฟเวอร์) */
export function createCharge(plan: PlanKey, tier: Tier, cycle: 'monthly' | 'yearly'): Promise<Charge> {
  return authedPost<Charge>('create-charge', { plan, tier, cycle })
}

/** ถามเซิร์ฟเวอร์ว่าจ่ายแล้วหรือยัง (เซิร์ฟเวอร์ยืนยันกับ PunPay + อัปเกรดให้ถ้าจ่ายจริง) */
export function verifyCharge(chargeId: string): Promise<VerifyResult> {
  return authedPost<VerifyResult>('verify-charge', { charge_id: chargeId })
}
