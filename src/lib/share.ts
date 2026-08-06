// ลิงก์แชร์ชอร์ตลิสต์ให้ลูกค้า (เปิดดูได้โดยไม่ต้องล็อกอิน)
// ตัวบังคับจริงอยู่ในฐานข้อมูล — supabase/shortlist-share.sql
//   · share_shortlist / unshare_shortlist  = เฉพาะผู้ล็อกอินที่แก้ชอร์ตลิสต์ชุดนั้นได้
//   · public_shortlist                     = anon เรียกได้ แต่ส่งกลับเฉพาะฟิลด์ในเอกสาร
import { useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from './supabase'
import type { Property, SharedItem } from '../types'

export interface ShareSetting {
  /** อายุลิงก์เริ่มต้น (วัน) */
  days: number
  /** เพดานที่นายหน้าตั้งได้ — super admin กำหนด · 0 = ปิดการแชร์ทั้งระบบ */
  maxDays: number
}

export const DEFAULT_SHARE: ShareSetting = { days: 14, maxDays: 90 }

/** ลิงก์ที่ส่งให้ลูกค้า — HashRouter จึงเป็น /#/share/<token> */
export function shareUrl(token: string): string {
  const base = typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}`
  return `${base.replace(/\/index\.html$/, '/')}#/share/${token}`
}

/** อ่านค่าตั้งอายุลิงก์ (super admin แก้ได้จากหน้า Super Admin) */
export async function fetchShareSetting(): Promise<ShareSetting> {
  if (!supabaseConfigured) return DEFAULT_SHARE
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'share').maybeSingle()
  const v = (data?.value ?? {}) as Partial<ShareSetting>
  return {
    days: Number.isFinite(Number(v.days)) ? Number(v.days) : DEFAULT_SHARE.days,
    maxDays: Number.isFinite(Number(v.maxDays)) ? Number(v.maxDays) : DEFAULT_SHARE.maxDays,
  }
}

export function useShareSetting(): ShareSetting {
  const [set, setSet] = useState<ShareSetting>(DEFAULT_SHARE)
  useEffect(() => {
    void fetchShareSetting().then(setSet)
  }, [])
  return set
}

export interface ShareResult {
  token: string
  expires_at: string
  days: number
  snapshot_at: string | null
}

/**
 * สร้าง/ต่ออายุลิงก์ — คืน token เดิมถ้าเคยแชร์แล้ว (ลิงก์ที่ส่งลูกค้าไปยังใช้ได้)
 * refresh = true คือสั่งอัปเดตราคาในลิงก์ให้ตรงปัจจุบัน · ปกติ (false) ราคาที่เสนอไว้จะไม่ถูกแตะ
 */
export async function shareShortlist(
  id: string, days?: number, refresh = false,
): Promise<{ data?: ShareResult; error?: string }> {
  const { data, error } = await supabase.rpc('share_shortlist', {
    p_id: id,
    p_days: days ?? null,
    p_refresh: refresh,
  })
  if (error) {
    return {
      error: error.message.includes('share_shortlist')
        ? 'ยังไม่ได้เปิดระบบลิงก์แชร์ — รัน supabase/shortlist-share.sql ใน SQL Editor ก่อน'
        : error.message,
    }
  }
  return { data: data as ShareResult }
}

export async function unshareShortlist(id: string): Promise<string | null> {
  const { error } = await supabase.rpc('unshare_shortlist', { p_id: id })
  return error ? error.message : null
}

/** จำนวนวันที่เหลือของลิงก์ (ติดลบ = หมดอายุแล้ว) */
export function daysLeft(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null
  const ms = new Date(expiresAt).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}

/** ฟิลด์ราคาที่ถือว่า "ข้อเสนอเปลี่ยน" ถ้าไม่ตรงกับสำเนาในลิงก์ */
const PRICE_FIELDS = ['rent_per_month', 'sale_price', 'price_per_sqm'] as const

/**
 * ราคาปัจจุบันต่างจากราคาที่ตรึงไว้ในลิงก์ไหม — คืนรหัสทรัพย์ที่ราคาไม่ตรง
 * (ทรัพย์ที่ยังโหลดไม่เสร็จ/ถูกลบ ไม่นับว่าเปลี่ยน — กันเตือนผิด)
 */
export function priceDrift(
  snapshot: SharedItem[] | null | undefined,
  live: Pick<Property, 'code' | 'rent_per_month' | 'sale_price' | 'price_per_sqm'>[],
): string[] {
  if (!snapshot?.length) return []
  const byCode = new Map(live.map((p) => [p.code, p]))
  return snapshot
    .filter((snap) => {
      const now = byCode.get(snap.code)
      if (!now) return false
      return PRICE_FIELDS.some((f) => (snap[f] ?? null) !== (now[f] ?? null))
    })
    .map((snap) => snap.code)
}
