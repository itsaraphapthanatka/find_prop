import { supabase } from './supabase'
import { API_BASE } from './native'

/** ผลของการกดสมัคร/เปลี่ยนแพ็กเกจ */
export interface CheckoutResult {
  /** หน้าที่ต้องพาผู้ใช้ไป (Stripe Checkout หรือหน้าใบแจ้งหนี้กรณีธนาคารขอยืนยันตัวตน) */
  url?: string | null
  /** Checkout Session id — แอปมือถือเก็บไว้ยืนยันตอนปิดหน้าจ่ายเงิน */
  id?: string
  /** เปลี่ยนแพ็กเกจ/จำนวนที่นั่งใน subscription เดิมสำเร็จแล้ว (ตัดบัตรส่วนต่างแล้ว) */
  updated?: boolean
  /** กลับมาต่ออายุอัตโนมัติ (เคยกดยกเลิกไว้) */
  resumed?: boolean
  /** ตัดบัตรส่วนต่างไม่ผ่าน — ต้องจ่ายผ่านหน้าใบแจ้งหนี้ (url) ก่อน */
  pending?: boolean
  error?: string
  kind?: 'plan' | 'seats'
  applied?: boolean
  expires?: string | null
}
export interface ConfirmResult {
  paid: boolean
  status?: string
  applied?: boolean
  expires?: string | null
  kind?: 'plan' | 'seats'
  qty?: number | null
}

async function authedPost<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('ต้องเข้าสู่ระบบก่อน')
  // ตัดที่ 25 วินาที — ถ้าเซิร์ฟเวอร์/Stripe ช้าผิดปกติ ให้ผู้ใช้เห็นข้อความแทนปุ่มค้างเงียบๆ
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25000)
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch (e) {
    throw new Error(e instanceof DOMException && e.name === 'AbortError'
      ? 'ระบบชำระเงินตอบช้าผิดปกติ — ลองใหม่อีกครั้งในอีกสักครู่'
      : 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองใหม่')
  } finally {
    clearTimeout(timer)
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    // แนบ detail จากเซิร์ฟเวอร์ด้วย (เช่น ข้อความ error จริงจากฐานข้อมูล) — ช่วยไล่ปัญหาการจ่ายเงิน
    const msg = json?.error || `เกิดข้อผิดพลาด (${res.status})`
    throw new Error(json?.detail ? `${msg} — ${json.detail}` : msg)
  }
  return json as T
}

// 'starter' = แพ็ก Basic (คีย์เดิมใน DB — เปลี่ยนเฉพาะชื่อที่แสดง)
export type PlanKey = 'starter' | 'pro'
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

// ── ที่นั่งทีม (app_settings 'seats') — ราคา + จำนวนที่นั่งต่อแพ็กเกจ (super admin ตั้งได้) ──
// ต้องตรงกับ plan_base_seats() ใน supabase/seats-config.sql และ api/_lib/seats.js
export const DEFAULT_SEAT_PRICE: PlanPrice = { monthly: 290, yearly: 2958 } // รายปี = ×12 ลด 15%
/** จำนวนที่นั่งที่แถมมากับแพ็กเกจ ต่อระดับโควตาทรัพย์ */
export interface SeatBase {
  free: number
  starter: Record<number, number>
  pro: Record<number, number>
}
export const DEFAULT_SEAT_BASE: SeatBase = {
  free: 1,
  starter: { 100: 3, 250: 5, 500: 10 },
  pro: { 100: 5, 250: 10, 500: 20 },
}
export interface SeatSetting extends PlanPrice { base: SeatBase }
export const DEFAULT_SEAT_SETTING: SeatSetting = { ...DEFAULT_SEAT_PRICE, base: DEFAULT_SEAT_BASE }
/** จำนวนที่นั่งที่ซื้อได้ในครั้งเดียว (ฝั่งเซิร์ฟเวอร์บังคับซ้ำ) */
export const MAX_SEAT_QTY = 50

