import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// ── โลโก้ระบบ (branding) ──
// super เปลี่ยนโลโก้ได้จากหน้า Super Admin: อัปโหลดรูปเข้า bucket 'branding' แล้วจดลิงก์ลง
// app_settings key 'branding' — ทุกหน้า (รวม landing ก่อนล็อกอิน) อ่านผ่าน useLogoUrl()
// logoUrl = null → ใช้โลโก้มาตรฐาน HOP เดิม · ต้องรัน supabase/branding.sql ก่อน

export const BRANDING_BUCKET = 'branding'

export interface BrandingSetting {
  /** ลิงก์รูปโลโก้ที่ super อัปโหลด (null = ใช้โลโก้มาตรฐาน) */
  logoUrl: string | null
}

let cached: BrandingSetting | null = null
let inflight: Promise<BrandingSetting> | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

/** อัปเดตค่าในเครื่องทันทีหลัง super บันทึก — ทุกจุดที่ใช้ useLogoUrl() เปลี่ยนตามเลย */
export function setLogoCache(logoUrl: string | null) {
  cached = { logoUrl }
  emit()
}

/** โหลดค่าโลโก้ — ไม่ throw (อ่านพลาด/ยังไม่ตั้ง = โลโก้มาตรฐาน) · แคชไว้เรียกซ้ำได้ถูกๆ */
export async function fetchBrandingSetting(): Promise<BrandingSetting> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'branding').maybeSingle()
      const v = (data?.value ?? null) as Partial<BrandingSetting> | null
      cached = { logoUrl: (v?.logoUrl ?? '').trim() || null }
    } catch {
      cached = { logoUrl: null }
    }
    emit()
    return cached
  })()
  return inflight
}

/** hook: ลิงก์โลโก้ที่ตั้งไว้ (null = ใช้โลโก้มาตรฐาน) — อัปเดตเองเมื่อ super เปลี่ยน */
export function useLogoUrl(): string | null {
  const [url, setUrl] = useState<string | null>(cached?.logoUrl ?? null)
  useEffect(() => {
    const l = () => setUrl(cached?.logoUrl ?? null)
    listeners.add(l)
    void fetchBrandingSetting()
    return () => { listeners.delete(l) }
  }, [])
  return url
}