/** โหลดตั้งค่าที่นั่ง (ราคา + โควตาต่อแพ็กเกจ) — ไม่ throw (อ่านพลาด = ใช้ค่ามาตรฐาน) */
export async function fetchSeatSetting(): Promise<SeatSetting> {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'seats').maybeSingle()
    let v: unknown = data?.value ?? null
    if (typeof v === 'string') {
      try { v = JSON.parse(v) } catch { return DEFAULT_SEAT_SETTING }
    }
    const p = v as { monthly?: number; yearly?: number; base?: Partial<SeatBase> } | null
    const monthly = Number(p?.monthly)
    const yearly = Number(p?.yearly)
    const num = (x: unknown, fallback: number) => (Number(x) >= 1 ? Number(x) : fallback)
    const tiers = (from: Record<string, unknown> | undefined, def: Record<number, number>) =>
      Object.fromEntries(TIERS.map((t) => [t, num(from?.[t], def[t])])) as Record<number, number>
    return {
      monthly: monthly > 0 ? monthly : DEFAULT_SEAT_PRICE.monthly,
      yearly: yearly > 0 ? yearly : DEFAULT_SEAT_PRICE.yearly,
      base: {
        free: num(p?.base?.free, DEFAULT_SEAT_BASE.free),
        starter: tiers(p?.base?.starter as Record<string, unknown> | undefined, DEFAULT_SEAT_BASE.starter),
        pro: tiers(p?.base?.pro as Record<string, unknown> | undefined, DEFAULT_SEAT_BASE.pro),
      },
    }
  } catch {
    return DEFAULT_SEAT_SETTING
  }
}

/** ราคาที่นั่งเพิ่มอย่างเดียว (ใช้ที่เดิม — ดึงจากตั้งค่าชุดเดียวกัน) */
export async function fetchSeatPrice(): Promise<PlanPrice> {
  const s = await fetchSeatSetting()
  return { monthly: s.monthly, yearly: s.yearly }
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

export type Cycle = 'monthly' | 'yearly'

// ── Stripe (subscription ตัดบัตรอัตโนมัติทุกรอบ) — ยอดเงินคำนวณฝั่งเซิร์ฟเวอร์เสมอ (api/stripe.js) ──

/** สมัคร/เปลี่ยนแพ็กเกจ — ยังไม่มี subscription = คืน url หน้า Stripe Checkout · มีแล้ว = เปลี่ยนในที่เดิม */
export function startCheckout(plan: PlanKey, tier: Tier, cycle: Cycle, native = false): Promise<CheckoutResult> {
  return authedPost<CheckoutResult>('stripe', { action: 'checkout', kind: 'plan', plan, tier, cycle, native })
}

/** ที่นั่งเพิ่ม — qty = จำนวนที่นั่งเพิ่ม "ทั้งหมด" ที่ต้องการ (subscription แยกจากแพ็กเกจ ปรับจำนวนได้) */
export function startSeatCheckout(qty: number, cycle: Cycle, native = false): Promise<CheckoutResult> {
  return authedPost<CheckoutResult>('stripe', { action: 'checkout', kind: 'seats', qty, cycle, native })
}

/** กลับจากหน้า Stripe Checkout → ให้เซิร์ฟเวอร์ยืนยันกับ Stripe + ให้สิทธิ์ทันที (ไม่ต้องรอ webhook) */
export function confirmCheckout(sessionId: string): Promise<ConfirmResult> {
  return authedPost<ConfirmResult>('stripe', { action: 'confirm', session_id: sessionId })
}

/** ดึงสถานะ subscription จริงจาก Stripe มาอัปเดตองค์กร — changed = ข้อมูลในระบบเปลี่ยน (ควรโหลดองค์กรใหม่) */
export function syncBilling(): Promise<{ changed: boolean }> {
  return authedPost<{ changed: boolean }>('stripe', { action: 'sync' })
}

/** ลิงก์ Stripe Customer Portal — เปลี่ยนบัตร / ดูใบเสร็จ / ยกเลิกการต่ออายุ */
export function openBillingPortal(native = false): Promise<{ url: string }> {
  return authedPost<{ url: string }>('stripe', { action: 'portal', native })
}
